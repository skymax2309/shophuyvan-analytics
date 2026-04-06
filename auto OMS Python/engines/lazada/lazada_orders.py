import asyncio
import os
import json
import hashlib
from parsers.lazada_order_parser import LazadaOrderParser

class LazadaOrderScraper:
    def __init__(self, log_callback, parser: LazadaOrderParser):
        self.log = log_callback
        self.parser = parser
        # --- CẤU HÌNH API LAZADA & SERVER ---
        self.LAZADA_APP_KEY = "135731"
        self.LAZADA_SECRET = "UHMS2CUNhAspEYgNMYZ1ywytbHhCx1wK"
        self.SERVER_URL = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api"
        # ------------------------------------
        self.base_url = "https://sellercenter.lazada.vn/apps/order/list"

    # ==========================================
    # CÔNG CỤ API: LẤY TOKEN VÀ CHỮ KÝ
    # ==========================================
    def _get_api_token(self, shop_name):
        """Hỏi Server Cloudflare xem Shop này đã cấp quyền API (Token) chưa?"""
        import requests
        try:
            res = requests.get(f"{self.SERVER_URL}/shops/tokens", timeout=10)
            if res.status_code == 200:
                shops = res.json()
                for shop in shops:
                    # Dò theo username hoặc tên shop
                    if shop.get('platform') == 'lazada' and (shop.get('user_name') == shop_name or shop.get('shop_name') == shop_name):
                        if shop.get('access_token'):
                            return shop['access_token']
        except Exception as e:
            self.log(f"   ⚠️ Lỗi lấy Token từ Server: {e}")
        return None

    def _generate_lazada_sign(self, api_path, params):
        """Thuật toán băm chữ ký chuẩn Lazada"""
        import hmac, hashlib
        sorted_params = sorted(params.items())
        sign_string = api_path
        for k, v in sorted_params: sign_string += f"{k}{v}"
        return hmac.new(self.LAZADA_SECRET.encode('utf-8'), sign_string.encode('utf-8'), hashlib.sha256).hexdigest().upper()
    # ==========================================

    async def scrape_new_orders(self, page, shop_name="", mode="all"):
        self.log("-------------------------------------------------")
        self.log(f"🚀 [LAZADA API REALTIME] Khởi động động cơ API cho Shop: {shop_name}...")

        # 1. LẤY TOKEN TỪ SERVER
        access_token = self._get_api_token(shop_name)
        if not access_token:
            self.log(f"❌ Shop {shop_name} chưa được cấp quyền API (Không có Token).")
            self.log(f"👉 Vui lòng lên Website OMS bấm 'Kết nối Lazada' cho shop này!")
            return []

        # 2. KHỞI TẠO SỔ ĐEN (Cache MD5)
        cache_file = f"cache_orders_lazada_api_{shop_name}.json"
        cached_final_orders = {}
        try:
            if os.path.exists(cache_file):
                with open(cache_file, "r", encoding="utf-8") as f:
                    cached_final_orders = json.load(f)
        except: pass

        # 3. GỌI API LẤY ĐƠN TỔNG QUAN
        from datetime import datetime, timedelta
        import time, requests, json, hashlib

        # Lấy đơn có sự thay đổi trong 15 ngày gần nhất
        created_after = (datetime.now() - timedelta(days=15)).isoformat(timespec='seconds') + "+07:00"
        
        params = {
            "created_after": created_after,
            "sort_direction": "DESC",
            "limit": "100", # Lấy 100 đơn mới nhất mỗi lần quét
            "app_key": self.LAZADA_APP_KEY,
            "timestamp": str(int(time.time() * 1000)),
            "sign_method": "sha256",
            "access_token": access_token
        }
        params["sign"] = self._generate_lazada_sign("/orders/get", params)

        try:
            self.log("⚡ Đang kết nối siêu tốc đến máy chủ Lazada...")
            res = requests.get(f"https://api.lazada.vn/rest/orders/get", params=params, timeout=20)
            data = res.json()
            
            if data.get("code") != "0":
                self.log(f"❌ API Lazada từ chối: {data.get('message')}")
                return []
                
            orders_data = data.get("data", {}).get("orders", [])
            self.log(f"✅ Tải thành công {len(orders_data)} đơn hàng thô (Mất chưa tới 1 giây).")
            
            valid_orders = []
            newly_completed = {}
            
            # Bộ từ điển dịch trạng thái Lazada -> OMS
            status_map = {
                'pending': 'PENDING',
                'ready_to_ship': 'PACKING',
                'shipped': 'HANDED_OVER',
                'delivered': 'COMPLETED',
                'canceled': 'CANCELLED_TRANSIT',
                'returned': 'RETURN_REFUND',
                'failed': 'FAILED_DELIVERY'
            }

            for o in orders_data:
                order_id = str(o.get('order_id'))
                raw_status = o.get('statuses', ['pending'])[0]
                oms_status = status_map.get(raw_status, 'PENDING')
                
                # Tạo obj cơ bản để check Hash MD5
                base_obj = {
                    "order_id": order_id,
                    "oms_status": oms_status,
                    "shipping_status": raw_status,
                    "order_total": float(o.get('price', 0))
                }
                
                order_signature = hashlib.md5(json.dumps(base_obj, sort_keys=True).encode('utf-8')).hexdigest()
                
                # Nếu đơn hàng KHÔNG có gì thay đổi -> Bỏ qua ngay lập tức
                if order_id in cached_final_orders and cached_final_orders[order_id] == order_signature:
                    continue

                self.log(f"🚀 [XỬ LÝ API] {order_id} | {oms_status} -> Đang chọc API lấy chi tiết SKU...")
                
                # 4. GỌI API LẤY CHI TIẾT SẢN PHẨM (Chỉ gọi cho đơn mới/thay đổi)
                item_params = {
                    "order_id": order_id,
                    "app_key": self.LAZADA_APP_KEY,
                    "timestamp": str(int(time.time() * 1000)),
                    "sign_method": "sha256",
                    "access_token": access_token
                }
                item_params["sign"] = self._generate_lazada_sign("/order/items/get", item_params)
                
                item_res = requests.get("https://api.lazada.vn/rest/order/items/get", params=item_params, timeout=10)
                item_data = item_res.json()
                
                items_list = []
                shipping_provider = "Chưa rõ"
                tracking_number = ""
                
                if item_data.get("code") == "0":
                    order_items_raw = item_data.get("data", [])
                    # Lấy ĐVVC và Mã vận đơn từ sản phẩm đầu tiên của đơn hàng
                    if order_items_raw:
                        raw_provider = order_items_raw[0].get('shipment_provider', 'Lazada Shipping')
                        # Làm sạch tên ĐVVC (Ví dụ: "Pickup: BEST VN..." -> "BEST VN")
                        shipping_provider = raw_provider.split(':')[-1].split(',')[0].strip()
                        tracking_number = order_items_raw[0].get('tracking_code', '')

                    for it in order_items_raw:
                        items_list.append({
                            "sku": it.get('sku', ''),
                            "product_name": it.get('name', ''),
                            "quantity": 1, 
                            "price": float(it.get('item_price', 0))
                        })

                # Gộp thành Order chuẩn mực cho Đám mây (CHỈ GIỮ LẠI KHỐI NÀY)
                standard_order = {
                    "order_id": order_id,
                    "shop": shop_name,
                    "platform": "lazada",
                    "order_date": o.get('created_at', '')[:19].replace('T', ' '),
                    "customer_name": o.get('customer_first_name', 'Khách Lazada'),
                    "shipping_fee": float(o.get('shipping_fee', 0)),
                    "order_total": float(o.get('price', 0)),
                    "shipping_provider": shipping_provider, 
                    "tracking_number": tracking_number,     
                    "oms_status": oms_status,
                    "order_type": "return" if raw_status == 'returned' else ("cancel" if raw_status == 'canceled' else "normal"),
                    "shipping_status": raw_status,
                    "items": items_list
                }
                
                valid_orders.append(standard_order)
                newly_completed[order_id] = order_signature
                await asyncio.sleep(0.2) # Nghỉ xíu tránh bị Sàn khóa mõm vì gọi quá nhanh

            # Ghi vào Sổ đen
            if newly_completed:
                cached_final_orders.update(newly_completed)
                with open(cache_file, "w", encoding="utf-8") as f:
                    json.dump(cached_final_orders, f, indent=4, ensure_ascii=False)
                self.log(f"💾 Đã ghi sổ đen (MD5) cho {len(newly_completed)} đơn.")
            
            self.log(f"🎉 HOÀN TẤT! Đã xào nấu thành công {len(valid_orders)} đơn hàng mới/cập nhật.")
            self.log("-------------------------------------------------")
            return valid_orders

        except Exception as e:
            self.log(f"❌ [CRITICAL ERROR] Lỗi hệ thống khi chạy API: {e}")
            return []