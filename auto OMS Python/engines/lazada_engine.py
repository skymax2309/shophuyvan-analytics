from engines.lazada.lazada_auth import LazadaAuth
from engines.lazada.lazada_doanh_thu import LazadaDoanhThu
from engines.lazada.lazada_hoa_don import LazadaHoaDon
from engines.lazada.lazada_don_hang import LazadaDonHang

class LazadaEngine:
    def __init__(self, log_func, psr):
        self.auth = LazadaAuth(log_func)
        self.doanh_thu = LazadaDoanhThu(log_func, self.auth)
        self.hoa_don = LazadaHoaDon(log_func, self.auth)
        self.don_hang = LazadaDonHang(log_func, psr, self.auth)

    async def lazada_xu_ly_doanh_thu(self, page, shop, THANG_TAI, NAM):
        await self.doanh_thu.run(page, shop, THANG_TAI, NAM)

    async def lazada_xu_ly_hoa_don(self, page, shop, THANG_TAI, NAM):
        await self.hoa_don.run(page, shop, THANG_TAI, NAM)

    async def lazada_xu_ly_don_hang(self, page, shop, THANG_TAI, NAM):
        await self.don_hang.run_monthly(page, shop, THANG_TAI, NAM)
            
    async def lazada_xu_ly_don_hang_ngay(self, page, shop, from_date, to_date):
        await self.don_hang.run_by_date(page, shop, from_date, to_date)
