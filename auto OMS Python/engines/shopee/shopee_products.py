import asyncio
import os
import json
import urllib.request
import random
from utils import upload_to_r2, process_and_sync_files

class ShopeeProducts:
    def __init__(self, log_func, auth):
        self.log = log_func
        self.auth = auth

    async def tai_va_dong_bo_san_pham_excel(self, page, shop):
        self.log(f"🤖 Bắt đầu tự động tải file Excel cho shop: {shop['ten_shop']}")
        await page.goto("https://banhang.shopee.vn/portal/product-mass/mass-update/download", wait_until="commit")
        await asyncio.sleep(5)

        # Định nghĩa 3 loại file cần tải dựa trên hướng dẫn của Huy
        file_types = {
            "basic": "Thông tin cơ bản",
            "sales": "Thông tin bán hàng",
            "media": "Hình ảnh"
        }

        import os
        current_dir = os.path.dirname(os.path.abspath(__file__))
        downloaded_paths = {}

        for key, tab_name in file_types.items():
            self.log(f"👉 Đang xử lý mục: {tab_name}...")
            
            # 1. Tích chọn mục tương ứng (Tìm theo class của Shopee, không phân biệt hoa thường và ép click xuyên thông báo)
            await page.locator(f".eds-radio__label:has-text('{tab_name}')").first.click(force=True)
            await asyncio.sleep(1.5)

            # 2. Bấm nút Tải về (để xuất file). Chọn nút đầu tiên trên cùng.
            await page.locator("button:has-text('Tải về')").first.click()
            self.log(f"⏳ Đã yêu cầu xuất file {tab_name}, đang chờ Shopee xử lý...")

            # 3. Chờ nút 'Đang đợi' chuyển sang 'Tải về' ở dòng ĐẦU TIÊN của bảng lịch sử
            file_ready = False
            for _ in range(40): # Lặp 40 lần, mỗi lần 3s => Chờ tối đa 2 phút
                await asyncio.sleep(3)
                btn_download = page.locator("tbody tr").first.locator("button:has-text('Tải về')")
                if await btn_download.count() > 0 and await btn_download.is_visible() and not await btn_download.is_disabled():
                    file_ready = True
                    break

            if not file_ready:
                self.log(f"❌ LỖI: Quá thời gian chờ Shopee xuất file {tab_name}.")
                return False

            # 4. Bấm Tải Về và lưu file
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
        
        # Gọi hàm xử lý và bắn lên Web từ file utils
        from utils import process_and_sync_files
        process_and_sync_files(shop['ten_shop'], downloaded_paths, self.log)

    async def sync_shopee_products(self, danh_sach_shop, chosen_shop_name):
        """
        Đồng bộ sản phẩm Shopee — vào từng trang chi tiết để lấy:
        - Tất cả hình ảnh sản phẩm
        - Tên sản phẩm, mô tả
        - Tên phân loại, hình ảnh phân loại, SKU phân loại, tồn kho, giá
        Delay 5s/sản phẩm để an toàn.
        """
        import json, urllib.request

        chosen = chosen_shop_name
        shops_to_run = [s for s in danh_sach_shop
                        if s.get("platform") == "shopee" and
                        (chosen == "Tất cả shop" or s["ten_shop"] == chosen)]

        if not shops_to_run:
            self.log("⚠️ Không tìm thấy shop Shopee nào!")
            return

        async with async_playwright() as pw:
            for shop in shops_to_run:
                self.log(f"\n{'='*50}")
                self.log(f"🛍️ [{shop['ten_shop']}] Bắt đầu đồng bộ sản phẩm...")

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

                # ── BƯỚC 1: Duyệt qua từng trang danh sách để lấy item_id ──
                while True:
                    list_url = f"https://banhang.shopee.vn/portal/product/list/live/all?operationSortBy=recommend_v2&page={page_num}&size=48"
                    self.log(f"  📄 Đang tải trang danh sách {page_num}...")
                    await page.goto(list_url, wait_until="commit", timeout=60000)
                    await asyncio.sleep(8)

                    # ── TỰ ĐỘNG ĐĂNG NHẬP NẾU BỊ VĂNG SESSION ──
                    if "login" in page.url:
                        self.log("  ⚠️ Shopee yêu cầu đăng nhập...")
                        try:
                            # Đợi ô tài khoản xuất hiện
                            await page.wait_for_selector('input[placeholder*="Email/Số điện thoại/Tên đăng nhập"]', timeout=10000)
                            
                            # Tự động điền Tài khoản dựa theo placeholder tiếng Việt
                            if shop.get("tai_khoan"):
                                await page.locator('input[placeholder*="Email/Số điện thoại/Tên đăng nhập"]').fill(shop["tai_khoan"])
                                await asyncio.sleep(1)
                            
                            # Tự động điền Mật khẩu
                            if shop.get("mat_khau"):
                                await page.locator('input[placeholder*="Mật khẩu"], input[type="password"]').first.fill(shop["mat_khau"])
                                await asyncio.sleep(1)
                                
                                # Tìm và bấm chính xác nút ĐĂNG NHẬP (dùng .first để tránh lỗi thấy 2 nút)
                                btn_login = page.locator('button:has-text("ĐĂNG NHẬP"), button:has-text("Đăng nhập")').first
                                if await btn_login.is_visible():
                                    await btn_login.click(force=True)
                                else:
                                    # Fallback: Nếu không tìm thấy nút, giả lập bấm phím Enter
                                    await page.keyboard.press("Enter")
                                
                                self.log("  🔑 Đã bấm Đăng nhập, chờ 12s để load vào trong...")
                                await asyncio.sleep(12)
                        except Exception as e:
                            self.log(f"  ❌ Lỗi điền tự động đăng nhập: {e}")

                    # ── Xử lý popup xác minh mật khẩu (nếu có) ──
                    pass_input = await page.query_selector('input[type="password"]')
                    if pass_input and shop.get("mat_khau"):
                        self.log("  🔒 Nhập lại mật khẩu bảo mật...")
                        await page.fill('input[type="password"]', shop["mat_khau"])
                        await page.keyboard.press("Enter")
                        await asyncio.sleep(8)
                    # ────────────────────────────────────────────

                    # Chờ danh sách sản phẩm hiện ra
                    try:
                        await page.wait_for_selector('a[href*="/portal/product/"]', timeout=20000)
                    except:
                        self.log("  ℹ️ Không còn sản phẩm hoặc không load được trang, dừng.")
                        break

                    # Lấy toàn bộ item_id trên trang này
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

                    # ── BƯỚC 2: Vào từng trang chi tiết sản phẩm ──────────
                    for idx, link_info in enumerate(links):

                        item_id = link_info["item_id"]
                        detail_url = f"https://banhang.shopee.vn/portal/product/{item_id}"
                        self.log(f"    [{idx+1}/3] Đang lấy SP {item_id}...")

                        try:
                            await page.goto(detail_url, wait_until="commit", timeout=60000)
                            
                            # Delay ngẫu nhiên 5 đến 8 giây cho giống người thật
                            import random
                            delay_sp = random.randint(5, 8)
                            self.log(f"    ⏳ Chờ {delay_sp}s để an toàn...")
                            await asyncio.sleep(delay_sp)

                            try:
                                await page.wait_for_selector(
                                    'input[placeholder*="Tên sản phẩm"], .product-edit__name, [class*="product-name"]',
                                    timeout=15000
                                )
                            except:
                                self.log(f"    ⚠️ SP {item_id}: trang chưa load đủ, bỏ qua")
                                continue

                            # ── Extract toàn bộ thông tin từ trang chi tiết ──
                            product_data = await page.evaluate(r"""
                                (itemId) => {
                                    const result = {
                                        item_id: itemId, product_name: '', description: '', 
                                        images: [], variations: [], debug: []
                                    };
                                    result.debug.push("--- BẮT ĐẦU DÒ MÌN SẢN PHẨM " + itemId + " ---");

                                    // 1. TÊN SẢN PHẨM
                                    const nameEl = document.querySelector('input[placeholder*="Tên sản phẩm"], textarea[placeholder*="Tên sản phẩm"]');
                                    result.product_name = nameEl ? nameEl.value.trim() : '';

                                    // 2. ẢNH SẢN PHẨM
                                    const imgEls = document.querySelectorAll('[class*="image-upload"] img, [class*="product-image"] img');
                                    imgEls.forEach(img => {
                                        if (img.src && img.src.startsWith('http') && !result.images.includes(img.src)) result.images.push(img.src);
                                    });

                                    // 3. PHÂN LOẠI & SKU (THUẬT TOÁN ĐA CỘT + TỰ SINH SKU)
                                    result.debug.push("Đang quét bảng bằng Thuật toán Đa Cột (Multi-Column)...");

                                    const allBodies = Array.from(document.querySelectorAll('.variation-model-table-body'));
                                    result.debug.push(`Phát hiện tổng cộng ${allBodies.length} khối Body cột trong bảng.`);

                                    if (allBodies.length >= 2) {
                                        const leftRows = Array.from(allBodies[0].children);
                                        
                                        leftRows.forEach((lRow, idx) => {
                                            let txt = lRow.innerText.replace(/Thêm|Nhập|Sửa/g, '').trim(); 
                                            const vName = txt ? txt.split('\n')[0] : `Phân loại ${idx + 1}`;

                                            // 🌟 Bắt hình ảnh của phân loại (Hỗ trợ cả thẻ IMG và thẻ Background)
                                            let vImg = '';
                                            const imgEl = lRow.querySelector('img');
                                            if (imgEl && imgEl.src && imgEl.src.startsWith('http')) {
                                                vImg = imgEl.src;
                                            } else {
                                                const bgEl = lRow.querySelector('[style*="background-image"]');
                                                if (bgEl && bgEl.style.backgroundImage) {
                                                    const match = bgEl.style.backgroundImage.match(/url\(['"]?(.*?)['"]?\)/);
                                                    if (match) vImg = match[1];
                                                }
                                            }

                                            const rowInputs = [];
                                            const rightNodes = []; // 🌟 Chứa các Cột để lát nữa cắt lớp
                                            
                                            for (let i = 1; i < allBodies.length; i++) {
                                                const rRowNode = allBodies[i].children[idx];
                                                if (rRowNode) {
                                                    rightNodes.push(rRowNode);
                                                    // 🌟 BÍ MẬT ĐÃ ĐƯỢC GIẢI MÃ: Shopee dùng thẻ textarea cho ô SKU!
                                                    rowInputs.push(...Array.from(rRowNode.querySelectorAll('input, textarea')));
                                                }
                                            }

                                            let price = 0, stock = 0, skuVal = '';

                                            // Lấy chuẩn xác 100% bằng cách xếp hàng từ trái qua phải
                                            const visibleInputs = rowInputs.filter(i => i.getBoundingClientRect().width > 0);
                                            visibleInputs.sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x);
                                            
                                            if(visibleInputs.length >= 2) {
                                                price = parseFloat((visibleInputs[0].value || '').replace(/[^\d]/g,'')) || 0;
                                                stock = parseInt((visibleInputs[1].value || '').replace(/[^\d]/g,'')) || 0;
                                            }
                                            if(visibleInputs.length >= 3) {
                                                let tempVal = (visibleInputs[2].value || '').trim();
                                                if (!tempVal.toLowerCase().includes('item without')) {
                                                    skuVal = tempVal;
                                                }
                                            }

                                            // 🌟 TẦNG 1: Quét Input ẩn
                                            if (!skuVal) {
                                                for (let inp of rowInputs) {
                                                    let val = (inp.value || '').trim();
                                                    if (val && val !== price.toString() && val !== stock.toString() && !val.toLowerCase().includes('item without') && !val.toLowerCase().includes('nhập')) {
                                                        skuVal = val; break;
                                                    }
                                                }
                                            }
                                            
                                            // 🌟 TẦNG 2: Phẫu thuật cắt đúng Cột 3 (Cột SKU) để lấy chữ
                                            if (!skuVal) {
                                                for (let rNode of rightNodes) {
                                                    const cells = Array.from(rNode.children);
                                                    // Cột 0: Giá, Cột 1: Kho, Cột 2: SKU
                                                    if (cells.length >= 3) {
                                                        const cellText = cells[2].innerText || '';
                                                        const lines = cellText.split('\n').map(l => l.trim()).filter(l => l);
                                                        for (let l of lines) {
                                                            if (l && !l.toLowerCase().includes('nhập') && !l.toLowerCase().includes('item without')) {
                                                                skuVal = l; break;
                                                            }
                                                        }
                                                    }
                                                    if (skuVal) break;
                                                }
                                            }

                                            // 🌟 TẦNG 3: Quét X-Ray xuyên thấu các Node lá 
                                            if (!skuVal) {
                                                for (let rNode of rightNodes) {
                                                    // Bọc (el.innerText || '') để lướt qua các thẻ SVG/Icon không có chữ của Shopee, chống lỗi crash
                                                    const allLeafNodes = Array.from(rNode.querySelectorAll('*')).filter(el => el.children.length === 0 && (el.innerText || '').trim() !== '');
                                                    for (let node of allLeafNodes) {
                                                        let t = (node.innerText || '').trim();
                                                        let tLow = t.toLowerCase();
                                                        if (t.length >= 2 && !tLow.includes('item without') && tLow !== 'false' && tLow !== 'true' && !tLow.includes('nhập') && !tLow.includes('giá') && !tLow.includes('giảm') && !t.includes('₫') && !t.includes('%')) {
                                                            if (t.replace(/[^\d]/g,'') !== price.toString() && t.replace(/[^\d]/g,'') !== stock.toString()) {
                                                                skuVal = t; break;
                                                            }
                                                        }
                                                    }
                                                    if (skuVal) break;
                                                }
                                            }
                                            
                                            // 🌟 TỰ ĐỘNG SINH MÃ SKU NẾU SẢN PHẨM ĐÓ THỰC SỰ BỊ BỎ TRỐNG
                                            if (!skuVal) skuVal = `SP_${itemId}_${idx + 1}`;

                                            if (price > 0 || stock > 0) {
                                                result.variations.push({
                                                    variation_name: vName, sku: skuVal, price: price, stock: stock, variation_image: vImg
                                                });
                                                result.debug.push(`[BẮT ĐƯỢC] '${vName}' - SKU: '${skuVal}', Giá: ${price}, Kho: ${stock} ${vImg ? '(Có ảnh)' : ''}`);
                                            }
                                        });
                                    } 
                                    
                                    // 4. NẾU KHÔNG CÓ BẢNG PHÂN LOẠI -> DÙNG THUẬT TOÁN VỊ TRÍ TƯƠNG ĐỐI
                                    if (result.variations.length === 0) {
                                        result.debug.push("Không thấy bảng phân loại, dùng thuật toán Vị trí Tương đối...");
                                        
                                        let pPrice = 0, pStock = 0, pSku = '';
                                        const allInputs = Array.from(document.querySelectorAll('input:not([type="hidden"])'));
                                        
                                        let priceIndex = -1;
                                        
                                        // 4.1 Tìm chính xác ô Giá (chứa ký hiệu ₫)
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

                                        // 4.2 Nhặt Kho và SKU dựa vào vị trí đứng liền sau ô Giá
                                        if (priceIndex !== -1) {
                                            const stockInp = allInputs[priceIndex + 1];
                                            if (stockInp) pStock = parseInt(stockInp.value.replace(/[^\d]/g,'')) || 0;

                                            const skuInp = allInputs[priceIndex + 2];
                                            if (skuInp) {
                                                const skuText = (skuInp.parentElement?.parentElement?.innerText || '').toLowerCase();
                                                // Đảm bảo không bắt nhầm sang ô Cân nặng (gr, kg) hay Kích thước (cm)
                                                if (!skuText.includes('gr') && !skuText.includes('kg') && !skuText.includes('cm') && !skuText.includes('đơn vị')) {
                                                    pSku = skuInp.value.trim();
                                                }
                                            }
                                        }

                                        // 🌟 Tự động sinh mã cho SP mặc định nếu trống
                                        if (!pSku) pSku = `SP_${itemId}_macdinh`;

                                        if (pPrice > 0 || pStock > 0 || pSku !== `SP_${itemId}_macdinh`) {
                                            result.variations.push({
                                                variation_name: "Mặc định", sku: pSku, price: pPrice, stock: pStock, variation_image: ''
                                            });
                                            result.debug.push(`[BẮT ĐƯỢC MẶC ĐỊNH] SKU: '${pSku}', Giá: ${pPrice}, Kho: ${pStock}`);
                                        } else {
                                            result.debug.push("❌ LỖI: Không tìm thấy ô chứa '₫' trên trang.");
                                        }
                                    }

                                    return result;
                                }
                            """, item_id)

                            # ── In log dò mìn ra màn hình ──
                            if product_data and "debug" in product_data:
                                for dbg in product_data["debug"]:
                                    self.log("      🕵️ " + dbg)
                            # ───────────────────────────────

                            if not product_data:
                                continue

                            product_data["shop"] = shop["ten_shop"]
                            product_data["platform"] = "shopee"

                            pname = product_data.get("product_name", "") or f"SP_{item_id}"
                            nvar  = len(product_data.get("variations", []))
                            nimg  = len(product_data.get("images", []))
                            self.log(f"    ✔ {pname[:40]} — {nvar} phân loại, {nimg} ảnh")

                            all_products.append(product_data)

                        except Exception as e:
                            self.log(f"    ❌ Lỗi SP {item_id}: {str(e)[:80]}")
                            continue

                    # ── BƯỚC 3: Gửi dữ liệu TỪNG TRANG lên API (Lưu cuốn chiếu) ──
                    if all_products:
                        self.log(f"\n📤 Đang gửi {len(all_products)} sản phẩm của Trang {page_num} lên server...")
                        try:
                            api_url = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/sync-variations"
                            data = json.dumps({
                                "shop": shop["ten_shop"],
                                "platform": "shopee",
                                "products": all_products
                            }).encode('utf-8')
                            req = urllib.request.Request(api_url, data=data,
                                headers={'Content-Type': 'application/json', 'User-Agent': 'HuyVanBot/2.0'},
                                method='POST')
                            with urllib.request.urlopen(req, timeout=120) as res:
                                result = json.loads(res.read().decode())
                                self.log(f"✅ Trang {page_num} gửi OK: {result.get('synced', 0)} SP | {result.get('variations', 0)} phân loại")
                        except Exception as e:
                            self.log(f"❌ Lỗi gửi API Trang {page_num}: {str(e)}")
                        
                        # Xóa list để chứa dữ liệu trang tiếp theo (tránh nặng RAM và quá tải Server)
                        all_products.clear()

                    # Kiem tra co trang tiep khong
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
                    # Nghi ngoi ngau nhien
                    import random
                    delay_trang = random.randint(15, 30)
                    self.log(f"  ⏳ Nghỉ ngơi {delay_trang}s trước khi sang trang {page_num} để lách Anti-Bot...")
                    await asyncio.sleep(delay_trang)

                await browser.close()
