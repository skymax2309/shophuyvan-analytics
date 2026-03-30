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

                # 2. Sản phẩm (Bọc thép bằng CSS Selector)
                items = []
                import re
                
                # Lấy tất cả tên sản phẩm làm điểm neo
                name_elements = order_container.find_all('div', class_='item-name')
                
                for name_el in name_elements:
                    name = name_el.text.strip()
                    if not name or len(name) < 3: continue
                        
                    # Lùi lên lớp cha để lấy toàn bộ thông tin của 1 sản phẩm cụ thể
                    prod_container = name_el.find_parent('div', class_=['item-inner', 'item', 'item-info']) or name_el.parent.parent
                    
                    var_el = prod_container.find('div', class_='item-description')
                    variation = var_el.text.replace('Variation:', '').replace('Phân loại hàng:', '').replace('Phân loại:', '').strip() if var_el else ""
                    
                    # Nếu Shopee ẩn số lượng (thường là khi số lượng = 1), mặc định cho bằng 1
                    qty_el = prod_container.find('div', class_='item-amount')
                    qty = qty_el.text.replace('x', '').strip() if qty_el else "1"
                    
                    # Tìm ảnh: Shopee có thể dùng thẻ img hoặc style background-image
                    img_url = ""
                    larger_container = name_el.find_parent('div', class_=['item-list', 'item']) or prod_container.parent.parent
                    img_el = larger_container.find('img')
                    
                    if img_el:
                        img_url = img_el.get('src') or img_el.get('data-src') or ""
                    else:
                        bg_div = larger_container.find(style=re.compile(r'background-image', re.IGNORECASE))
                        if bg_div:
                            match = re.search(r'url\([\'"]?([^\'"\)]+)[\'"]?\)', bg_div.get('style', ''))
                            if match: img_url = match.group(1)

                    items.append({
                        "name": name,
                        "variation": variation,
                        "quantity": qty,
                        "image": img_url
                    })

                # --- [QUY TẮC 10] AUTO UI LOGGER ---
                if len(items) == 0:
                    self.log(f"⚠️ [DÒ MÌN] Đơn {order_sn} bị tàng hình sản phẩm!")
                    self.log(f"🔎 [TEXT]: {list(order_container.stripped_strings)}")
                    
                    # Tự động xuất cấu trúc HTML Class để debug nhanh (Ý tưởng của bác)
                    html_structure = []
                    for tag in order_container.find_all(True):
                        classes = tag.get('class')
                        if classes:
                            html_structure.append(f"[{tag.name.upper()}] class='{' '.join(classes)}'")
                    self.log(f"🧬 [CẤU TRÚC HTML]: {' -> '.join(html_structure[:15])} ...")

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
