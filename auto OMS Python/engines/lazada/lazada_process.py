import asyncio
import requests
import os
import json
import time
import hmac
import hashlib

class LazadaOrderProcessor:
    def __init__(self, log_callback):
        self.log = log_callback
        self.api_url = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api"
        # --- CẤU HÌNH API LAZADA ---
        self.LAZADA_APP_KEY = "135731"
        self.LAZADA_SECRET = "UHMS2CUNhAspEYgNMYZ1ywytbHhCx1wK"
        self.SERVER_URL = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api"

    # ==========================================
    # CÔNG CỤ API: LẤY TOKEN VÀ CHỮ KÝ
    # ==========================================
    def _get_api_token(self, shop_name):
        try:
            res = requests.get(f"{self.SERVER_URL}/shops/tokens", timeout=10)
            if res.status_code == 200:
                for shop in res.json():
                    if shop.get('platform') == 'lazada' and (shop.get('user_name') == shop_name or shop.get('shop_name') == shop_name):
                        return shop.get('access_token')
        except Exception as e:
            self.log(f"   ⚠️ Lỗi lấy Token từ Server: {e}")
        return None

    def _generate_lazada_sign(self, api_path, params):
        sorted_params = sorted(params.items())
        sign_string = api_path
        for k, v in sorted_params: sign_string += f"{k}{v}"
        return hmac.new(self.LAZADA_SECRET.encode('utf-8'), sign_string.encode('utf-8'), hashlib.sha256).hexdigest().upper()

    async def process_confirmed_orders(self, page, shop_name):
        self.log(f"[*] Bắt đầu quy trình API: ĐÓNG GÓI & TẢI PHIẾU IN cho shop: {shop_name}")

        # 1. LẤY TOKEN & ĐỌC LỆNH
        access_token = self._get_api_token(shop_name)
        if not access_token:
            self.log(f"❌ Shop {shop_name} chưa có Token. Không thể in phiếu!")
            return

        orders = []
        temp_file = f"temp_print_jobs_{shop_name}.json"
        if os.path.exists(temp_file):
            try:
                with open(temp_file, "r") as f:
                    order_ids = json.load(f)
                os.remove(temp_file)
                orders = order_ids
            except: pass

        if not orders:
            self.log("✅ Không có đơn Lazada nào cần xử lý.")
            return

        # 2. XỬ LÝ TỪNG ĐƠN QUA API
        for order_id in orders:
            self.log(f"------------------------------------")
            self.log(f"📦 Đang xử lý Đơn: {order_id}")

            try:
                # BƯỚC A: Lấy danh sách Order Item ID (Lazada bắt buộc dùng ID sản phẩm để in)
                item_params = {
                    "order_id": str(order_id),
                    "app_key": self.LAZADA_APP_KEY,
                    "timestamp": str(int(time.time() * 1000)),
                    "sign_method": "sha256",
                    "access_token": access_token
                }
                item_params["sign"] = self._generate_lazada_sign("/order/items/get", item_params)
                res_items = requests.get("https://api.lazada.vn/rest/order/items/get", params=item_params).json()
                
                item_ids = [str(it['order_item_id']) for it in res_items.get('data', [])]
                if not item_ids:
                    self.log(f"   ❌ Không tìm thấy sản phẩm cho đơn {order_id}. Bỏ qua.")
                    continue

                # BƯỚC B: Gửi lệnh ĐÓNG GÓI (Pack)
                # Lưu ý: Nếu đơn đã Pack rồi, API sẽ báo lỗi nhưng ta vẫn có thể lấy Document
                pack_params = {
                    "shipping_allocate_type": "manual",
                    "order_item_ids": f"[{','.join(item_ids)}]",
                    "delivery_type": "dropshipping",
                    "app_key": self.LAZADA_APP_KEY,
                    "timestamp": str(int(time.time() * 1000)),
                    "sign_method": "sha256",
                    "access_token": access_token
                }
                pack_params["sign"] = self._generate_lazada_sign("/order/pack", pack_params)
                requests.post("https://api.lazada.vn/rest/order/pack", params=pack_params) # Lệnh báo Ready to Ship

                # BƯỚC C: Lấy file PHIẾU IN (Document)
                doc_params = {
                    "doc_type": "shippingLabel",
                    "order_item_ids": f"[{','.join(item_ids)}]",
                    "app_key": self.LAZADA_APP_KEY,
                    "timestamp": str(int(time.time() * 1000)),
                    "sign_method": "sha256",
                    "access_token": access_token
                }
                doc_params["sign"] = self._generate_lazada_sign("/order/document/get", doc_params)
                res_doc = requests.get("https://api.lazada.vn/rest/order/document/get", params=doc_params).json()

                # Bóc tách URL file PDF hoặc nội dung HTML
                doc_html = res_doc.get('data', {}).get('document', {}).get('file', '')
                if doc_html:
                    # Lazada trả về HTML chứa nhãn in, chúng ta sẽ gửi thẳng dữ liệu này lên Server
                    # Hoặc nếu là URL PDF thì tải về. Đa số API Lazada trả về HTML bọc trong JSON.
                    self.log(f"   ✅ Đã lấy được dữ liệu Phiếu in từ Lazada API.")
                    
                    # Đồng bộ trạng thái PACKING lên Server (Chuẩn ShipXanh)
                    requests.patch(f"{self.api_url}/orders/{order_id}/oms-status", json={"oms_status": "LOGISTICS_PACKAGED"})
                    
                    # Đẩy "nội dung phiếu" lên R2 (Lưu dạng .html để Web xem trực tiếp cho nét)
                    upload_url = f"{self.api_url}/upload?file=labels/{order_id}.html&token=huyvan_secret_2026"
                    up_res = requests.put(upload_url, data=doc_html.encode('utf-8'), headers={"Content-Type": "text/html"})
                    
                    if up_res.status_code == 200:
                        self.log(f"   ☁️ Đã lưu trữ nhãn in lên Cloud thành công.")
                else:
                    self.log(f"   ❌ Không lấy được tài liệu in cho đơn {order_id}: {res_doc.get('message')}")

            except Exception as e:
                self.log(f"   ❌ Lỗi xử lý đơn {order_id}: {e}")

        self.log("[*] Phiên xử lý API Lazada kết thúc.")