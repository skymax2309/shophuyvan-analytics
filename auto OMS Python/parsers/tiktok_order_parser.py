import re
from bs4 import BeautifulSoup

class TiktokOrderParser:
    def __init__(self, log_callback):
        self.log = log_callback

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
                
                orders.append({
                    "order_id": order_id,
                    "buyer_name": buyer_name,
                    "total_price": total_price,
                    "carrier": carrier,
                    "status": status,
                    "tab_source": current_tab,
                    "tracking_number": "", # Thường TikTok ẩn mã vận đơn ở màn hình ngoài
                    "items": [
                        {
                            "name": "Sản phẩm TikTok", # Web ẩn tên SP chi tiết, tạm gán nhãn
                            "variation": "",
                            "quantity": 1,
                            "image": ""
                        }
                    ]
                })
            except Exception as e:
                self.log(f"   ⚠️ Lỗi bóc tách 1 đơn TikTok: {e}")
        
        return orders
