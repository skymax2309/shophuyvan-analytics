import asyncio
import os
import json
import urllib.request
import random
import traceback
from playwright.async_api import async_playwright
from utils import upload_to_r2, process_and_sync_files

class ShopeeProducts:
    def __init__(self, log_func, auth):
        self.log = log_func
        self.auth = auth
        # Endpoint hứng log trên Cloudflare Worker (Bổ sung Token)
        self.api_log_url = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/logs?token=huyvan_secret_2026" 

    def log_and_send(self, message, is_error=False, shop_name="System"):
        """Gắn log chi tiết trên UI và tự động gửi lên server nếu là lỗi (Quy tắc 14 & 15)"""
        prefix = "❌ [LỖI SHOPEE PRODUCT]" if is_error else "ℹ️ [INFO]"
        full_msg = f"{prefix} {message}"
        self.log(full_msg)
        
        if is_error:
            try:
                data = json.dumps({
                    "shop": shop_name,
                    "platform": "shopee",
                    "module": "ShopeeProducts",
                    "error_message": full_msg,
                    "traceback": traceback.format_exc()
                }).encode('utf-8')
                
                # Bổ sung User-Agent để tránh bị Cloudflare chặn
                headers = {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
                }
                req = urllib.request.Request(self.api_log_url, data=data, headers=headers, method='POST')
                urllib.request.urlopen(req, timeout=10)
            except Exception as e:
                self.log(f"⚠️ Không thể gửi log lên server: {str(e)}")

    async def tai_va_dong_bo_san_pham_excel(self, page, shop):
        # 🌟 NGÃ BA THÔNG MINH: KIỂM TRA QUYỀN VIP TRƯỚC KHI QUYẾT ĐỊNH TẢI EXCEL
        shop_name = shop.get('ten_shop', '')
        token = self._get_api_token(shop_name)
        if token:
            shopee_id_map = { "chihuy2309": 166563639 }
            shop_id = shopee_id_map.get(str(shop_name).strip().lower())
            if shop_id:
                self.log("-------------------------------------------------")
                self.log(f"⚡ [SHOPEE VIP] Shop '{shop_name}' ĐÃ CÓ TOKEN API!")
                self.log("🚀 Bỏ qua việc tải 3 file Excel chậm chạp, kích hoạt luồng Đồng bộ API SIÊU TỐC...")
                return await self.sync_by_api(token, shop_id, shop_name)

        # NẾU KHÔNG CÓ TOKEN API -> CHẠY LUỒNG TẢI EXCEL CŨ BẰNG CHROME
        self.log("-------------------------------------------------")
        self.log(f"🐌 [SHOPEE THƯỜNG] Shop chưa có Token API. Tiến hành tải file Excel...")
        try:
            self.log(f"🤖 Bắt đầu tự động tải file Excel cho shop: {shop['ten_shop']}")
            await page.goto("https://banhang.shopee.vn/portal/product-mass/mass-update/download", wait_until="commit")
            await asyncio.sleep(5)

            # --- 🌟 BỌC THÉP: CÀI ĐẶT BỘ LỌC "TỒN KHO >= 1" DỰA TRÊN LOG AI ---
            try:
                self.log("   ⚙️ CÀI ĐẶT BỘ LỌC: Đang loại bỏ các sản phẩm hết hàng...")
                # Bắt chính xác cái thẻ chứa toàn bộ bộ lọc
                filter_card = page.locator('#mass-update-filter-card')
                
                # Bấm vào Radio "Tùy chỉnh" (Thường là ô Radio thứ 2 trong thẻ lọc)
                custom_radio = filter_card.locator('label.eds-radio').nth(1)
                if await custom_radio.is_visible():
                    await custom_radio.click()
                    await asyncio.sleep(1.5)
                    
                    # Điền số 1 vào ô Tồn kho (Là ô nhập số đầu tiên xuất hiện)
                    min_stock_input = filter_card.locator('input.eds-input__input').first
                    if await min_stock_input.is_visible():
                        await min_stock_input.fill("") # Xóa sạch rác cũ
                        await min_stock_input.fill("1")
                        self.log("   ✅ Đã gài thành công bộ lọc: Chỉ tải sản phẩm có Tồn kho >= 1.")
                    await asyncio.sleep(1.5)
            except Exception as e:
                self.log(f"   ⚠️ Lỗi cài bộ lọc (Bot sẽ bỏ qua và tải toàn bộ SP): {e}")
            # --------------------------------------------------------------------

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
                    self.log_and_send(f"Quá thời gian chờ Shopee xuất file {tab_name}.", is_error=True, shop_name=shop['ten_shop'])
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
            
            # Gọi hàm xử lý và bắn lên Web từ file utils (Đã xóa import thừa gây lỗi)
            process_and_sync_files(shop['ten_shop'], downloaded_paths, self.log)
            
        except Exception as e:
            self.log_and_send(f"Lỗi khi tải file Excel sản phẩm: {e}", is_error=True, shop_name=shop['ten_shop'])

    # ==========================================
    # CÔNG CỤ API: LẤY TOKEN VÀ CHỮ KÝ SHOPEE
    # ==========================================
    def _get_api_token(self, shop_name):
        import requests
        try:
            shopee_id_map = { "chihuy2309": 166563639 }
            target = str(shop_name).strip().lower()
            mapped_id = shopee_id_map.get(target, "")
            res = requests.get("https://huyvan-worker-api.nghiemchihuy.workers.dev/api/shops/tokens", timeout=10)
            if res.status_code == 200:
                for shop in res.json():
                    if shop.get('platform') == 'shopee':
                        db_user = str(shop.get('user_name') or "").strip().lower()
                        db_shop = str(shop.get('shop_name') or "").strip().lower()
                        if target in [db_user, db_shop] or (mapped_id and str(mapped_id) in [db_user, db_shop]):
                            token = shop.get('access_token')
                            if token: return token
        except: pass
        return None

    def _sign_shopee_api(self, path, access_token, shop_id):
        import time, hmac, hashlib
        partner_id = "2013730"
        partner_key = "shpk66746e4845745341714d6b63656a5a6c7049524b7444486c4a686c4d4a4d"
        timestamp = int(time.time())
        base_string = f"{partner_id}{path}{timestamp}{access_token}{shop_id}"
        sign = hmac.new(partner_key.encode('utf-8'), base_string.encode('utf-8'), hashlib.sha256).hexdigest()
        return f"https://partner.shopeemobile.com{path}?partner_id={partner_id}&timestamp={timestamp}&access_token={access_token}&shop_id={shop_id}&sign={sign}"

    async def sync_shopee_products(self, danh_sach_shop, chosen_shop_name):
        """Ngã ba Đồng bộ SP: Có Token -> Dùng API | Không Token -> Dùng Playwright"""
        # 1. KIỂM TRA XEM CÓ THỂ CHẠY BẰNG API ĐƯỢC KHÔNG?
        token = self._get_api_token(chosen_shop_name)
        if token:
            shopee_id_map = { "chihuy2309": 166563639 }
            shop_id = shopee_id_map.get(str(chosen_shop_name).strip().lower())
            if shop_id:
                self.log("-------------------------------------------------")
                self.log(f"⚡ [SHOPEE VIP] Shop '{chosen_shop_name}' ĐÃ CÓ TOKEN API!")
                self.log("🚀 Kích hoạt luồng Đồng bộ Sản phẩm & TỒN KHO bằng API...")
                return await self.sync_by_api(token, shop_id, chosen_shop_name)
                
        self.log("-------------------------------------------------")
        self.log(f"🐌 [SHOPEE THƯỜNG] Chạy luồng Đồng bộ Sản phẩm bằng Chrome...")
        return await self.sync_by_browser(danh_sach_shop, chosen_shop_name)
    # ==========================================
    # LUỒNG 1: QUÉT SẢN PHẨM & TỒN KHO BẰNG API
    # ==========================================
    async def sync_by_api(self, token, shop_id, shop_name):
        import requests
        self.log(f"📡 Đang tải danh sách ID Sản phẩm từ Shopee...")
        
        all_item_ids = []
        offset = 0
        
        # 1. Lấy danh sách ID Sản phẩm
        while True:
            url_list = self._sign_shopee_api("/api/v2/product/get_item_list", token, shop_id)
            res_list = requests.get(f"{url_list}&offset={offset}&page_size=50&item_status=NORMAL").json()
            
            items = res_list.get("response", {}).get("item", [])
            for it in items: all_item_ids.append(str(it["item_id"]))
            
            if not res_list.get("response", {}).get("has_next_page"): break
            offset += 50
            
        self.log(f"✅ Tìm thấy {len(all_item_ids)} sản phẩm. Đang chọc API lấy Chi tiết & Tồn kho...")
        
        all_products_data = []
        
        # 2. Xử lý từng cục 50 sản phẩm
        for i in range(0, len(all_item_ids), 50):
            chunk = all_item_ids[i:i+50]
            chunk_str = ",".join(chunk)
            
            # API lấy Tên & Hình ảnh
            url_base = self._sign_shopee_api("/api/v2/product/get_item_base_info", token, shop_id)
            res_base = requests.get(f"{url_base}&item_id_list={chunk_str}").json()
            base_items = res_base.get("response", {}).get("item_list", [])
            
            # API lấy Phân loại, Giá, Mã SKU và TỒN KHO
            url_model = self._sign_shopee_api("/api/v2/product/get_model_list", token, shop_id)
            res_model = requests.get(f"{url_model}&item_id_list={chunk_str}").json()
            model_items = res_model.get("response", {}).get("tier_variation", [])
            
            # Ghép nối dữ liệu
            for base in base_items:
                item_id = str(base["item_id"])
                product_name = base.get("item_name", "")
                
                # Giải mã Hash ảnh Shopee
                images = []
                for img_hash in base.get("image", {}).get("image_id_list", []):
                    images.append(f"https://cf.shopee.vn/file/{img_hash}")
                    
                variations = []
                
                # Tìm data tồn kho của item này
                matching_models = next((m for m in model_items if str(m["item_id"]) == item_id), None)
                
                if matching_models and matching_models.get("model"):
                    # Có phân loại
                    tier_names = matching_models.get("tier_variation", [])
                    models = matching_models.get("model", [])
                    
                    for m in models:
                        # Ghép tên phân loại (Ví dụ: Đỏ, Size L)
                        var_name_parts = []
                        for idx, tier_idx in enumerate(m.get("tier_index", [])):
                            if idx < len(tier_names):
                                opt_list = tier_names[idx].get("option_list", [])
                                if tier_idx < len(opt_list):
                                    var_name_parts.append(opt_list[tier_idx].get("option", ""))
                        
                        v_name = " - ".join(var_name_parts)
                        sku = m.get("model_sku", "") or f"SP_{item_id}_{m['model_id']}"
                        
                        # 🌟 LẤY ĐƯỢC TỒN KHO CHÍNH XÁC 100% TỪ DATABASE SHOPEE
                        stock_info = m.get("stock_info", [])
                        stock = stock_info[0].get("normal_stock", 0) if stock_info else 0
                        price = m.get("price_info", [{}])[0].get("current_price", 0)
                        
                        variations.append({
                            "variation_name": v_name,
                            "sku": sku,
                            "price": price,
                            "stock": stock,
                            "variation_image": "" # API Model ko trả về ảnh var, lấy ảnh chính bù vào web sau
                        })
                else:
                    # Sản phẩm mặc định (Không phân loại)
                    sku = base.get("item_sku", "") or f"SP_{item_id}_macdinh"
                    variations.append({
                        "variation_name": "Mặc định",
                        "sku": sku,
                        "price": 0, # Giá SP ko phân loại ko quan trọng với OMS
                        "stock": 999,
                        "variation_image": ""
                    })

                all_products_data.append({
                    "item_id": item_id,
                    "product_name": product_name,
                    "description": base.get("description", ""),
                    "images": images,
                    "variations": variations,
                    "shop": shop_name,
                    "platform": "shopee"
                })
                
            self.log(f"   🔄 Đã bóc tách xong {len(all_products_data)}/{len(all_item_ids)} sản phẩm...")
            await asyncio.sleep(0.5)

        # 3. Gửi Lên Hub của Website
        if all_products_data:
            self.log(f"📤 Đang đẩy {len(all_products_data)} Sản phẩm & Tồn kho lên Website...")
            import sys, os
            sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            try:
                from engines.product_core_hub import ProductCoreHub
                hub = ProductCoreHub(self.log)
                hub.sync_products(shop_name, "shopee", all_products_data)
                self.log(f"🎉 HOÀN TẤT ĐỒNG BỘ SẢN PHẨM & TỒN KHO BẰNG API!")
            except Exception as e:
                self.log(f"❌ Lỗi đẩy Hub: {e}")

    # ==========================================
    # LUỒNG 2: ĐỒNG BỘ BẰNG TRÌNH DUYỆT (CHROME)
    # ==========================================
    async def sync_by_browser(self, danh_sach_shop, chosen_shop_name):

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
                            self.log_and_send(f"Lỗi lấy thông tin SP {item_id}: {str(e)[:80]}", is_error=True, shop_name=shop['ten_shop'])
                            continue

                    # ── BƯỚC 3: Gửi dữ liệu TỪNG TRANG lên API thông qua PRODUCT HUB (Lưu cuốn chiếu) ──
                    if all_products:
                        self.log(f"\n📤 Chuẩn bị gửi {len(all_products)} sản phẩm của Trang {page_num} vào Trạm trung chuyển (Hub)...")
                        
                        # Gọi Hub để xử lý (Code được gom về 1 chỗ, dễ bảo trì)
                        import sys, os
                        sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
                        try:
                            from engines.product_core_hub import ProductCoreHub
                            hub = ProductCoreHub(self.log)
                            # BỌC THÉP ĐỊNH DANH: Ưu tiên dùng user_name
                            shop_id = shop.get("user_name") or shop.get("ten_shop")
                            is_success = hub.sync_products(shop_id, "shopee", all_products)
                            
                            if is_success:
                                self.log(f"✅ Trang {page_num} hoàn tất trọn vẹn!")
                            else:
                                self.log(f"⚠️ Trang {page_num} có lỗi trong quá trình đẩy dữ liệu, vui lòng xem log phía trên.")
                        except ImportError:
                            self.log("❌ LỖI HỆ THỐNG: Không tìm thấy file engines/product_core_hub.py. Vui lòng tạo file này!")
                        except Exception as e:
                            self.log(f"❌ Lỗi bất ngờ khi gọi Hub Trang {page_num}: {str(e)}")
                        
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
