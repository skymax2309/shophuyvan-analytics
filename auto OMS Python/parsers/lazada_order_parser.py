import re
from datetime import datetime
from bs4 import BeautifulSoup

class LazadaOrderParser:
    def __init__(self, log_callback):
        self.log = log_callback

    def _clean_price(self, price_str):
        """[DÒ MÌN] Chuyển đổi giá tiền Lazada sang số thực chuẩn D1"""
        try:
            if not price_str: return 0.0
            clean_str = re.sub(r'[^\d]', '', str(price_str))
            return float(clean_str) if clean_str else 0.0
        except Exception as e:
            self.log(f"⚠️ [LỖI DÒ MÌN] Không thể xử lý giá tiền Lazada '{price_str}': {e}")
            return 0.0

    def _map_oms_status(self, lazada_status):
        """Ánh xạ trạng thái Lazada sang chuẩn hệ thống OMS"""
        status_map = {
            "Chờ đóng gói": "PENDING",
            "Chờ bàn giao": "HANDED_OVER",
            "Đang giao": "SHIPPING",
            "Đã giao": "COMPLETED",
            "Giao thất bại": "FAILED_DELIVERY",
            "Đã hủy": "CANCELLED_TRANSIT",
            "Trả hàng": "RETURN_REFUND"
        }
        return status_map.get(lazada_status, "PENDING")

    # Đã thêm tham số shop_name để nhận tên shop từ UI
    def parse_order_list(self, html_content, current_tab="Chờ xử lý", shop_name="Lazada Shop"):
        soup = BeautifulSoup(html_content, 'html.parser')
        orders = []
        seen_orders = set()

        # TỬ HUYỆT LAZADA: Mã đơn luôn nằm trong class này
        order_nodes = soup.select(".order-field-order-number .order-field-value, .order-field-order-number .copy-text-item")

        for node in order_nodes:
            try:
                order_id = node.get_text(strip=True)
                if not order_id or not order_id.isdigit() or order_id in seen_orders:
                    continue
                seen_orders.add(order_id)

                # Mò ngược lên thẻ cha chứa toàn bộ thông tin đơn hàng
                parent = node.parent
                row_text = ""
                for _ in range(12):
                    if parent:
                        text_dump = parent.get_text(separator=" | ")
                        if "₫" in text_dump and "Số đơn hàng" in text_dump:
                            row_text = text_dump
                            break
                        parent = parent.parent
                
                if not row_text: continue

                # 1. Bóc giá tiền
                amount_node = parent.select_one(".order-amount-col .order-field-value")
                if amount_node:
                    total_price = re.sub(r'[^\d]', '', amount_node.get_text())
                else:
                    price_match = re.search(r'([\d,]+)\s*₫', row_text)
                    total_price = price_match.group(1).replace(",", "") if price_match else "0"

                # 2. Bóc Nhà vận chuyển
                carrier_node = parent.select_one(".order-field-fm-3-pl .order-field-value, .order-field-first-mile .order-field-value")
                carrier = carrier_node.get_text(strip=True) if carrier_node else "Lazada Express (LEX)"
                if "AhaMove" in carrier or "AhaMove" in row_text: carrier = "Ahamove"
                elif "BEST" in carrier or "BEST" in row_text: carrier = "BEST Express"
                elif "J&T" in carrier or "J&T" in row_text: carrier = "J&T Express"
                elif "Ninja" in carrier or "Ninja" in row_text: carrier = "Ninja Van"

                # 3. Bóc mã vận đơn & Tên khách
                tracking_node = parent.select_one(".order-field-tracking-number .order-field-value")
                tracking_number = tracking_node.get_text(strip=True) if tracking_node else ""
                
                buyer_node = parent.select_one(".order-header-chat-box")
                buyer_name = buyer_node.get_text(strip=True) if buyer_node else "Khách Lazada"

                # 4. Sản phẩm đại diện & Hình ảnh & SKU
                img_node = parent.select_one("img")
                img_url = img_node.get("src", "") if img_node else ""
                if img_url and img_url.startswith("//"):
                    img_url = "https:" + img_url

                product_node = parent.select_one(".product-title-text, .product-name")
                product_name = product_node.get_text(strip=True) if product_node else "Sản phẩm Lazada"

                qty_node = parent.select_one(".order-item-count, .item-count")
                quantity = re.sub(r'[^\d]', '', qty_node.get_text()) if qty_node else "1"

                variation = ""
                sku = ""
                order_date = ""
                
                # Quét text tàng hình để lấy SKU và Ngày tháng
                texts = list(parent.stripped_strings)
                for i, txt in enumerate(texts):
                    txt_lower = txt.lower()
                    
                    # Bóc SKU
                    if "sku" in txt_lower:
                        if ":" in txt:
                            sku = txt.split(":", 1)[1].strip()
                        elif i + 1 < len(texts):
                            sku = texts[i+1]
                    
                    # Bóc Phân loại
                    elif "phân loại" in txt_lower or "variation" in txt_lower or "màu" in txt_lower or "kích thước" in txt_lower:
                        if ":" in txt:
                            variation = txt.split(":", 1)[1].strip()
                            
                    # Bóc Ngày đặt hàng (Lazada có dạng: 02 Apr 2026 15:43)
                    if not order_date:
                        # Dò định dạng: DD MMM YYYY (VD: 02 Apr 2026)
                        en_match = re.search(r'(\d{2})\s+([A-Za-z]+)\s+(\d{4})(?:\s+(\d{2}:\d{2}))?', txt)
                        if en_match:
                            dd = en_match.group(1)
                            mmm = en_match.group(2)[:3].lower()
                            yyyy = en_match.group(3)
                            time_str = en_match.group(4) or "00:00"
                            
                            month_map = {'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'may': '05', 'jun': '06', 
                                         'jul': '07', 'aug': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'}
                            mm = month_map.get(mmm, '01')
                            order_date = f"{yyyy}-{mm}-{dd} {time_str}:00"
                            
                        # Dò định dạng cũ (dd/mm/yyyy hoặc dd thg mm) nếu có
                        elif re.search(r'(\d{2}[-/]\d{2}[-/]\d{4})', txt):
                            d_match = re.search(r'(\d{2}[-/]\d{2}[-/]\d{4})', txt)
                            raw_date = d_match.group(1).replace('/', '-')
                            order_date = f"{raw_date[6:10]}-{raw_date[3:5]}-{raw_date[0:2]} 00:00:00" if raw_date[2] == '-' else f"{raw_date} 00:00:00"

                # --- QUY TẮC THÉP: KHÔNG CÓ NGÀY ĐẶT HÀNG -> BÁO LỖI ---
                if not order_date:
                    self.log(f"❌ [LỖI DỮ LIỆU] Đơn {order_id} không tìm thấy Ngày đặt hàng Lazada!")
                    continue

                # --- CHUẨN HÓA DATA THEO SCHEMA D1 ---
                revenue_numeric = self._clean_price(total_price)
                oms_st = self._map_oms_status(current_tab)

                orders.append({
                    "order_id": order_id,
                    "platform": "lazada",
                    "shop": shop_name,
                    "order_date": order_date,
                    "customer_name": buyer_name,
                    "revenue": revenue_numeric,
                    "raw_revenue": revenue_numeric,
                    "status": current_tab,
                    "oms_status": oms_st,
                    "tracking_number": tracking_number,
                    "shipping_carrier": carrier,
                    "oms_updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    "items": [{
                        "sku": sku,
                        "variation": variation,
                        "product_name": product_name,
                        "qty": int(quantity),
                        "image_url": img_url
                    }]
                })
                self.log(f"✅ [DÒ MÌN] Đơn {order_id} | {revenue_numeric}đ | {oms_st}")

            except Exception as e:
                self.log(f"   ⚠️ Lỗi bóc 1 đơn Lazada: {e}")

        return orders