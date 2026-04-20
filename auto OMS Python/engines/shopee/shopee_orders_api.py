import time
import requests
import json
import os
from datetime import datetime

class ShopeeOrdersAPI:
    def __init__(self, log_func, parser):
        self.log = log_func
        self.parser = parser

    async def scrape_by_api(self, token, shop_name, limits, mode, token_mgr):
        shopee_id_map = {
            "chihuy2309": 166563639
        }
        target = str(shop_name).strip().lower()
        shop_id = shopee_id_map.get(target)
        
        if not shop_id:
            self.log(f"   ❌ Lỗi: Không tìm thấy Shop ID cho shop '{shop_name}'. Kéo API thất bại.")
            return []

        time_to = int(time.time())
        time_from = time_to - 15 * 86400 
        
        all_order_sns = []
        cursor = ""
        path_list = "/api/v2/order/get_order_list"
        
        self.log(f"   📡 Bắt đầu gọi Shopee API kéo danh sách đơn (15 ngày qua)...")
        while True:
            url_list = token_mgr.sign_api_request(path_list, token, shop_id)
            url_list += f"&time_range_field=update_time&time_from={time_from}&time_to={time_to}&page_size=50&cursor={cursor}"
            
            try:
                res = requests.get(url_list, timeout=15)
                data = res.json()
                if data.get("error"):
                    self.log(f"   ❌ LỖI API SHOPEE: {data.get('message', data.get('error'))}")
                    return False # Trả về False để đánh thức Auto Refresh của Quản gia
                
                # ĐÃ FIX LỖI LÙI LỀ Ở ĐOẠN NÀY
                order_list = data.get("response", {}).get("order_list", [])
                for o in order_list:
                    all_order_sns.append(str(o.get("order_sn")))
                
                if not data.get("response", {}).get("more"):
                    break
                cursor = data.get("response", {}).get("next_cursor", "")
                if not cursor: break
                
            except Exception as e:
                self.log(f"   ⚠️ Đứt cáp khi gọi API: {e}")
                break

        if not all_order_sns:
            self.log("   ✅ Không có đơn hàng nào trong 15 ngày qua trên API Shopee.")
            return []
            
        self.log(f"   📦 Lấy thành công {len(all_order_sns)} mã đơn. Đang chọc API lấy Chi Tiết...")
        
        path_detail = "/api/v2/order/get_order_detail"
        valid_orders = []
        cache_file = f"cache_orders_shopee_{shop_name}.json"
        
        cached_final_orders = {}
        if os.path.exists(cache_file):
            try:
                with open(cache_file, "r") as f:
                    cached_final_orders = json.load(f)
            except: pass
            
        newly_completed = {}
        
        for i in range(0, len(all_order_sns), 50):
            chunk = all_order_sns[i:i+50]
            url_detail = token_mgr.sign_api_request(path_detail, token, shop_id)
            sn_str = ",".join(chunk)
            
            url_detail += f"&order_sn_list={sn_str}&response_optional_fields=item_list,recipient_address,buyer_username,shipping_carrier,checkout_shipping_carrier"
            
            try:
                res = requests.get(url_detail, timeout=15)
                data = res.json()
                order_list = data.get("response", {}).get("order_list", [])
                
                for o in order_list:
                    order_sn = o.get("order_sn")
                    raw_status = o.get("order_status")
                    update_time = str(o.get("update_time", ""))
                    
                    if cached_final_orders.get(order_sn) == update_time: continue 
                        
                    if raw_status == "UNPAID": continue
                    
                    # 🌟 Bộ từ điển chuẩn 2 tầng cho Shopee API
                    status_map = {
                        "READY_TO_SHIP": ("PENDING", "LOGISTICS_PENDING_ARRANGE"),
                        "PROCESSED": ("PENDING", "LOGISTICS_REQUEST_CREATED"),
                        "SHIPPED": ("SHIPPING", "SHIPPED"),
                        "TO_CONFIRM_RECEIVE": ("COMPLETED", "COMPLETED"),
                        "COMPLETED": ("COMPLETED", "COMPLETED"),
                        "CANCELLED": ("CANCELLED", "CANCELLED"),
                        "IN_CANCEL": ("RETURN", "LOGISTICS_IN_RETURN"),
                        "TO_RETURN": ("RETURN", "RETURN")
                    }
                    
                    mapped_statuses = status_map.get(raw_status, ("PENDING", "LOGISTICS_PENDING_ARRANGE"))
                    oms_st = mapped_statuses[0]
                    shipping_st = mapped_statuses[1]
                    
                    buyer_name = o.get("buyer_username") or o.get("recipient_address", {}).get("name", "Khách Shopee")
                    
                    carrier_api = str(o.get("shipping_carrier") or "").strip()
                    checkout_api = str(o.get("checkout_shipping_carrier") or "").strip()
                    carrier = carrier_api if carrier_api else checkout_api
                    
                    if carrier.lower() == "nhanh" or carrier == "Standard": carrier = "SPX Express - Nhanh"
                    elif carrier.lower() == "hỏa tốc" or carrier == "Instant": carrier = "SPX Express - Hỏa Tốc"
                    elif carrier.lower() == "tiết kiệm" or carrier == "Economy": carrier = "SPX Express - Tiết Kiệm"
                    elif not carrier: carrier = "SPX Express"
                    
                    items_list = []
                    total_rev = 0
                    for it in o.get("item_list", []):
                        price = float(it.get("model_discounted_price") or it.get("item_price") or 0)
                        qty = int(it.get("model_quantity_purchased", 1))
                        total_rev += price * qty
                        
                        img_id = it.get("image_info", {}).get("image_url", "")
                        img_url = f"https://cf.shopee.vn/file/{img_id}" if img_id and not str(img_id).startswith("http") else img_id
                        var_name = it.get("model_name", "")
                        
                        items_list.append({
                            "sku": it.get("model_sku") or it.get("item_sku", ""),
                            "variation": var_name,
                            "name": it.get("item_name", "Sản phẩm Shopee"),
                            "quantity": qty, 
                            "image": img_url 
                        })
                        
                    revenue_numeric = float(o.get("total_amount") or 0)
                    if revenue_numeric == 0:
                        revenue_numeric = total_rev
                        
                    date_str = datetime.fromtimestamp(o.get("create_time")).strftime("%Y-%m-%d %H:%M:%S")
                    
                    valid_orders.append({
                        "order_id": order_sn,
                        "shop": shop_name,
                        "platform": "shopee",
                        "customer_name": buyer_name,
                        "order_date": date_str,
                        "revenue": revenue_numeric,
                        "raw_revenue": revenue_numeric,
                        "shipping_carrier": carrier,
                        "tracking_number": o.get("tracking_no", ""),
                        "oms_status": oms_st,              # 🌟 Mã Vỏ chuẩn
                        "order_type": "normal",
                        "shipping_status": shipping_st,    # 🌟 Mã Ruột chuẩn
                        "items": items_list
                    })
                    newly_completed[order_sn] = update_time
                    
            except Exception as e:
                self.log(f"   ⚠️ Lỗi lấy chi tiết đơn: {e}")
                
        if newly_completed:
            cached_final_orders.update(newly_completed)
            with open(cache_file, "w") as f:
                json.dump(cached_final_orders, f, indent=4)
            self.log(f"   💾 SỔ ĐEN: Đã lưu vết {len(newly_completed)} đơn.")
            
        self.log(f"   🎉 HOÀN TẤT API! Đã nhặt được {len(valid_orders)} đơn hàng.")
        return valid_orders
