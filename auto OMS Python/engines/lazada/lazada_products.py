import asyncio
import os
import json
import time
import hmac
import hashlib
import requests

class LazadaProducts:
    def __init__(self, log_func, auth):
        self.log = log_func
        self.auth = auth
        # --- CẤU HÌNH API LAZADA & SERVER ---
        self.LAZADA_APP_KEY = "135731"
        self.LAZADA_SECRET = "UHMS2CUNhAspEYgNMYZ1ywytbHhCx1wK"
        self.SERVER_URL = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api"

    # ==========================================
    # CÔNG CỤ API: LẤY TOKEN VÀ CHỮ KÝ
    # ==========================================
    def _get_api_token(self, shop_name):
        try:
            res = requests.get(f"{self.SERVER_URL}/shops/tokens", timeout=10)
            if res.status_code == 200:
                for shop in res.json():
                    # ĐIỀU KIỆN MỚI: Phải có access_token thì mới lấy (Bỏ qua rác)
                    if shop.get('platform') == 'lazada' and (shop.get('user_name') == shop_name or shop.get('shop_name') == shop_name):
                        token = shop.get('access_token')
                        if token: # <-- Chỉ trả về nếu token thực sự tồn tại
                            return token
        except Exception as e:
            self.log(f"   ⚠️ Lỗi lấy Token từ Server: {e}")
        return None

    def _generate_lazada_sign(self, api_path, params):
        sorted_params = sorted(params.items())
        sign_string = api_path
        for k, v in sorted_params: sign_string += f"{k}{v}"
        return hmac.new(self.LAZADA_SECRET.encode('utf-8'), sign_string.encode('utf-8'), hashlib.sha256).hexdigest().upper()

    async def run(self, page, shop):
        shop_id = shop.get('user_name', shop.get('ten_shop', 'Unnamed'))
        self.log("-------------------------------------------------")
        self.log(f"🚀 [LAZADA API REALTIME] Khởi động động cơ SẢN PHẨM & TỒN KHO cho: {shop_id}")

        # 1. MÓC CHÌA KHÓA TỪ ĐÁM MÂY
        access_token = self._get_api_token(shop_id)
        if not access_token:
            self.log(f"❌ Shop {shop_id} chưa kết nối API. Vui lòng cấp quyền trên Website!")
            return

        all_products = []
        offset = 0
        limit = 50 # Sức chứa tối đa 1 lần gọi API Lazada

        # 2. VÉT SẠCH KHO DỮ LIỆU LAZADA
        try:
            while True:
                self.log(f"⚡ Đang kéo dữ liệu từ mốc {offset}...")
                params = {
                    "filter": "all", # Kéo tất cả sản phẩm
                    "limit": str(limit),
                    "offset": str(offset),
                    "app_key": self.LAZADA_APP_KEY,
                    "timestamp": str(int(time.time() * 1000)),
                    "sign_method": "sha256",
                    "access_token": access_token
                }
                params["sign"] = self._generate_lazada_sign("/products/get", params)

                res = requests.get("https://api.lazada.vn/rest/products/get", params=params, timeout=20)
                data = res.json()

                if data.get("code") != "0":
                    self.log(f"❌ API Lazada từ chối: {data.get('message')}")
                    break

                products = data.get("data", {}).get("products", [])
                if not products:
                    break # Hết sản phẩm thì thoát vòng lặp

                all_products.extend(products)
                if len(products) < limit:
                    break # Đã đến trang cuối cùng
                    
                offset += limit
                await asyncio.sleep(0.5)

            self.log(f"✅ Đã tải thần tốc {len(all_products)} sản phẩm gốc!")

            # 3. NHÀO NẶN DATA CHUẨN (ÉP KHUÔN OMS)
            standardized_list = []
            for p in all_products:
                item_id = str(p.get("item_id", ""))
                name = p.get("attributes", {}).get("name", "Không có tên")
                desc = p.get("attributes", {}).get("short_description", "")
                images = p.get("images", [])
                
                valid_variations = []
                for sku in p.get("skus", []):
                    qty = int(sku.get("quantity", 0))
                    price = float(sku.get("price", 0))
                    special_price = float(sku.get("special_price", 0)) if sku.get("special_price") else 0
                    seller_sku = sku.get("SellerSku", "Mặc_định")
                    v_img = sku.get("Images", [""])[0] if sku.get("Images") else ""

                    valid_variations.append({
                        "variation_name": seller_sku, 
                        "sku": seller_sku,
                        "price": price,
                        "discount_price": special_price,
                        "stock": qty,
                        "variation_image": v_img
                    })

                # BỌC THÉP: Dọn rác, chỉ giữ sản phẩm có tổng tồn kho > 0
                total_stock = sum(v["stock"] for v in valid_variations)
                if total_stock > 0:
                    standardized_list.append({
                        "item_id": item_id,
                        "product_name": name,
                        "description": desc,
                        "images": images,
                        "variations": valid_variations
                    })

            self.log(f"🧹 Đã lọc rác xong. Còn lại {len(standardized_list)} SP hợp lệ (Có tồn kho).")

            # 4. BƠM THẲNG VÀO TRẠM TRUNG CHUYỂN (BỎ QUA UTILS)
            try:
                import sys
                # Đảm bảo Python nhận diện được thư mục gốc để import ProductCoreHub
                root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
                if root_dir not in sys.path:
                    sys.path.append(root_dir)
                    
                from engines.product_core_hub import ProductCoreHub
                
                hub = ProductCoreHub(self.log)
                chunk_size = 40
                for i in range(0, len(standardized_list), chunk_size):
                    chunk = standardized_list[i:i + chunk_size]
                    self.log(f"⏳ Đang đẩy lô {i//chunk_size + 1} ({len(chunk)} SP) vào Trạm trung chuyển (Hub)...")
                    hub.sync_products(shop_id, "lazada", chunk)
                    
                self.log("🎉 HOÀN TẤT ĐỒNG BỘ TỒN KHO LAZADA LÊN MÂY!")
                self.log("-------------------------------------------------")
                
            except ImportError:
                self.log("❌ LỖI HỆ THỐNG: Không thể kết nối với ProductCoreHub.")

        except Exception as e:
            self.log(f"❌ [CRITICAL ERROR] Lỗi hệ thống khi chạy API Sản phẩm: {e}")

# ==========================================
    # TÍNH NĂNG CHỜ KẾT NỐI: ĐẨY TỒN KHO LÊN SÀN
    # ==========================================
    async def upload_inventory_excel(self, page, shop, file_path):
        """Hàm này đọc file Excel Tồn kho từ máy tính và bơm thẳng lên Lazada"""
        shop_id = shop.get('user_name', shop.get('ten_shop', 'Unknown'))
        self.log(f"🚀 [UPLOAD] Bắt đầu đẩy file Tồn kho lên LAZADA shop: {shop_id}")
        
        if not os.path.exists(file_path):
            self.log(f"❌ Không tìm thấy file Excel để tải lên tại: {file_path}")
            return False

        if not await self.auth.check_and_login(page, shop): return False
        
        await page.goto("https://sellercenter.lazada.vn/apps/product/list?tab=online_product", wait_until="commit")
        await asyncio.sleep(8)

        try:
            # 1. Tắt popup cản đường (nếu có)
            try:
                popups = await page.locator("button.next-dialog-close, button:has-text('Đóng')").all()
                for popup in popups:
                    if await popup.is_visible(): await popup.click()
            except: pass

            # 2. Bấm vào nút "Xuất dữ liệu" để mở bảng điều khiển Data
            self.log("   ⚙️ Đang mở bảng điều khiển Dữ liệu...")
            try:
                await page.locator("button:has-text('Xuất dữ liệu'), span:has-text('Xuất dữ liệu')").first.click(timeout=10000)
                await asyncio.sleep(3)
            except Exception as e:
                self.log(f"   ❌ Lỗi không tìm thấy nút Xuất dữ liệu: {str(e)[:50]}")
                return False

            # 3. Chuyển sang Tab "Tải lên file Excel" (Dựa theo Log AI)
            self.log("   ⚙️ Đang chuyển sang Tab 'Tải lên'...")
            try:
                await page.locator("span.tab-desc:has-text('Tải lên file Excel'), text='Tải lên file Excel'").first.click(timeout=10000)
                await asyncio.sleep(3)
            except Exception as e:
                self.log(f"   ❌ Lỗi không tìm thấy Tab Tải lên: {str(e)[:50]}")
                return False

            # 4. Bơm file Excel vào lỗ hổng Input (Không cần dùng chuột click nút Chọn Tập Tin)
            self.log(f"   📤 Đang bơm file Excel: {os.path.basename(file_path)}")
            file_input = page.locator('input[type="file"], input[accept*="excel"], input[accept*="xls"]').first
            await file_input.set_input_files(file_path)
            
            self.log("   ⏳ Đang chờ Lazada nhai file và xử lý tồn kho...")
            await asyncio.sleep(15)
            
            # 5. Bấm xem lịch sử upload (Theo thao tác chuẩn của bạn)
            try:
                await page.locator("button:has-text('See Upload History'), span:has-text('See Upload History')").first.click(timeout=5000)
                await asyncio.sleep(3)
            except: pass

            self.log("   ✅ Bơm file hoàn tất! Vui lòng kiểm tra trên giao diện Lazada.")
            return True

        except Exception as e:
            self.log(f"   ❌ Lỗi trong quá trình Upload Lazada: {str(e)[:80]}")
            return False