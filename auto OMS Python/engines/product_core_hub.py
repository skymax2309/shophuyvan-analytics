import urllib.request
import json
import traceback

class ProductCoreHub:
    def __init__(self, log_func):
        self.log = log_func
        # Link API tiếp nhận dữ liệu sản phẩm
        self.api_sync_url = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/sync-variations"
        # Link API tiếp nhận Lỗi (Tuân thủ Quy tắc 14)
        self.api_log_url = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/logs"

    def _send_log_to_server(self, shop_name, platform, error_msg, trace):
        """Hàm ngầm đẩy log lỗi lên Cloudflare để bác dễ theo dõi"""
        try:
            data = json.dumps({
                "shop": shop_name,
                "platform": platform,
                "module": "ProductCoreHub",
                "error_message": error_msg,
                "traceback": trace
            }).encode('utf-8')
            req = urllib.request.Request(self.api_log_url, data=data, headers={'Content-Type': 'application/json'}, method='POST')
            urllib.request.urlopen(req, timeout=10)
        except:
            pass # Bỏ qua nếu lỗi mạng để không làm sập Tool

    def sync_products(self, shop_id, platform, products_data):
        """Hàm chuẩn hóa và đẩy dữ liệu sản phẩm lên Server"""
        self.log(f"🔄 [PRODUCT HUB] Tiếp nhận {len(products_data)} sản phẩm từ {platform.upper()} ({shop_id}). Đang đối chiếu...")
        try:
            # Gói dữ liệu theo đúng chuẩn API Server đang chờ
            payload = json.dumps({
                "user_name": shop_id, 
                "platform": platform,
                "products": products_data
            }).encode('utf-8')

            self.log(f"⏳ [PRODUCT HUB] Đang bơm dữ liệu lên Server qua đường ống API...")
            req = urllib.request.Request(
                self.api_sync_url, 
                data=payload,
                headers={'Content-Type': 'application/json', 'User-Agent': 'HuyVanBot/2.0'},
                method='POST'
            )
            
            with urllib.request.urlopen(req, timeout=120) as res:
                response_body = res.read().decode('utf-8')
                result = json.loads(response_body)
                
                if result.get('status') == 'ok':
                    synced = result.get('synced', 0)
                    auto_mapped = result.get('auto_mapped', 0)
                    self.log(f"✅ [PRODUCT HUB] Server báo XONG! Đồng bộ: {synced} phân loại | Tự động Map: {auto_mapped} SKU.")
                    return True
                else:
                    self.log(f"❌ [PRODUCT HUB] Server từ chối dữ liệu. Lỗi: {result.get('error', 'Unknown')}")
                    self._send_log_to_server(shop_id, platform, f"Server Error: {result}", "")
                    return False
                    
        except Exception as e:
            trace = traceback.format_exc()
            self.log(f"❌ [PRODUCT HUB] Đứt cáp/Lỗi đường truyền khi đẩy dữ liệu: {str(e)}")
            self._send_log_to_server(shop_id, platform, str(e), trace)
            return False
