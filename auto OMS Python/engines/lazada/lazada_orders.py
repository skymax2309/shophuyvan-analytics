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

    async def scrape_new_orders(self, page, shop_name="", mode="all"):
        # 🌟 GỌI MODULE QUẢN GIA TOKEN LAZADA
        import sys, os
        sys.path.append(os.path.dirname(os.path.abspath(__file__)))
        from lazada_token_core import LazadaTokenCore
        
        token_mgr = LazadaTokenCore(self.log)
        tokens_data = token_mgr.get_tokens_from_db(shop_name)
        
        if tokens_data and tokens_data.get("access_token"):
            token = tokens_data["access_token"]
            
            self.log("-------------------------------------------------")
            self.log(f"⚡ [LAZADA VIP] Shop '{shop_name}' ĐÃ CÓ TOKEN API!")
            self.log("🚀 Kích hoạt luồng Đồng bộ Đơn hàng bằng API...")
            
            api_result = await self.scrape_by_api(token, shop_name, mode, token_mgr)
            
            # XỬ LÝ NẾU TOKEN CHẾT -> TỰ ĐỘNG XIN LẠI TOKEN MỚI
            if api_result is False:
                self.log("⚠️ API thất bại (Token có thể đã hết hạn). Bắt đầu làm mới Token tự động...")
                new_token = token_mgr.refresh_and_save_token(tokens_data, shop_name)
                
                if new_token:
                    self.log("🚀 Đang khởi động lại luồng lấy Đơn hàng bằng Token mới nóng hổi...")
                    return await self.scrape_by_api(new_token, shop_name, mode, token_mgr)
                else:
                    self.log("❌ Làm mới Token thất bại. Bác vui lòng quét mã QR lại trên Web!")
                    return []
                    
            return api_result

        self.log("-------------------------------------------------")
        self.log(f"❌ Shop '{shop_name}' chưa kết nối Token API Lazada. Vui lòng cấp quyền trên Web!")
        return []

    async def scrape_by_api(self, token, shop_name, mode, token_mgr):
        cache_file = f"cache_orders_lazada_api_{shop_name}.json"
        cached_final_orders = {}
        import os, json
        try:
            if os.path.exists(cache_file):
                with open(cache_file, "r", encoding="utf-8") as f:
                    cached_final_orders = json.load(f)
        except: pass

        from datetime import datetime, timedelta
        import time, requests, hashlib

        created_after = (datetime.now() - timedelta(days=15)).isoformat(timespec='seconds') + "+07:00"
        
        params = {
            "created_after": created_after,
            "sort_direction": "DESC",
            "limit": "100"
        }
        
        # Dùng Quản gia tạo URL và chữ ký
        url_get_orders, final_params = token_mgr.create_api_request("/orders/get", token, params)

        try:
            self.log("⚡ Đang kết nối siêu tốc đến máy chủ Lazada...")
            res = requests.get(url_get_orders, params=final_params, timeout=20)
            data = res.json()
            
            if data.get("code") != "0":
                self.log(f"   ❌ LỖI API LAZADA: {data.get('message')}")
                return False # 🌟 TRẢ VỀ FALSE ĐỂ ĐÁNH THỨC CƠ CHẾ AUTO REFRESH CỦA QUẢN GIA
                
            orders_data = data.get("data", {}).get("orders", [])
            self.log(f"✅ Tải thành công {len(orders_data)} đơn hàng thô (Mất chưa tới 1 giây).")
            
            valid_orders = []
            newly_completed = {}
            
            # Bộ từ điển dịch trạng thái Lazada -> OMS (Chuẩn ShipXanh)
            status_map = {
                'pending': 'LOGISTICS_PENDING_ARRANGE',
                'ready_to_ship': 'LOGISTICS_PACKAGED',
                'shipped': 'SHIPPED',
                'delivered': 'COMPLETED',
                'canceled': 'CANCELLED',
                'returned': 'RETURN',
                'failed': 'LOGISTICS_IN_RETURN'
            }

            for o in orders_data:
                order_id = str(o.get('order_id'))
                raw_status = o.get('statuses', ['pending'])[0]
                oms_status = status_map.get(raw_status, 'LOGISTICS_PENDING_ARRANGE')
                
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
                item_params = {"order_id": order_id}
                url_get_items, final_item_params = token_mgr.create_api_request("/order/items/get", token, item_params)
                
                item_res = requests.get(url_get_items, params=final_item_params, timeout=10)
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
                            "revenue_line": float(it.get('item_price', 0)) # <-- Đổi từ price sang revenue_line
                        })

                # Gộp thành Order chuẩn mực cho Đám mây (Đã đổi tên cột doanh thu & vận chuyển)
                standard_order = {
                    "order_id": order_id,
                    "shop": shop_name,
                    "platform": "lazada",
                    "order_date": o.get('created_at', '')[:19].replace('T', ' '),
                    "customer_name": o.get('customer_first_name', 'Khách Lazada'),
                    "shipping_fee": float(o.get('shipping_fee', 0)),
                    "revenue": float(o.get('price', 0)),     # <-- Đổi từ order_total sang revenue
                    "raw_revenue": float(o.get('price', 0)), # <-- Thêm raw_revenue để Server tính toán mượt mà
                    "shipping_carrier": shipping_provider,
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