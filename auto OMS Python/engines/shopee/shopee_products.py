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

    async def sync_shopee_products(self, danh_sach_shop, chosen_shop_name):
        """Ngã ba Đồng bộ SP: Có Token -> Dùng API (Tự động Refresh) | Không Token -> Dùng Playwright"""
        import sys, os
        sys.path.append(os.path.dirname(os.path.abspath(__file__)))
        from shopee_token_core import ShopeeTokenCore
        
        token_mgr = ShopeeTokenCore(self.log)
        tokens_data = token_mgr.get_tokens_from_db(chosen_shop_name)
        
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
                new_token = token_mgr.refresh_and_save_token(tokens_data, chosen_shop_name)
                
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
        import sys, os
        sys.path.append(os.path.dirname(os.path.abspath(__file__)))
        from shopee_token_core import ShopeeTokenCore
        
        shop_name = shop.get('ten_shop', '')
        token_mgr = ShopeeTokenCore(self.log)
        tokens_data = token_mgr.get_tokens_from_db(shop_name)
        
        if tokens_data and tokens_data.get("access_token"):
            self.log("🚀 Shop có Token, tự động bẻ lái sang Đồng bộ API thay vì tải Excel...")
            return await self.sync_shopee_products([shop], shop_name)

        # Không có token thì đưa sang hàm xử lý Excel của trình duyệt
        browser_handler = ShopeeProductsBrowser(self.log, self.auth)
        return await browser_handler.tai_va_dong_bo_san_pham_excel(page, shop)