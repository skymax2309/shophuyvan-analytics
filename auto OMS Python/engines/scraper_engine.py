import asyncio
import json
import urllib.request
import datetime
import re

class ScraperEngine:
    def __init__(self, log_func):
        self.log = log_func

    async def scrape_all_new_orders(self, playwright, shops, var_headless):
        """Vòng lặp chính quét đơn từ tất cả shop"""
        if not shops:
            self.log("⚠️ Chưa chọn shop nào để quét đơn.")
            return

        for shop in shops:
            try:
                context = await playwright.chromium.launch_persistent_context(
                    user_data_dir=shop["profile_dir"],
                    channel="chrome",
                    headless=var_headless,
                    args=["--disable-blink-features=AutomationControlled"]
                )
                page = context.pages[0]

                platform = shop.get("platform", "shopee")
                if platform == "shopee":
                    await self.scrape_new_orders_shopee(page, shop)
                elif platform == "lazada":
                    await self.scrape_new_orders_lazada(page, shop)
                elif platform == "tiktok":
                    await self.scrape_new_orders_tiktok(page, shop)

                await context.close()
            except Exception as e:
                self.log(f"❌ Lỗi scrape đơn shop {shop['ten_shop']}: {str(e)}")

    async def scrape_new_orders_shopee(self, page, shop):
        """
        Quét 5 loại trạng thái đơn Shopee từ trang LIST (không cần click từng đơn).
        Mỗi URL tương ứng 1 trạng thái, lấy đủ: mã đơn, SP, SKU, SL, doanh thu, ĐVVC.
        """
        import re, datetime

        # ── Định nghĩa 5 URL cần quét ────────────────────────────────────────
        SCAN_TARGETS = [
            {
                "url": "https://banhang.shopee.vn/portal/sale/order?type=toship&source=to_process&sort_by=ship_by_date_asc",
                "oms_status":      "PENDING",
                "shipping_status": "Chờ xác nhận",
                "label":           "Chờ xác nhận (mới)",
            },
            {
                "url": "https://banhang.shopee.vn/portal/sale/order?type=unpaid",
                "oms_status":      "PENDING",
                "shipping_status": "Chờ thanh toán",
                "label":           "Chưa thanh toán",
            },
            {
                "url": "https://banhang.shopee.vn/portal/sale/order?type=shipping",
                "oms_status":      "SHIPPING",
                "shipping_status": "Đã giao cho vận chuyển",
                "label":           "Đang giao hàng",
            },
            {
                "url": "https://banhang.shopee.vn/portal/sale/order?type=completed",
                "oms_status":      "COMPLETED",
                "shipping_status": "Đã giao thành công",
                "label":           "Đã hoàn thành",
            },
            {
                "url": "https://banhang.shopee.vn/portal/sale/returnrefundcancel",
                "oms_status":      "CANCELLED",
                "shipping_status": "Trả hàng/Hoàn tiền",
                "label":           "Trả hàng/Hoàn tiền/Huỷ",
            },
        ]

        def parse_money(text: str) -> float:
            """Chuyển chuỗi '₫8.820' hoặc '8,820' thành float 8820.0"""
            cleaned = re.sub(r'[^\d]', '', text)
            return float(cleaned) if cleaned else 0.0

        async def scrape_one_page(target: dict):
            """Quét 1 URL, trả về (orders[], items[])"""
            orders, items = [], []
            try:
                await page.goto(target["url"], wait_until="commit", timeout=60000)
            except:
                pass

            self.log(f"  ⏳ [{target['label']}] Đang đợi danh sách...")
            try:
                await page.wait_for_selector(
                    "[class*='order-item'], [class*='order-row'], "
                    "[class*='shipment-item'], [class*='table-body']",
                    timeout=20000
                )
            except:
                self.log(f"  ℹ️ [{target['label']}] Không có đơn nào.")
                return orders, items

            # Scroll để lazy-load
            await asyncio.sleep(3)
            for _ in range(3):
                await page.mouse.wheel(0, 800)
                await asyncio.sleep(1)

            # ── Dùng JS để extract toàn bộ dữ liệu từ DOM ─────────────────
            raw_orders = await page.evaluate(r"""
                () => {
                    const result = [];

                    // Mỗi "đơn hàng" là 1 block chứa mã đơn + các sản phẩm
                    // Shopee thường dùng cấu trúc: header row (mã đơn) + product rows bên dưới

                    // Lấy tất cả element chứa "Mã đơn hàng"
                    const allText = document.querySelectorAll('*');
                    const orderBlocks = [];

                    // Tìm các container chứa mã đơn - thường là div/section cấp cao
                    // Shopee: mỗi đơn là 1 <div> lớn có text "Mã đơn hàng XXXXXX"
                    const walker = document.createTreeWalker(
                        document.body, NodeFilter.SHOW_TEXT, null
                    );
                    const orderIdPattern = /Mã đơn hàng\s*([A-Z0-9]{10,20})/;
                    const seenIds = new Set();

                    let node;
                    while (node = walker.nextNode()) {
                        const match = node.textContent.match(orderIdPattern);
                        if (match) {
                            const orderId = match[1].trim();
                            if (seenIds.has(orderId)) continue;
                            seenIds.add(orderId);

                            // Leo lên để tìm container đơn hàng (4-6 cấp)
                            let container = node.parentElement;
                            for (let i = 0; i < 8; i++) {
                                if (!container || !container.parentElement) break;
                                const h = container.getBoundingClientRect().height;
                                if (h > 100) break;
                                container = container.parentElement;
                            }

                            // Lấy thông tin từ container
                            const containerText = container ? container.innerText : '';

                            // Lấy doanh thu - tìm "₫" gần nhất
                            let revenue = 0;
                            const moneyEls = container
                                ? container.querySelectorAll('[class*="price"],[class*="money"],[class*="amount"]')
                                : [];
                            for (const el of moneyEls) {
                                const t = el.innerText.replace(/[^\d]/g,'');
                                if (t && parseInt(t) > revenue) revenue = parseInt(t);
                            }

                            // Lấy ĐVVC
                            let carrier = '';
                            const carrierEl = container
                                ? container.querySelector('[class*="carrier"],[class*="logistic"],[class*="shipping-provider"]')
                                : null;
                            if (carrierEl) carrier = carrierEl.innerText.trim();

                            // Lấy username khách
                            let customer = '';
                            const buyerEl = container
                                ? container.querySelector('[class*="buyer"],[class*="username"],[class*="customer"]')
                                : null;
                            if (buyerEl) customer = buyerEl.innerText.trim();

                            // Lấy toàn bộ text của container để parse SP
                            result.push({
                                order_id:      orderId,
                                revenue:       revenue,
                                carrier:       carrier,
                                customer:      customer,
                                raw_text:      containerText,
                            });
                        }
                    }
                    return result;
                }
            """)

            now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            for rd in raw_orders:
                order_id = rd.get("order_id", "").strip()
                if not order_id or len(order_id) < 8:
                    continue

                revenue   = float(rd.get("revenue", 0) or 0)
                carrier   = rd.get("carrier", "")
                customer  = rd.get("customer", "")
                raw_text  = rd.get("raw_text", "")

                # ── Parse sản phẩm từ raw_text ─────────────────────────────
                order_items = []
                lines = [l.strip() for l in raw_text.split("\n") if l.strip()]

                i = 0
                while i < len(lines):
                    line = lines[i]

                    # Bỏ qua các dòng header/footer
                    skip_keywords = [
                        "Mã đơn hàng", "Tổng số tiền", "Trang thái", "Đơn vị vận chuyển",
                        "Thao tác", "Chuẩn bị hàng", "Chờ lấy hàng", "Hạn giao",
                        "Cần được xử lý", "SPX", "Nhanh", "Drop off", "Pickup",
                        "Thanh toán khi", "ShopeePay", "Ngân hàng",
                    ]
                    if any(kw in line for kw in skip_keywords):
                        i += 1
                        continue

                    # Dòng tiền thuần (₫ hoặc toàn số với dấu chấm/phẩy)
                    if re.match(r'^[₫đ]?[\d,\.]+$', line):
                        i += 1
                        continue

                    # Kiểm tra: dòng này có phải tên sản phẩm không?
                    # Tên SP thường dài > 10 ký tự, chứa chữ cái
                    if len(line) < 8 or not re.search(r'[A-Za-zÀ-ỹ]', line):
                        i += 1
                        continue

                    # Đây có thể là tên sản phẩm
                    product_name = line
                    sku = ""
                    qty = 1
                    price = 0.0
                    i += 1

                    # Đọc các dòng tiếp theo trong block sản phẩm
                    while i < len(lines):
                        next_line = lines[i]

                        # Dòng SKU / Variation
                        if re.match(r'^(Variation|Phân loại|SKU phân loại|SKU:|Model)[\s:]+', next_line, re.IGNORECASE):
                            sku_part = re.split(r'[\s:]+', next_line, maxsplit=1)
                            sku = sku_part[-1].strip() if len(sku_part) > 1 else next_line
                            # Trường hợp "[SKU123]" trong ngoặc vuông
                        elif re.match(r'^\[.+\]$', next_line):
                            sku = next_line.strip("[]")
                        # Dòng số lượng "x1", "x2", ... hoặc chỉ "1", "2"
                        elif re.match(r'^x?\d+$', next_line) and int(re.sub(r'\D','',next_line)) < 1000:
                            qty = int(re.sub(r'\D', '', next_line))
                        # Dòng giá tiền
                        elif re.match(r'^[₫đ]?[\d,\.]+$', next_line):
                            val = parse_money(next_line)
                            if val > price:
                                price = val
                            i += 1
                            break
                        # Dòng mới có vẻ là tên SP khác → kết thúc block này
                        elif len(next_line) > 10 and re.search(r'[A-Za-zÀ-ỹ]', next_line) \
                                and not re.match(r'^(Variation|Phân loại|SKU)', next_line, re.IGNORECASE):
                            break
                        i += 1

                    if product_name and len(product_name) > 5:
                        line_rev = price * qty if price > 0 else 0.0
                        order_items.append({
                            "order_id":     order_id,
                            "sku":          sku,
                            "product_name": product_name,
                            "qty":          qty,
                            "revenue_line": line_rev,
                            "cost_real":    0.0,
                            "cost_invoice": 0.0,
                        })

                # Nếu không parse được SP nào nhưng có revenue → tạo 1 item placeholder
                if not order_items and revenue > 0:
                    order_items.append({
                        "order_id":     order_id,
                        "sku":          "",
                        "product_name": "(Chưa parse được tên SP)",
                        "qty":          1,
                        "revenue_line": revenue,
                        "cost_real":    0.0,
                        "cost_invoice": 0.0,
                    })

                orders.append({
                    "order_id":          order_id,
                    "platform":          "shopee",
                    "shop":              str(shop["ten_shop"]),
                    "order_date":        now_str,
                    "order_type":        "normal",
                    "oms_status":        target["oms_status"],
                    "shipping_status":   target["shipping_status"],
                    "customer_name":     customer,
                    "customer_phone":    "",
                    "revenue":           revenue,
                    "raw_revenue":       revenue,
                    "net_revenue":       0.0,
                    "cost_invoice":      0.0,
                    "cost_real":         0.0,
                    "fee":               0.0,
                    "profit_invoice":    0.0,
                    "profit_real":       0.0,
                    "tax_flat":          0.0,
                    "tax_income":        0.0,
                    "fee_platform":      0.0,
                    "fee_payment":       0.0,
                    "fee_affiliate":     0.0,
                    "fee_ads":           0.0,
                    "fee_piship":        0.0,
                    "fee_service":       0.0,
                    "fee_packaging":     0.0,
                    "fee_operation":     0.0,
                    "fee_labor":         0.0,
                    "cancel_reason":     "",
                    "return_fee":        0.0,
                    "shipped":           1 if target["oms_status"] in ("SHIPPING","COMPLETED") else 0,
                    "discount_shop":     0.0,
                    "discount_shopee":   0.0,
                    "discount_combo":    0.0,
                    "shipping_return_fee": 0.0,
                    "shipping_carrier":  carrier,
                    "tracking_number":   "",
                })
                items.extend(order_items)
                self.log(f"    ✔ {order_id} | {len(order_items)} SP | {revenue:,.0f}đ | {carrier}")

            return orders, items

        # ── CHẠY TUẦN TỰ 5 URL ───────────────────────────────────────────────
        self.log(f"\n📦 [{shop['ten_shop']}] Bắt đầu quét Shopee (5 trạng thái)...")
        all_orders, all_items = [], []

        for target in SCAN_TARGETS:
            self.log(f"\n🔍 Đang quét: {target['label']}")
            try:
                o, it = await scrape_one_page(target)
                all_orders.extend(o)
                all_items.extend(it)
                self.log(f"  → {len(o)} đơn, {len(it)} sản phẩm")
            except Exception as e:
                self.log(f"  ❌ Lỗi quét [{target['label']}]: {str(e)}")
            await asyncio.sleep(2)

        # ── GỬI TẤT CẢ VỀ OMS ───────────────────────────────────────────────
        if all_orders:
            try:
                api_url = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/import-orders-v2"
                payload = json.dumps({"orders": all_orders, "items": all_items}).encode('utf-8')
                req = urllib.request.Request(
                    api_url, data=payload, method='POST',
                    headers={'Content-Type': 'application/json', 'User-Agent': 'HuyVanBot/2.0'}
                )
                with urllib.request.urlopen(req, timeout=30) as res:
                    result = json.loads(res.read().decode())
                    self.log(
                        f"\n✅ [{shop['ten_shop']}] Import thành công: "
                        f"{len(all_orders)} đơn | {len(all_items)} sản phẩm"
                    )
            except Exception as e:
                self.log(f"❌ Lỗi gửi API OMS: {str(e)}")
        else:
            self.log(f"ℹ️ [{shop['ten_shop']}] Không tìm thấy đơn nào trên cả 5 trạng thái.")

    async def scrape_new_orders_lazada(self, page, shop):
        """Scrape đơn hàng mới từ Lazada Seller Center"""
        self.log(f"📦 [{shop['ten_shop']}] Đang lấy đơn mới Lazada...")
        try:
            await page.goto("https://sellercenter.lazada.vn/portal/apps/seller-order-manage/orders",
                            wait_until="domcontentloaded")
            await asyncio.sleep(6)
            orders = []
            rows = await page.query_selector_all('[class*="order-item-wrap"], [class*="order-row"]')
            for row in rows[:50]:
                try:
                    order_id_el = await row.query_selector('[class*="order-id"], [class*="orderId"]')
                    order_id = (await order_id_el.inner_text()).strip() if order_id_el else ""
                    if not order_id:
                        continue
                    orders.append({
                        "order_id":        order_id,
                        "platform":        "lazada",
                        "shop":            shop["ten_shop"],
                        "order_date":      __import__('datetime').date.today().isoformat(),
                        "order_type":      "normal",
                        "oms_status":      "PENDING",
                        "shipping_status": "Chờ xác nhận",
                        "revenue": 0, "raw_revenue": 0,
                        "cost_invoice": 0, "cost_real": 0,
                        "fee": 0, "profit_invoice": 0, "profit_real": 0,
                        "tax_flat": 0, "tax_income": 0,
                        "fee_platform": 0, "fee_payment": 0, "fee_affiliate": 0, "fee_ads": 0,
                        "fee_piship": 0, "fee_service": 0, "fee_packaging": 0,
                        "fee_operation": 0, "fee_labor": 0,
                        "cancel_reason": None, "return_fee": 0, "shipped": 0,
                        "discount_shop": 0, "discount_shopee": 0,
                        "discount_combo": 0, "shipping_return_fee": 0,
                    })
                except:
                    continue
            if orders:
                api_url = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/import-orders-v2"
                data = json.dumps({"orders": orders, "items": []}).encode('utf-8')
                req = urllib.request.Request(api_url, data=data,
                    headers={'Content-Type': 'application/json', 'User-Agent': 'HuyVanBot/2.0'},
                    method='POST')
                with urllib.request.urlopen(req, timeout=30) as res:
                    result = json.loads(res.read().decode())
                    self.log(f"✅ Đã import {result.get('imported_orders',0)} đơn mới Lazada")
        except Exception as e:
            self.log(f"⚠️ Lỗi scrape đơn Lazada: {str(e)}")

    async def scrape_new_orders_tiktok(self, page, shop):
        """Scrape đơn hàng mới từ TikTok Shop Seller Center"""
        self.log(f"📦 [{shop['ten_shop']}] Đang lấy đơn mới TikTok...")
        try:
            await page.goto("https://seller-vn.tiktok.com/order/list?status=AWAITING_SHIPMENT",
                            wait_until="domcontentloaded")
            await asyncio.sleep(6)
            orders = []
            rows = await page.query_selector_all('[class*="order-item"], [class*="orderItem"]')
            for row in rows[:50]:
                try:
                    order_id_el = await row.query_selector('[class*="order-id"], [class*="orderId"]')
                    order_id = (await order_id_el.inner_text()).strip() if order_id_el else ""
                    if not order_id:
                        continue
                    orders.append({
                        "order_id":        order_id,
                        "platform":        "tiktok",
                        "shop":            shop["ten_shop"],
                        "order_date":      __import__('datetime').date.today().isoformat(),
                        "order_type":      "normal",
                        "oms_status":      "PENDING",
                        "shipping_status": "Chờ xác nhận",
                        "revenue": 0, "raw_revenue": 0,
                        "cost_invoice": 0, "cost_real": 0,
                        "fee": 0, "profit_invoice": 0, "profit_real": 0,
                        "tax_flat": 0, "tax_income": 0,
                        "fee_platform": 0, "fee_payment": 0, "fee_affiliate": 0, "fee_ads": 0,
                        "fee_piship": 0, "fee_service": 0, "fee_packaging": 0,
                        "fee_operation": 0, "fee_labor": 0,
                        "cancel_reason": None, "return_fee": 0, "shipped": 0,
                        "discount_shop": 0, "discount_shopee": 0,
                        "discount_combo": 0, "shipping_return_fee": 0,
                    })
                except:
                    continue
            if orders:
                api_url = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/import-orders-v2"
                data = json.dumps({"orders": orders, "items": []}).encode('utf-8')
                req = urllib.request.Request(api_url, data=data,
                    headers={'Content-Type': 'application/json', 'User-Agent': 'HuyVanBot/2.0'},
                    method='POST')
                with urllib.request.urlopen(req, timeout=30) as res:
                    result = json.loads(res.read().decode())
                    self.log(f"✅ Đã import {result.get('imported_orders',0)} đơn mới TikTok")
        except Exception as e:
            self.log(f"⚠️ Lỗi scrape đơn TikTok: {str(e)}")