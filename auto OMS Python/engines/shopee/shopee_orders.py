import os
import sys

# Import các module vệ tinh (Bác chuẩn bị tạo ở bước sau)
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from shopee_token_core import ShopeeTokenCore
from shopee_orders_api import ShopeeOrdersAPI
from shopee_orders_browser import ShopeeOrdersBrowser

class ShopeeOrderScraper:
    def __init__(self, log_callback, parser):
        self.log = log_callback
        self.parser = parser

    async def scrape_new_orders(self, page, limits=None, shop_name="default", mode="all"):
        """Ngã ba Đồng bộ Đơn hàng: Có Token -> API | Không Token -> Playwright"""
        
        # 1. Gọi Quản gia Token ra kiểm tra
        token_mgr = ShopeeTokenCore(self.log)
        tokens_data = token_mgr.get_tokens_from_db(shop_name)
        
        if tokens_data and tokens_data.get("access_token"):
            token = tokens_data["access_token"]
            
            self.log("-------------------------------------------------")
            self.log(f"⚡ [SHOPEE VIP] Shop '{shop_name}' ĐÃ CÓ TOKEN API!")
            self.log("🚀 Kích hoạt luồng Đồng bộ Đơn hàng bằng API...")
            
            # Khởi tạo chuyên viên API
            api_handler = ShopeeOrdersAPI(self.log, self.parser)
            
            # Chạy thử API
            api_result = await api_handler.scrape_by_api(token, shop_name, limits, mode, token_mgr)
            
            # 🌟 XỬ LÝ NẾU TOKEN CHẾT -> TỰ ĐỘNG XIN LẠI TOKEN MỚI
            if api_result is False:
                self.log("⚠️ API thất bại (Token hết hạn). Bắt đầu làm mới Token tự động...")
                new_token = token_mgr.refresh_and_save_token(tokens_data, shop_name)
                
                if new_token:
                    self.log("🚀 Đang khởi động lại luồng lấy Đơn hàng bằng Token mới nóng hổi...")
                    return await api_handler.scrape_by_api(new_token, shop_name, limits, mode, token_mgr)
                else:
                    self.log("❌ Làm mới Token thất bại. Bác vui lòng quét mã QR lại trên ứng dụng!")
                    return [] # TUYỆT ĐỐI TUÂN THỦ: Trả về rỗng, KHÔNG CÓ FALLBACK BẬT CHROME!
                    
            return api_result

        # 2. KHÔNG CÓ TOKEN -> CHẠY TRÌNH DUYỆT
        self.log("-------------------------------------------------")
        self.log(f"🐌 [SHOPEE THƯỜNG] Shop '{shop_name}' chưa kết nối Token API.")
        self.log("🚀 Bắt buộc kích hoạt luồng Cào dữ liệu bằng Trình duyệt Chrome...")
        
        # Khởi tạo chuyên viên Trình duyệt
        browser_handler = ShopeeOrdersBrowser(self.log, self.parser)
        return await browser_handler.scrape_by_browser(page, limits, shop_name, mode)
