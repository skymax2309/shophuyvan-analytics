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

    def _normalize_status(self, raw_status):
        """Bộ lọc vạn năng: Chuẩn hóa 100% ngôn ngữ Sàn về mã chuẩn ShipXanh"""
        raw = str(raw_status).lower().strip()
        
        # 🌟 Bế "to_confirm_receive" lên nhóm Hoàn Thành
        if any(x in raw for x in ["người mua xác nhận", "đã giao", "delivered", "completed", "hoàn thành", "to_confirm_receive"]): 
            return "COMPLETED", "COMPLETED"
            
        # 🌟 Đã xóa "to_confirm_receive" khỏi nhóm này
        if any(x in raw for x in ["chờ xác nhận", "confirmed", "ready_to_ship", "cần gửi", "chờ đóng gói", "chưa xử lý"]): 
            return "LOGISTICS_PENDING_ARRANGE", "PENDING"
            
        if any(x in raw for x in ["chờ lấy hàng", "processed", "đã chuẩn bị", "chờ bàn giao", "đã xử lý"]): return "LOGISTICS_REQUEST_CREATED", "PENDING"
        if any(x in raw for x in ["đang giao", "đã vận chuyển", "shipped", "đã gửi"]): return "SHIPPED", "SHIPPING"
        if any(x in raw for x in ["đã hủy", "cancelled", "canceled"]): return "CANCELLED", "RETURN"
        if any(x in raw for x in ["hoàn hàng", "package returned", "trả hàng", "hủy & trả hàng"]): return "RETURN", "RETURN"
        if any(x in raw for x in ["to_return", "giao không thành công"]): return "LOGISTICS_IN_RETURN", "RETURN"
        if "lost by 3pl" in raw: return "LOGISTICS_LOST", "RETURN"
        if "giao thất bại" in raw: return "FAILED_DELIVERY", "RETURN"
        return "LOGISTICS_PENDING_ARRANGE", "PENDING"

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
                        # Nới lỏng điều kiện để bắt được cả Tab Trả hàng (chứa chữ "Đơn hàng:")
                        if "₫" in text_dump and ("Số đơn hàng" in text_dump or "Đơn hàng:" in text_dump):
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

                # 2. Bóc Nhà vận chuyển (Neo từ khóa quét toàn diện)
                carrier = "Lazada Express (LEX)" # Mặc định
                row_upper = row_text.upper()
                if "BEST" in row_upper: carrier = "BEST Express"
                elif "J&T" in row_upper: carrier = "J&T Express"
                elif "NINJA" in row_upper: carrier = "Ninja Van"
                elif "AHAMOVE" in row_upper: carrier = "Ahamove"
                elif "GHN" in row_upper or "GIAO HÀNG NHANH" in row_upper: carrier = "Giao Hàng Nhanh"
                elif "GHTK" in row_upper or "GIAO HÀNG TIẾT KIỆM" in row_upper: carrier = "Giao Hàng Tiết Kiệm"
                elif "VIETTEL" in row_upper: carrier = "Viettel Post"

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
                
                # 🌟 DÒ TÌM NGÀY ĐẶT HÀNG TRỰC TIẾP TỪ GIAO DIỆN (Đặc trị Tab Trả Hàng)
                full_text = parent.get_text(separator=" ")
                # Tìm chuỗi "Ngày đặt hàng: 2026-01-12 00:24:46"
                exact_date_match = re.search(r'Ngày đặt hàng:\s*(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2})', full_text, re.IGNORECASE)
                if exact_date_match:
                    order_date = exact_date_match.group(1)
                
                # Quét text tàng hình để lấy SKU và Ngày tháng (nếu Tab này không có chữ Ngày đặt hàng)
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
                shipping_st, oms_st = self._normalize_status(current_tab)

                orders.append({
                    "order_id": order_id,
                    "platform": "lazada",
                    "shop": shop_name,
                    "order_date": order_date,
                    "customer_name": buyer_name,
                    "revenue": revenue_numeric,
                    "raw_revenue": revenue_numeric,
                    "status": current_tab,
                    "shipping_status": shipping_st,    # 🌟 Chuẩn hóa
                    "oms_status": oms_st,              # 🌟 Chuẩn hóa
                    "tracking_number": tracking_number,
                    "shipping_carrier": carrier,
                    "oms_updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    "items": [{
                        "sku": sku,
                        "variation_name": variation, # Đổi tên để khớp với Server
                        "clean_variation": variation, # Lazada không kẹp mã vào ngoặc vuông nên bản gốc = bản sạch
                        "product_name": product_name,
                        "qty": int(quantity),
                        "image_url": img_url
                    }]
                })
                self.log(f"✅ [DÒ MÌN] Đơn {order_id} | {revenue_numeric}đ | {oms_st}")

            except Exception as e:
                self.log(f"   ⚠️ Lỗi bóc 1 đơn Lazada: {e}")

        return orders