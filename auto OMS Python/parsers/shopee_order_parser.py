from bs4 import BeautifulSoup

class ShopeeOrderParser:
    def __init__(self, log_callback):
        self.log = log_callback

    def parse_order_list(self, html_content, cached_ids=None):
        if cached_ids is None:
            cached_ids = set()
            
        soup = BeautifulSoup(html_content, 'html.parser')
        orders = []
        import re

        # 1. TÌM ĐIỂM NEO (Tìm tất cả text chứa "Mã đơn hàng")
        order_sn_texts = soup.find_all(string=re.compile(r'Mã đơn hàng\s+[A-Z0-9]+'))
        
        orders_found = []
        seen_ids = set()
        for text_node in order_sn_texts:
            match = re.search(r'Mã đơn hàng\s+([A-Z0-9]+)', text_node)
            if match:
                o_id = match.group(1)
                
                # 🚀 KỸ THUẬT NÉ MÌN: Nếu đơn đã nằm trong Sổ đen -> Bỏ qua không tốn công bóc tách
                if o_id in cached_ids:
                    continue
                    
                if o_id not in seen_ids:
                    seen_ids.add(o_id)
                    orders_found.append((o_id, text_node.parent))

        # 2. XỬ LÝ TỪNG ĐƠN ĐÃ CÁCH LY
        for order_sn, sn_el in orders_found:
            try:
                # Thuật toán Đóng thùng: Lùi lên cha đến khi chạm ranh giới đơn khác thì dừng
                order_container = sn_el
                while order_container.parent and order_container.parent.name not in ['body', 'html']:
                    sn_nodes = order_container.parent.find_all(string=re.compile(r'Mã đơn hàng\s+[A-Z0-9]+'))
                    ids = set()
                    for n in sn_nodes:
                        m = re.search(r'Mã đơn hàng\s+([A-Z0-9]+)', n)
                        if m: ids.add(m.group(1))
                    if len(ids) > 1:
                        break # Dừng lại, order_container hiện tại là thùng chứa chuẩn 1 đơn
                    order_container = order_container.parent

                # ----------------------------------------------------
                # Giờ order_container chứa CHÍNH XÁC 1 đơn, không lẹm!
                # ----------------------------------------------------
                
                # Người mua
                buyer_el = order_container.find('div', class_='buyer-username')
                buyer_name = buyer_el.text.strip() if buyer_el else ""

                # Sản phẩm
                items = []
                name_elements = order_container.find_all('div', class_='item-name')
                
                for name_el in name_elements:
                    name = name_el.text.strip()
                    if not name or len(name) < 3: continue
                        
                    prod_container = name_el.find_parent('div', class_=['item-inner', 'item', 'item-info']) or name_el.parent.parent
                    
                    var_el = prod_container.find('div', class_='item-description')
                    variation = var_el.text.replace('Variation:', '').replace('Phân loại hàng:', '').replace('Phân loại:', '').strip() if var_el else ""
                    
                    qty_el = prod_container.find('div', class_='item-amount')
                    qty = re.sub(r'[^\d]', '', qty_el.text) if qty_el else "1"
                    if not qty: qty = "1"
                    
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

                # --- AUTO UI LOGGER ---
                if len(items) == 0:
                    self.log(f"⚠️ [DÒ MÌN] Đơn {order_sn} bị tàng hình SP! Text: {list(order_container.stripped_strings)}")
                else:
                    self.log(f"✅ Đã nhặt được {len(items)} SP cho đơn {order_sn}")

                # Giá tiền
                price_el = order_container.find('div', class_='total-price')
                total_price = price_el.text.strip() if price_el else "0"
                if total_price == "0": # Backup cho Tab Đã Hủy
                    price_text = order_container.find(string=re.compile(r'₫[\d\.,]+'))
                    if price_text: total_price = price_text.strip()

                # Trạng thái
                status_el = order_container.find('div', class_='order-status') or order_container.find('span', class_='status')
                status = status_el.text.strip() if status_el else ""

                # Vận đơn & ĐVVC
                tracking_el = order_container.find('div', class_='tracking-number')
                tracking_number = tracking_el.text.strip() if tracking_el else ""

                carrier = ""
                carrier_info = order_container.find('div', class_='order-fulfilment-info')
                if carrier_info:
                    texts = list(carrier_info.stripped_strings)
                    if len(texts) >= 2: carrier = texts[1]
                    elif len(texts) == 1: carrier = texts[0]
                
                if not carrier:
                    carrier_el = order_container.find('div', class_='fulfilment-channel-name') or order_container.find('div', class_='maksed-channel-name')
                    carrier = carrier_el.text.strip() if carrier_el else ""
                
                if not carrier: # Backup cho Tab Đã Hủy
                    c = order_container.find(string=re.compile('SPX|Giao Hàng Nhanh|J&T|Ninja|Viettel|BEST'))
                    if c: carrier = c.strip()

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
                self.log(f"⚠️ Lỗi bóc tách 1 đơn hàng nội bộ ({order_sn}): {e}")

        self.log(f"✅ Bóc tách thành công {len(orders)} đơn hàng!")
        return orders
