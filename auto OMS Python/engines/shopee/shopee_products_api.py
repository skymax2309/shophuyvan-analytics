import asyncio
import requests
import sys
import os

class ShopeeProductsAPI:
    def __init__(self, log_func, auth):
        self.log = log_func
        self.auth = auth

    def _sign_shopee_api(self, path, access_token, shop_id):
        import time, hmac, hashlib
        partner_id = "2013730"
        partner_key = "shpk66746e4845745341714d6b63656a5a6c7049524b7444486c4a686c4d4a4d"
        timestamp = int(time.time())
        base_string = f"{partner_id}{path}{timestamp}{access_token}{shop_id}"
        sign = hmac.new(partner_key.encode('utf-8'), base_string.encode('utf-8'), hashlib.sha256).hexdigest()
        return f"https://partner.shopeemobile.com{path}?partner_id={partner_id}&timestamp={timestamp}&access_token={access_token}&shop_id={shop_id}&sign={sign}"

    async def sync_by_api(self, token, shop_id, shop_name):
        self.log(f"📡 Đang tải danh sách ID Sản phẩm từ Shopee API...")
        
        all_item_ids = []
        offset = 0
        
        while True:
            url_list = self._sign_shopee_api("/api/v2/product/get_item_list", token, shop_id)
            res = requests.get(f"{url_list}&offset={offset}&page_size=50&item_status=NORMAL")
            res_list = res.json()
            
            # 🌟 GẮN LOG DÒ MÌN API: Bắt lỗi nếu Shopee từ chối (Sai Token, Sai Shop ID, v.v...)
            if res_list.get("error"):
                self.log(f"❌ LỖI API SHOPEE: {res_list.get('message', res_list.get('error'))}")
                self.log(f"🔍 Dữ liệu gốc: {res_list}")
                break
                
            items = res_list.get("response", {}).get("item", [])
            if not items and offset == 0:
                self.log(f"⚠️ Shopee báo kết nối thành công nhưng không có sản phẩm. Dữ liệu gốc: {res_list}")
                
            for it in items: all_item_ids.append(str(it["item_id"]))
            
            if not res_list.get("response", {}).get("has_next_page"): break
            offset += 50
            
        self.log(f"✅ Tìm thấy {len(all_item_ids)} sản phẩm. Đang chọc API lấy Chi tiết & Tồn kho...")
        
        all_products_data = []
        
        for i in range(0, len(all_item_ids), 50):
            chunk = all_item_ids[i:i+50]
            chunk_str = ",".join(chunk)
            
            url_base = self._sign_shopee_api("/api/v2/product/get_item_base_info", token, shop_id)
            res_base = requests.get(f"{url_base}&item_id_list={chunk_str}").json()
            base_items = res_base.get("response", {}).get("item_list", [])
            
            url_model = self._sign_shopee_api("/api/v2/product/get_model_list", token, shop_id)
            res_model = requests.get(f"{url_model}&item_id_list={chunk_str}").json()
            model_items = res_model.get("response", {}).get("tier_variation", [])
            
            for base in base_items:
                item_id = str(base["item_id"])
                product_name = base.get("item_name", "")
                
                images = []
                for img_hash in base.get("image", {}).get("image_id_list", []):
                    images.append(f"https://cf.shopee.vn/file/{img_hash}")
                    
                variations = []
                matching_models = next((m for m in model_items if str(m["item_id"]) == item_id), None)
                
                if matching_models and matching_models.get("model"):
                    tier_names = matching_models.get("tier_variation", [])
                    models = matching_models.get("model", [])
                    
                    for m in models:
                        var_name_parts = []
                        for idx, tier_idx in enumerate(m.get("tier_index", [])):
                            if idx < len(tier_names):
                                opt_list = tier_names[idx].get("option_list", [])
                                if tier_idx < len(opt_list):
                                    var_name_parts.append(opt_list[tier_idx].get("option", ""))
                        
                        v_name = " - ".join(var_name_parts)
                        sku = m.get("model_sku", "").strip() # LẤY DATA THẬT
                        
                        stock_info = m.get("stock_info", [])
                        stock = stock_info[0].get("normal_stock", 0) if stock_info else 0
                        price = m.get("price_info", [{}])[0].get("current_price", 0)
                        
                        variations.append({
                            "variation_name": v_name,
                            "sku": sku,
                            "price": price,
                            "stock": stock,
                            "variation_image": "" 
                        })
                else:
                    sku = base.get("item_sku", "").strip() # LẤY DATA THẬT
                    stock = 0
                    if matching_models and isinstance(matching_models.get("model"), list) and len(matching_models["model"]) > 0:
                        stock_info = matching_models["model"][0].get("stock_info", [])
                        stock = stock_info[0].get("normal_stock", 0) if stock_info else 0
                        
                    variations.append({
                        "variation_name": "Mặc định",
                        "sku": sku,
                        "price": 0, 
                        "stock": stock,
                        "variation_image": ""
                    })

                all_products_data.append({
                    "item_id": item_id,
                    "product_name": product_name,
                    "description": base.get("description", ""),
                    "images": images,
                    "variations": variations,
                    "shop": shop_name,
                    "platform": "shopee",
                    "parent_sku": base.get("item_sku", "").strip() 
                })
                
            self.log(f"   🔄 Đã bóc tách xong {len(all_products_data)}/{len(all_item_ids)} sản phẩm...")
            await asyncio.sleep(0.5)

        if all_products_data:
            self.log(f"📤 Đang đẩy {len(all_products_data)} Sản phẩm & Tồn kho lên Website...")
            sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            try:
                from engines.product_core_hub import ProductCoreHub
                hub = ProductCoreHub(self.log)
                hub.sync_products(shop_name, "shopee", all_products_data)
                self.log(f"🎉 HOÀN TẤT ĐỒNG BỘ SẢN PHẨM & TỒN KHO BẰNG API!")
            except Exception as e:
                self.log(f"❌ Lỗi đẩy Hub: {e}")
