import re
from bs4 import BeautifulSoup

class TiktokOrderParser:
    def __init__(self, log_callback):
        self.log = log_callback

    def _normalize_status(self, raw_status):
        """Bộ lọc vạn năng: Chuẩn hóa 100% ngôn ngữ Sàn về mã chuẩn ShipXanh [CẬP NHẬT TIKTOK]"""
        raw = str(raw_status).lower().strip()
        
        # 🌟 1. Xử lý Case đặc biệt của bác: Bị hủy bởi Tiktok -> Giao thất bại
        if "bị hủy bởi tiktok" in raw: 
            return "FAILED_DELIVERY", "RETURN"

        # 🌟 2. Nhóm Hoàn Thành (Thêm Đã hoàn thành, Đã giao hàng)
        if any(x in raw for x in ["người mua xác nhận", "đã giao", "completed", "hoàn thành", "đã hoàn thành", "đã giao hàng"]): 
            return "COMPLETED", "COMPLETED"
            
        # 🌟 3. Nhóm Chờ Xử Lý (Thêm Đang chờ vận chuyển)
        if any(x in raw for x in ["chờ xác nhận", "confirmed", "ready_to_ship", "cần gửi", "chờ đóng gói", "chưa xử lý", "đang chờ vận chuyển"]): 
            return "LOGISTICS_PENDING_ARRANGE", "PENDING"
            
        # 🌟 4. Nhóm Đã Chuẩn Bị (Thêm Đang chờ lấy hàng)
        if any(x in raw for x in ["chờ lấy hàng", "processed", "đã chuẩn bị", "chờ bàn giao", "đã xử lý", "đang chờ lấy hàng"]): 
            return "LOGISTICS_REQUEST_CREATED", "PENDING"

        # 🌟 5. Nhóm Đang Giao (Thêm Đang trung chuyển)
        if any(x in raw for x in ["đang giao", "đã vận chuyển", "shipped", "đã gửi", "đang trung chuyển"]): 
            return "SHIPPED", "SHIPPING"

        if any(x in raw for x in ["đã hủy", "cancelled", "canceled"]): return "CANCELLED", "CANCELLED"
        if any(x in raw for x in ["hoàn hàng", "package returned", "trả hàng", "hủy & trả hàng"]): return "RETURN", "RETURN"
        if any(x in raw for x in ["to_return", "giao không thành công"]): return "LOGISTICS_IN_RETURN", "RETURN"
        if "lost by 3pl" in raw: return "LOGISTICS_LOST", "RETURN"
        if "giao thất bại" in raw: return "FAILED_DELIVERY", "RETURN"
        return "LOGISTICS_PENDING_ARRANGE", "PENDING"

    def parse_order_list(self, html_content, current_tab="Cần gửi"):
        """
        Mổ xẻ cục HTML của TikTok để lôi ra các thông tin cốt lõi
        """
        soup = BeautifulSoup(html_content, 'html.parser')
        orders = []

        # TỬ HUYỆT CỦA TIKTOK: Class 'order_id_number' luôn đi kèm mã đơn
        order_nodes = soup.find_all(attrs={"class": lambda c: c and "order_id_number" in c})
        
        for node in order_nodes:
            try:
                order_id = node.get_text(strip=True)
                if not order_id or not order_id.isdigit(): 
                    continue

                # Mò ngược lên thẻ cha chứa toàn bộ thông tin của dòng đơn hàng này
                parent = node.parent
                row_text = ""
                # Lùi lên tối đa 10 cấp cho đến khi tóm được giá tiền
                for _ in range(10):
                    if parent:
                        text_dump = parent.get_text(separator=" | ")
                        if "₫" in text_dump:
                            row_text = text_dump
                            break
                        parent = parent.parent
                
                if not row_text:
                    continue

                # 1. Bóc giá tiền (VD: 45.000₫ -> 45000)
                price_match = re.search(r'(\d{1,3}(?:\.\d{3})*)\s*₫', row_text)
                total_price = price_match.group(1).replace(".", "") if price_match else "0"

                # 2. Bóc Nhà vận chuyển (Dò theo từ khóa thực tế)
                carrier = "Chưa rõ ĐVVC"
                if "Ahamove" in row_text: carrier = "Ahamove"
                elif "J&T Express" in row_text: carrier = "J&T Express"
                elif "BeDelivery" in row_text: carrier = "BeDelivery"
                elif "Ninja Van" in row_text: carrier = "Ninja Van"
                elif "Giao Hàng Nhanh" in row_text: carrier = "GHN"
                elif "Giao Hàng Tiết Kiệm" in row_text: carrier = "GHTK"
                elif "Viettel Post" in row_text: carrier = "Viettel Post"
                elif "SPX" in row_text: carrier = "SPX Express"

                # 3. Bóc tên khách hàng (VD: u*************8, h**********1)
                buyer_match = re.search(r'([a-zA-Z0-9]\*+[a-zA-Z0-9])', row_text)
                buyer_name = buyer_match.group(1) if buyer_match else "Khách TikTok"

                # 4. Trạng thái đơn & Loại đơn
                status = current_tab
                
                # 5. Bóc tách Ảnh 
                img_url = ""
                for img in parent.find_all(['img', 'image']):
                    src = img.get('src', '') or img.get('data-src', '')
                    if src and 'http' in src and 'icon' not in src and 'avatar' not in src:
                        img_url = src
                        break

                name = ""
                variation = ""
                sku = ""
                qty = 1
                
                # 🚀 TUYỆT CHIÊU 3: Moi ruột dữ liệu đã được JS bơm vào từ Popup
                injected_div = parent.find('div', class_='huyvan-injected-data')
                if injected_div:
                    # Tách các dòng trong Popup ra thành List chuẩn
                    parts = list(injected_div.stripped_strings)
                    
                    if len(parts) > 0:
                        # Dòng 1 luôn là: "Tên sản phẩm dài thoòng loòng... x 2"
                        first_line = parts[0]
                        match_qty = re.search(r'x\s*(\d+)$', first_line.lower())
                        if match_qty:
                            qty = int(match_qty.group(1))
                            name = re.sub(r'x\s*\d+$', '', first_line, flags=re.IGNORECASE).strip()
                        else:
                            name = first_line
                            
                        # Các dòng bên dưới chứa Phân loại và SKU
                        for p in parts[1:]:
                            pl = p.lower()
                            if "sku" in pl:
                                sku = p.split(":", 1)[1].strip() if ":" in p else p.replace("SKU người bán", "").replace("SKU", "").strip()
                                sku = sku.strip(' :-') # Dọn sạch rác
                            elif "nhà sáng tạo" not in pl and len(p) > 1 and not variation:
                                variation = p

                # Nếu Tooltip bị lỗi mạng ko load được, dùng rổ ứng viên dự phòng
                if not name:
                    valid_name_candidates = []
                    texts = list(parent.stripped_strings)
                    for i, txt in enumerate(texts):
                        t = txt.strip()
                        tl = t.lower()
                        if re.match(r'^[a-zA-Z0-9]\*+[a-zA-Z0-9]$', t) or t == order_id or t.isdigit(): continue
                        if len(t) > 6 and "₫" not in t and not re.search(r'\d{2}:\d{2}', t):
                            blacklisted = ["thanh toán", "đơn hàng", "tiktok", "bồi hoàn", "vận chuyển", "chiết khấu", "tài trợ", "phút trước", "hôm nay", "hôm qua", "giây trước", "giờ trước", "mặt hàng", "j&t", "trung chuyển", "spx", "ninja van", "best express", "viettel post", "đang giao", "chờ trả lời", "kho vận", "xem thông tin", "giao nhanh"]
                            if not any(bad in tl for bad in blacklisted):
                                valid_name_candidates.append(t)
                    if valid_name_candidates:
                        name = max(valid_name_candidates, key=len)

                if not name: name = "Sản phẩm TikTok"

                shipping_st, oms_st = self._normalize_status(current_tab)
                
                orders.append({
                    "order_id": order_id,
                    "buyer_name": buyer_name,
                    "total_price": total_price,
                    "carrier": carrier,
                    "status": status,
                    "shipping_status": shipping_st,    # 🌟 Chuẩn hóa
                    "oms_status": oms_st,              # 🌟 Chuẩn hóa
                    "tab_source": current_tab,
                    "tracking_number": "",
                    "items": [{
                        "name": name,
                        "variation": variation,
                        "sku": sku,
                        "quantity": qty,
                        "image": img_url
                    }]
                })
            except Exception as e:
                self.log(f"   ⚠️ Lỗi bóc tách 1 đơn TikTok: {e}")
        
        return orders
