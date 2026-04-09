import sys
import os
import requests
import time
import hmac
import hashlib

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from shopee_products_api import ShopeeProductsAPI
from shopee_products_browser import ShopeeProductsBrowser

class ShopeeProducts:
    def __init__(self, log_func, auth):
        self.log = log_func
        self.auth = auth
        self.partner_id = "2013730"
        self.partner_key = "shpk66746e4845745341714d6b63656a5a6c7049524b7444486c4a686c4d4a4d"

    def _get_api_tokens_data(self, shop_name):
        """Lấy toàn bộ bộ Token (Access + Refresh) từ Cloudflare Server"""
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
                            return {
                                "access_token": shop.get('access_token'),
                                "refresh_token": shop.get('refresh_token'),
                                "shop_id": mapped_id or shop.get('api_shop_id')
                            }
        except Exception as e:
            self.log(f"Lỗi lấy token từ server: {e}")
        return None

    def _refresh_api_token(self, tokens_data, chosen_shop_name):
        """Tự động xin cấp lại Token mới từ Shopee bằng thuật toán Auth"""
        refresh_token = tokens_data.get("refresh_token")
        shop_id = tokens_data.get("shop_id")
        
        if not refresh_token or not shop_id:
            self.log("❌ Không tìm thấy Refresh Token trong hệ thống. Bác cần quét mã QR lại trên web!")
            return None

        # 1. Tạo chữ ký Auth (Chuẩn riêng của API Auth: KHÔNG có access_token)
        path = "/api/v2/auth/access_token/get"
        timestamp = int(time.time())
        base_string = f"{self.partner_id}{path}{timestamp}"
        sign = hmac.new(self.partner_key.encode('utf-8'), base_string.encode('utf-8'), hashlib.sha256).hexdigest()
        
        url = f"https://partner.shopeemobile.com{path}?partner_id={self.partner_id}&timestamp={timestamp}&sign={sign}"
        
        # 2. Bắn API xin Token mới
        payload = {
            "refresh_token": refresh_token,
            "partner_id": int(self.partner_id),
            "shop_id": int(shop_id)
        }

        self.log(f"🔄 Đang xin cấp lại Token mới từ Shopee cho shop '{chosen_shop_name}'...")
        try:
            res = requests.post(url, json=payload, timeout=15).json()
            if res.get("error"):
                self.log(f"❌ Shopee từ chối cấp Token mới: {res.get('message', res.get('error'))}")
                return None
                
            new_access_token = res.get("access_token")
            new_refresh_token = res.get("refresh_token")
            self.log("✅ Đã lấy được Token mới thành công!")
            
            # 🌟 GỌI API LÊN CLOUDFLARE ĐỂ CẤT TOKEN VÀO KÉT SẮT
            try:
                self.log("💾 Đang gửi Token mới lên Server để cập nhật Database...")
                update_payload = {
                    "shop_id": shop_id,
                    "access_token": new_access_token,
                    "refresh_token": new_refresh_token
                }
                update_url = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/shops/update-tokens"
                req = requests.post(update_url, json=update_payload, timeout=10)
                
                if req.status_code == 200:
                    self.log("✅ Đã chốt sổ Token mới vào Database an toàn. Lần sau chạy sẽ không bị lỗi nữa!")
                else:
                    self.log(f"⚠️ Lưu Token lên Server bị từ chối: {req.text}")
            except Exception as e:
                self.log(f"⚠️ Lỗi mạng khi gọi API lưu Token: {e}")
                
            return new_access_token
        except Exception as e:
            self.log(f"❌ Lỗi kết nối mạng khi Refresh Token: {e}")
            return None

    async def sync_shopee_products(self, danh_sach_shop, chosen_shop_name):
        """Ngã ba Đồng bộ SP: Có Token -> Dùng API (Tự động Refresh) | Không Token -> Dùng Playwright"""
        tokens_data = self._get_api_tokens_data(chosen_shop_name)
        
        if tokens_data and tokens_data.get("access_token"):
            token = tokens_data["access_token"]
            shop_id = tokens_data["shop_id"]
            
            self.log("-------------------------------------------------")
            self.log(f"⚡ [SHOPEE VIP] Shop '{chosen_shop_name}' ĐÃ CÓ TOKEN API!")
            self.log("🚀 Kích hoạt luồng Đồng bộ Sản phẩm & TỒN KHO bằng API...")
            
            api_handler = ShopeeProductsAPI(self.log, self.auth)
            api_success = await api_handler.sync_by_api(token, shop_id, chosen_shop_name)
            
            # XỬ LÝ NẾU TOKEN CHẾT -> TỰ ĐỘNG LÀM MỚI
            if api_success is False:
                self.log("⚠️ API thất bại (Token hết hạn). Bắt đầu làm mới Token...")
                new_token = self._refresh_api_token(tokens_data, chosen_shop_name)
                
                if new_token:
                    self.log("🚀 Đang khởi động lại luồng API bằng Token mới nóng hổi...")
                    return await api_handler.sync_by_api(new_token, shop_id, chosen_shop_name)
                else:
                    self.log("❌ Làm mới Token thất bại. Bác vui lòng quét mã QR lại trên ứng dụng!")
                    return False
                    
            return api_success
            
        self.log("-------------------------------------------------")
        self.log(f"🐌 [SHOPEE THƯỜNG] Chạy luồng Đồng bộ Sản phẩm bằng Chrome...")
        browser_handler = ShopeeProductsBrowser(self.log, self.auth)
        return await browser_handler.sync_by_browser(danh_sach_shop, chosen_shop_name)

    async def tai_va_dong_bo_san_pham_excel(self, page, shop):
        """Hỗ trợ gọi lại luồng tải Excel từ UI"""
        shop_name = shop.get('ten_shop', '')
        tokens_data = self._get_api_tokens_data(shop_name)
        if tokens_data and tokens_data.get("access_token"):
            self.log("🚀 Shop có Token, tự động bẻ lái sang Đồng bộ API thay vì tải Excel...")
            return await self.sync_shopee_products([shop], shop_name)

        # Không có token thì đưa sang hàm xử lý Excel của trình duyệt
        browser_handler = ShopeeProductsBrowser(self.log, self.auth)
        return await browser_handler.tai_va_dong_bo_san_pham_excel(page, shop)