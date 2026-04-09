import asyncio
import os
import json
import urllib.request
import traceback
from playwright.async_api import async_playwright
from utils import process_and_sync_files

class ShopeeProductsBrowser:
    def __init__(self, log_func, auth):
        self.log = log_func
        self.auth = auth
        self.api_log_url = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/logs?token=huyvan_secret_2026" 

    def log_and_send(self, message, is_error=False, shop_name="System"):
        prefix = "❌ [LỖI SHOPEE CHROME]" if is_error else "ℹ️ [INFO]"
        full_msg = f"{prefix} {message}"
        self.log(full_msg)
        
        if is_error:
            try:
                data = json.dumps({
                    "shop": shop_name,
                    "platform": "shopee",
                    "module": "ShopeeProductsBrowser",
                    "error_message": full_msg,
                    "traceback": traceback.format_exc()
                }).encode('utf-8')
                headers = {'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
                req = urllib.request.Request(self.api_log_url, data=data, headers=headers, method='POST')
                urllib.request.urlopen(req, timeout=10)
            except Exception as e:
                self.log(f"⚠️ Không thể gửi log lên server: {str(e)}")

    async def tai_va_dong_bo_san_pham_excel(self, page, shop):
        self.log("-------------------------------------------------")
        self.log(f"🐌 Bắt đầu tự động tải file Excel bằng Chrome cho shop: {shop['ten_shop']}")
        try:
            await page.goto("https://banhang.shopee.vn/portal/product-mass/mass-update/download", wait_until="commit")
            await asyncio.sleep(5)

            try:
                self.log("   ⚙️ CÀI ĐẶT BỘ LỌC: Đang loại bỏ các sản phẩm hết hàng...")
                filter_card = page.locator('#mass-update-filter-card')
                custom_radio = filter_card.locator('label.eds-radio').nth(1)
                if await custom_radio.is_visible():
                    await custom_radio.click()
                    await asyncio.sleep(1.5)
                    min_stock_input = filter_card.locator('input.eds-input__input').first
                    if await min_stock_input.is_visible():
                        await min_stock_input.fill("") 
                        await min_stock_input.fill("1")
                        self.log("   ✅ Đã gài thành công bộ lọc: Chỉ tải sản phẩm có Tồn kho >= 1.")
                    await asyncio.sleep(1.5)
            except Exception as e:
                self.log(f"   ⚠️ Lỗi cài bộ lọc (Bot sẽ bỏ qua và tải toàn bộ SP): {e}")

            file_types = {
                "basic": "Thông tin cơ bản",
                "sales": "Thông tin bán hàng",
                "media": "Hình ảnh"
            }

            current_dir = os.path.dirname(os.path.abspath(__file__))
            downloaded_paths = {}

            for key, tab_name in file_types.items():
                self.log(f"👉 Đang xử lý mục: {tab_name}...")
                await page.locator(f".eds-radio__label:has-text('{tab_name}')").first.click(force=True)
                await asyncio.sleep(1.5)

                await page.locator("button:has-text('Tải về')").first.click()
                self.log(f"⏳ Đã yêu cầu xuất file {tab_name}, đang chờ Shopee xử lý...")

                file_ready = False
                for _ in range(40):
                    await asyncio.sleep(3)
                    btn_download = page.locator("tbody tr").first.locator("button:has-text('Tải về')")
                    if await btn_download.count() > 0 and await btn_download.is_visible() and not await btn_download.is_disabled():
                        file_ready = True
                        break

                if not file_ready:
                    self.log_and_send(f"Quá thời gian chờ Shopee xuất file {tab_name}.", is_error=True, shop_name=shop['ten_shop'])
                    return False

                self.log(f"📥 File {tab_name} đã sẵn sàng, tiến hành tải về máy...")
                async with page.expect_download() as download_info:
                    await page.locator("tbody tr").first.locator("button:has-text('Tải về')").click()

                download = await download_info.value
                ext = ".xlsx" if "xlsx" in download.suggested_filename else ".csv"
                safe_shop_name = shop['ten_shop'].replace("/", "_").replace("\\", "_")
                save_path = os.path.join(current_dir, f"{key}_{safe_shop_name}{ext}")
                
                await download.save_as(save_path)
                downloaded_paths[key] = save_path
                self.log(f"✅ Đã lưu thành công: {os.path.basename(save_path)}")
                await asyncio.sleep(2)

            self.log("🎉 Đã cào thành công 3 file từ Shopee. Bắt đầu ghép nối dữ liệu...")
            process_and_sync_files(shop['ten_shop'], downloaded_paths, self.log)
            
        except Exception as e:
            self.log_and_send(f"Lỗi khi tải file Excel sản phẩm: {e}", is_error=True, shop_name=shop['ten_shop'])

    async def sync_by_browser(self, danh_sach_shop, chosen_shop_name):
        chosen = chosen_shop_name
        shops_to_run = [s for s in danh_sach_shop if s.get("platform") == "shopee" and (chosen == "Tất cả shop" or s["ten_shop"] == chosen)]

        if not shops_to_run:
            self.log("⚠️ Không tìm thấy shop Shopee nào!")
            return

        async with async_playwright() as pw:
            for shop in shops_to_run:
                self.log(f"\n{'='*50}")
                self.log(f"🛍️ [{shop['ten_shop']}] Bắt đầu đồng bộ sản phẩm bằng Chrome...")

                browser = await pw.chromium.launch_persistent_context(
                    shop["profile_dir"],
                    channel="chrome",
                    headless=False,
                    slow_mo=300,
                    handle_sigint=False,
                    handle_sigterm=False,
                    handle_sighup=False,
                    ignore_default_args=["--disable-component-update"],
                    args=["--no-sandbox", "--disable-blink-features=AutomationControlled", "--disable-dev-shm-usage"],
                    viewport={"width": 1280, "height": 900},
                    timeout=60000
                )
                page = browser.pages[0] if browser.pages else await browser.new_page()
                all_products = []
                page_num = 1

                while True:
                    list_url = f"https://banhang.shopee.vn/portal/product/list/live/all?operationSortBy=recommend_v2&page={page_num}&size=48"
                    self.log(f"  📄 Đang tải trang danh sách {page_num}...")
                    await page.goto(list_url, wait_until="commit", timeout=60000)
                    await asyncio.sleep(8)

                    if "login" in page.url:
                        self.log("  ⚠️ Shopee yêu cầu đăng nhập...")
                        try:
                            await page.wait_for_selector('input[placeholder*="Email/Số điện thoại/Tên đăng nhập"]', timeout=10000)
                            if shop.get("tai_khoan"):
                                await page.locator('input[placeholder*="Email/Số điện thoại/Tên đăng nhập"]').fill(shop["tai_khoan"])
                                await asyncio.sleep(1)
                            if shop.get("mat_khau"):
                                await page.locator('input[placeholder*="Mật khẩu"], input[type="password"]').first.fill(shop["mat_khau"])
                                await asyncio.sleep(1)
                                btn_login = page.locator('button:has-text("ĐĂNG NHẬP"), button:has-text("Đăng nhập")').first
                                if await btn_login.is_visible(): await btn_login.click(force=True)
                                else: await page.keyboard.press("Enter")
                                self.log("  🔑 Đã bấm Đăng nhập, chờ 12s để load vào trong...")
                                await asyncio.sleep(12)
                        except Exception as e:
                            self.log(f"  ❌ Lỗi điền tự động đăng nhập: {e}")

                    pass_input = await page.query_selector('input[type="password"]')
                    if pass_input and shop.get("mat_khau"):
                        self.log("  🔒 Nhập lại mật khẩu bảo mật...")
                        await page.fill('input[type="password"]', shop["mat_khau"])
                        await page.keyboard.press("Enter")
                        await asyncio.sleep(8)

                    try:
                        await page.wait_for_selector('a[href*="/portal/product/"]', timeout=20000)
                    except:
                        self.log("  ℹ️ Không còn sản phẩm hoặc không load được trang, dừng.")
                        break

                    links = await page.evaluate(r"""
                        () => {
                            const seen = new Set();
                            const results = [];
                            document.querySelectorAll('a[href*="/portal/product/"]').forEach(a => {
                                const m = a.href.match(/\/portal\/product\/(\d+)/);
                                if (m && !seen.has(m[1])) {
                                    seen.add(m[1]);
                                    results.push({ item_id: m[1], href: a.href });
                                }
                            });
                            return results;
                        }
                    """)

                    if not links:
                        self.log(f"  ℹ️ Trang {page_num} không có sản phẩm, dừng.")
                        break

                    self.log(f"  → Tìm thấy {len(links)} sản phẩm trang {page_num}, bắt đầu vào từng trang chi tiết...")

                    for idx, link_info in enumerate(links):
                        item_id = link_info["item_id"]
                        detail_url = f"https://banhang.shopee.vn/portal/product/{item_id}"
                        self.log(f"    [{idx+1}/3] Đang lấy SP {item_id}...")

                        try:
                            await page.goto(detail_url, wait_until="commit", timeout=60000)
                            import random
                            delay_sp = random.randint(5, 8)
                            self.log(f"    ⏳ Chờ {delay_sp}s để an toàn...")
                            await asyncio.sleep(delay_sp)

                            try:
                                await page.wait_for_selector('input[placeholder*="Tên sản phẩm"], .product-edit__name, [class*="product-name"]', timeout=15000)
                            except:
                                self.log(f"    ⚠️ SP {item_id}: trang chưa load đủ, bỏ qua")
                                continue

                            # 🌟 QUY TẮC 19: ĐÃ GỠ BỎ MÃ FALLBACK TRONG SCRIPT DƯỚI ĐÂY
                            product_data = await page.evaluate(r"""
                                (itemId) => {
                                    const result = { item_id: itemId, product_name: '', description: '', images: [], variations: [], debug: [] };
                                    result.debug.push("--- BẮT ĐẦU DÒ MÌN SẢN PHẨM " + itemId + " ---");

                                    const nameEl = document.querySelector('input[placeholder*="Tên sản phẩm"], textarea[placeholder*="Tên sản phẩm"]');
                                    result.product_name = nameEl ? nameEl.value.trim() : '';

                                    const imgEls = document.querySelectorAll('[class*="image-upload"] img, [class*="product-image"] img');
                                    imgEls.forEach(img => {
                                        if (img.src && img.src.startsWith('http') && !result.images.includes(img.src)) result.images.push(img.src);
                                    });

                                    const allBodies = Array.from(document.querySelectorAll('.variation-model-table-body'));
                                    if (allBodies.length >= 2) {
                                        const leftRows = Array.from(allBodies[0].children);
                                        leftRows.forEach((lRow, idx) => {
                                            let txt = lRow.innerText.replace(/Thêm|Nhập|Sửa/g, '').trim(); 
                                            const vName = txt ? txt.split('\n')[0] : `Phân loại ${idx + 1}`;

                                            let vImg = '';
                                            const imgEl = lRow.querySelector('img');
                                            if (imgEl && imgEl.src && imgEl.src.startsWith('http')) vImg = imgEl.src;
                                            else {
                                                const bgEl = lRow.querySelector('[style*="background-image"]');
                                                if (bgEl && bgEl.style.backgroundImage) {
                                                    const match = bgEl.style.backgroundImage.match(/url\(['"]?(.*?)['"]?\)/);
                                                    if (match) vImg = match[1];
                                                }
                                            }

                                            const rowInputs = [];
                                            const rightNodes = []; 
                                            for (let i = 1; i < allBodies.length; i++) {
                                                const rRowNode = allBodies[i].children[idx];
                                                if (rRowNode) {
                                                    rightNodes.push(rRowNode);
                                                    rowInputs.push(...Array.from(rRowNode.querySelectorAll('input, textarea')));
                                                }
                                            }

                                            let price = 0, stock = 0, skuVal = '';
                                            const visibleInputs = rowInputs.filter(i => i.getBoundingClientRect().width > 0);
                                            visibleInputs.sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x);
                                            
                                            if(visibleInputs.length >= 2) {
                                                price = parseFloat((visibleInputs[0].value || '').replace(/[^\d]/g,'')) || 0;
                                                stock = parseInt((visibleInputs[1].value || '').replace(/[^\d]/g,'')) || 0;
                                            }
                                            if(visibleInputs.length >= 3) {
                                                let tempVal = (visibleInputs[2].value || '').trim();
                                                if (!tempVal.toLowerCase().includes('item without')) skuVal = tempVal;
                                            }

                                            if (!skuVal) {
                                                for (let inp of rowInputs) {
                                                    let val = (inp.value || '').trim();
                                                    if (val && val !== price.toString() && val !== stock.toString() && !val.toLowerCase().includes('item without') && !val.toLowerCase().includes('nhập')) {
                                                        skuVal = val; break;
                                                    }
                                                }
                                            }
                                            
                                            if (!skuVal) {
                                                for (let rNode of rightNodes) {
                                                    const cells = Array.from(rNode.children);
                                                    if (cells.length >= 3) {
                                                        const lines = (cells[2].innerText || '').split('\n').map(l => l.trim()).filter(l => l);
                                                        for (let l of lines) {
                                                            if (l && !l.toLowerCase().includes('nhập') && !l.toLowerCase().includes('item without')) { skuVal = l; break; }
                                                        }
                                                    }
                                                    if (skuVal) break;
                                                }
                                            }

                                            if (!skuVal) {
                                                for (let rNode of rightNodes) {
                                                    const allLeafNodes = Array.from(rNode.querySelectorAll('*')).filter(el => el.children.length === 0 && (el.innerText || '').trim() !== '');
                                                    for (let node of allLeafNodes) {
                                                        let t = (node.innerText || '').trim();
                                                        let tLow = t.toLowerCase();
                                                        if (t.length >= 2 && !tLow.includes('item without') && tLow !== 'false' && tLow !== 'true' && !tLow.includes('nhập') && !tLow.includes('giá') && !tLow.includes('giảm') && !t.includes('₫') && !t.includes('%')) {
                                                            if (t.replace(/[^\d]/g,'') !== price.toString() && t.replace(/[^\d]/g,'') !== stock.toString()) { skuVal = t; break; }
                                                        }
                                                    }
                                                    if (skuVal) break;
                                                }
                                            }
                                            
                                            if (!skuVal) skuVal = ''; // Không tạo mã giả

                                            if (price > 0 || stock > 0) {
                                                result.variations.push({ variation_name: vName, sku: skuVal, price: price, stock: stock, variation_image: vImg });
                                                result.debug.push(`[BẮT ĐƯỢC] '${vName}' - SKU: '${skuVal}', Giá: ${price}, Kho: ${stock}`);
                                            }
                                        });
                                    } 
                                    
                                    if (result.variations.length === 0) {
                                        result.debug.push("Không thấy bảng phân loại, dùng thuật toán Vị trí Tương đối...");
                                        let pPrice = 0, pStock = 0, pSku = '';
                                        const allInputs = Array.from(document.querySelectorAll('input:not([type="hidden"])'));
                                        let priceIndex = -1;
                                        
                                        for (let i = 0; i < allInputs.length; i++) {
                                            const inp = allInputs[i];
                                            const text = (inp.parentElement?.parentElement?.innerText || '').toLowerCase();
                                            const p = (inp.placeholder || '').toLowerCase();
                                            if (text.includes('₫') || p.includes('giá') || p.includes('price')) {
                                                pPrice = parseFloat(inp.value.replace(/[^\d]/g,'')) || 0;
                                                priceIndex = i;
                                                break;
                                            }
                                        }

                                        if (priceIndex !== -1) {
                                            const stockInp = allInputs[priceIndex + 1];
                                            if (stockInp) pStock = parseInt(stockInp.value.replace(/[^\d]/g,'')) || 0;

                                            const skuInp = allInputs[priceIndex + 2];
                                            if (skuInp) {
                                                const skuText = (skuInp.parentElement?.parentElement?.innerText || '').toLowerCase();
                                                if (!skuText.includes('gr') && !skuText.includes('kg') && !skuText.includes('cm') && !skuText.includes('đơn vị')) {
                                                    pSku = skuInp.value.trim();
                                                }
                                            }
                                        }

                                        if (!pSku) pSku = ''; // Không tạo mã giả

                                        if (pPrice > 0 || pStock > 0 || pSku !== '') {
                                            result.variations.push({ variation_name: "Mặc định", sku: pSku, price: pPrice, stock: pStock, variation_image: '' });
                                            result.debug.push(`[BẮT ĐƯỢC MẶC ĐỊNH] SKU: '${pSku}', Giá: ${pPrice}, Kho: ${pStock}`);
                                        }
                                    }

                                    return result;
                                }
                            """, item_id)

                            if product_data and "debug" in product_data:
                                for dbg in product_data["debug"]: self.log("      🕵️ " + dbg)

                            if not product_data: continue

                            product_data["shop"] = shop["ten_shop"]
                            product_data["platform"] = "shopee"
                            # Bổ sung Parent SKU rỗng vì JS DOM không bắt Parent SKU (nếu cần bắt bác bổ sung sau)
                            product_data["parent_sku"] = ""

                            pname = product_data.get("product_name", "") or f"SP_{item_id}"
                            nvar  = len(product_data.get("variations", []))
                            nimg  = len(product_data.get("images", []))
                            self.log(f"    ✔ {pname[:40]} — {nvar} phân loại, {nimg} ảnh")

                            all_products.append(product_data)

                        except Exception as e:
                            self.log_and_send(f"Lỗi lấy thông tin SP {item_id}: {str(e)[:80]}", is_error=True, shop_name=shop['ten_shop'])
                            continue

                    if all_products:
                        self.log(f"\n📤 Chuẩn bị gửi {len(all_products)} sản phẩm của Trang {page_num} vào Trạm trung chuyển (Hub)...")
                        import sys, os
                        sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
                        try:
                            from engines.product_core_hub import ProductCoreHub
                            hub = ProductCoreHub(self.log)
                            shop_id = shop.get("user_name") or shop.get("ten_shop")
                            is_success = hub.sync_products(shop_id, "shopee", all_products)
                            if is_success: self.log(f"✅ Trang {page_num} hoàn tất trọn vẹn!")
                            else: self.log(f"⚠️ Trang {page_num} có lỗi trong quá trình đẩy dữ liệu.")
                        except Exception as e:
                            self.log(f"❌ Lỗi bất ngờ khi gọi Hub Trang {page_num}: {str(e)}")
                        
                        all_products.clear()

                    has_next = await page.evaluate(
                        "() => {"
                        "   const btns = document.querySelectorAll('button, [class*=\"next\"], [aria-label*=\"next\"], [aria-label*=\"Next\"]');"
                        "   for (const b of btns) {"
                        "       const txt = (b.innerText || b.getAttribute('aria-label') || '').toLowerCase();"
                        "       if ((txt.includes('tiếp') || txt.includes('next')) && !b.disabled) return true;"
                        "   }"
                        "   return false;"
                        "}"
                    )
                    
                    if not has_next:
                        self.log(f"  ✅ Đã quét xong tất cả các trang danh sách của shop {shop['ten_shop']}.")
                        break
                        
                    page_num += 1
                    import random
                    delay_trang = random.randint(15, 30)
                    self.log(f"  ⏳ Nghỉ ngơi {delay_trang}s trước khi sang trang {page_num} để lách Anti-Bot...")
                    await asyncio.sleep(delay_trang)

                await browser.close()
