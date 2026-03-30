from bs4 import BeautifulSoup

class ShopeeOrderParser:
    def __init__(self, log_callback):
        self.log = log_callback

    def parse_order_list(self, html_content):
        soup = BeautifulSoup(html_content, 'html.parser')
        orders = []

        # Shopee luôn bắt đầu mỗi đơn hàng bằng thẻ chứa class 'order-card-header'
        headers = soup.find_all('div', class_='order-card-header')
        
        for header in headers:
            try:
                # Lùi ra 2 lớp thẻ cha để lấy khối bao trọn toàn bộ 1 đơn hàng
                order_container = header.parent.parent 

                # 1. Mã đơn hàng & Người mua
                order_sn_el = order_container.find('span', class_='order-sn')
                order_sn = order_sn_el.text.replace('Mã đơn hàng', '').strip() if order_sn_el else ""

                buyer_el = order_container.find('div', class_='buyer-username')
                buyer_name = buyer_el.text.strip() if buyer_el else ""

                # 2. Sản phẩm (Bọc thép bằng Thuật toán Đọc luồng Text)
                items = []
                texts = list(order_container.stripped_strings)
                import re
                
                for i, text in enumerate(texts):
                    # Tìm mốc là thẻ số lượng (VD: 'x 1', 'x 2', 'x 15')
                    if re.match(r'^x\s*\d+$', text, re.IGNORECASE):
                        qty = re.sub(r'[^\d]', '', text)
                        variation = ""
                        name = ""
                        
                        if i > 0:
                            prev_text = texts[i-1]
                            # Nếu có thẻ Phân loại
                            if "Variation:" in prev_text or "Phân loại" in prev_text:
                                variation = re.sub(r'^(Variation:|Phân loại hàng:|Phân loại:)', '', prev_text).strip()
                                if i > 1:
                                    name = texts[i-2] # Tên SP nằm trên Phân loại
                            else:
                                # Nếu không có Phân loại, Tên SP nằm ngay trên Số lượng
                                name = prev_text
                                
                        # Lọc bỏ rác
                        if name and len(name) > 3 and "Mã đơn" not in name and "Người mua" not in name:
                            items.append({
                                "name": name,
                                "variation": variation,
                                "quantity": qty
                            })

                # 3. Giá tiền
                price_el = order_container.find('div', class_='total-price')
                total_price = price_el.text.strip() if price_el else "0"

                # 4. Trạng thái Đơn hàng
                status_el = order_container.find('div', class_='order-status') or order_container.find('span', class_='status')
                status = status_el.text.strip() if status_el else ""

                # 5. Mã Vận Đơn & ĐVVC
                tracking_el = order_container.find('div', class_='tracking-number')
                tracking_number = tracking_el.text.strip() if tracking_el else ""

                carrier = ""
                carrier_info = order_container.find('div', class_='order-fulfilment-info')
                if carrier_info:
                    texts = list(carrier_info.stripped_strings)
                    # Shopee gộp: ['Nhanh', 'SPX Express', 'Drop off'] -> Lấy phần tử số 2
                    if len(texts) >= 2:
                        carrier = texts[1]
                    elif len(texts) == 1:
                        carrier = texts[0]
                
                if not carrier: # Phương án dự phòng
                    carrier_el = order_container.find('div', class_='fulfilment-channel-name') or order_container.find('div', class_='maksed-channel-name')
                    carrier = carrier_el.text.strip() if carrier_el else ""

                # Đóng gói thành JSON
                if order_sn:
                    orders.append({
                        "order_id": order_sn,
                        "buyer_name": buyer_name,
                        "items": items,
                        "total_price": total_price,
                        "status": status,
                        "tracking_number": tracking_number,
                        "carrier": carrier
                    })
            except Exception as e:
                self.log(f"⚠️ Lỗi bóc tách 1 đơn hàng nội bộ: {e}")

        self.log(f"✅ Bóc tách thành công {len(orders)} đơn hàng!")
        return orders
