import asyncio

class BaseAuth:
    def __init__(self, log_func, platform_name):
        self.log = log_func
        self.platform = platform_name

    def log_step(self, message):
        """Hàm gắn log chung có tiền tố tên sàn để dễ dò mìn"""
        self.log(f"[{self.platform.upper()}] {message}")

    async def check_and_login(self, page, shop):
        raise NotImplementedError("Phải ghi đè hàm check_and_login ở class con")
        
    async def re_verify(self, page, shop):
        raise NotImplementedError("Phải ghi đè hàm re_verify ở class con")