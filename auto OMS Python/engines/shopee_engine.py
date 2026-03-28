from engines.shopee.shopee_auth import ShopeeAuth
from engines.shopee.shopee_doanh_thu import ShopeeDoanhThu
from engines.shopee.shopee_hoa_don import ShopeeHoaDon
from engines.shopee.shopee_don_hang import ShopeeDonHang
from engines.shopee.shopee_products import ShopeeProducts
from engines.shopee.shopee_promo import ShopeePromo

class ShopeeEngine:
    def __init__(self, log_func, psr, rescue_func=None):
        self.log = log_func
        # Khởi tạo các module con
        self.auth = ShopeeAuth(log_func)
        self.doanh_thu = ShopeeDoanhThu(log_func, self.auth)
        self.hoa_don = ShopeeHoaDon(log_func, self.auth)
        self.don_hang = ShopeeDonHang(log_func, psr, self.auth)
        self.products = ShopeeProducts(log_func, self.auth)
        self.promo = ShopeePromo(log_func, self.auth, rescue_func)

    async def xu_ly_doanh_thu(self, page, shop, THANG_TAI, NAM):
        # Gọi đúng tên hàm trong file shopee_doanh_thu.py
        await self.doanh_thu.xu_ly_doanh_thu(page, shop, THANG_TAI, NAM)

    async def xu_ly_hoa_don(self, page, shop, THANG_TAI, NAM):
        # Gọi đúng tên hàm trong file shopee_hoa_don.py
        await self.hoa_don.xu_ly_hoa_don(page, shop, THANG_TAI, NAM)

    async def xu_ly_don_hang(self, page, shop, THANG_TAI, NAM):
        # Gọi đúng tên hàm trong file shopee_don_hang.py
        await self.don_hang.xu_ly_don_hang(page, shop, THANG_TAI, NAM)

    async def shopee_xu_ly_don_hang_ngay(self, page, shop, from_date, to_date):
        # Gọi đúng tên hàm trong file shopee_don_hang.py
        await self.don_hang.shopee_xu_ly_don_hang_ngay(page, shop, from_date, to_date)

    async def tai_va_dong_bo_san_pham_excel(self, page, shop):
        # Gọi đúng tên hàm trong file shopee_products.py
        await self.products.tai_va_dong_bo_san_pham_excel(page, shop)

    async def dong_bo_gia_khuyen_mai(self, page, shop):
        # Gọi đúng tên hàm trong file shopee_promo.py
        await self.promo.dong_bo_gia_khuyen_mai(page, shop)

    async def sync_shopee_products(self, danh_sach_shop, chosen_shop_name):
        # Gọi đúng tên hàm trong file shopee_products.py
        await self.products.sync_shopee_products(danh_sach_shop, chosen_shop_name)
