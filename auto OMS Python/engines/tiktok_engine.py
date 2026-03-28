from engines.tiktok.tiktok_auth import TikTokAuth
from engines.tiktok.tiktok_doanh_thu import TikTokDoanhThu
from engines.tiktok.tiktok_hoa_don import TikTokHoaDon
from engines.tiktok.tiktok_don_hang import TikTokDonHang
from engines.tiktok.tiktok_products import TikTokProducts

class TikTokEngine:
    def __init__(self, log_func, psr):
        self.log = log_func
        self.psr = psr
        self.auth = TikTokAuth(log_func)
        self.doanh_thu = TikTokDoanhThu(log_func, psr, self.auth)
        self.hoa_don = TikTokHoaDon(log_func, self.auth)
        self.don_hang = TikTokDonHang(log_func, psr, self.auth)
        self.products = TikTokProducts(log_func, self.auth)

    async def tiktok_xu_ly_doanh_thu(self, page, shop, THANG_TAI, NAM):
        await self.doanh_thu.run(page, shop, THANG_TAI, NAM)

    async def tiktok_xu_ly_hoa_don(self, page, shop, THANG_TAI, NAM):
        await self.hoa_don.run(page, shop, THANG_TAI, NAM)

    async def tiktok_xu_ly_don_hang(self, page, shop, THANG_TAI, NAM):
        await self.don_hang.run_monthly(page, shop, THANG_TAI, NAM)
            
    async def tiktok_xu_ly_don_hang_ngay(self, page, shop, from_date, to_date):
        await self.don_hang.run_by_date(page, shop, from_date, to_date)

    async def tai_va_dong_bo_san_pham_excel(self, page, shop):
        await self.products.run(page, shop)
