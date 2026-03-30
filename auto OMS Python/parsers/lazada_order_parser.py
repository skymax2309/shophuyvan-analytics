import re
from bs4 import BeautifulSoup

class LazadaOrderParser:
    def __init__(self, log_callback):
        self.log = log_callback

    def parse_order_list(self, html_content, current_tab="Chờ xử lý"):
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

                # 4. Sản phẩm đại diện
                product_node = parent.select_one(".product-title-text")
                product_name = product_node.get_text(strip=True) if product_node else "Sản phẩm Lazada"

                sku_node = parent.select_one(".order-field-sku-info .order-field-value")
                variation = sku_node.get_text(strip=True) if sku_node else ""

                qty_node = parent.select_one(".order-item-count")
                quantity = re.sub(r'[^\d]', '', qty_node.get_text()) if qty_node else "1"

                orders.append({
                    "order_id": order_id,
                    "buyer_name": buyer_name,
                    "total_price": total_price,
                    "carrier": carrier,
                    "status": current_tab,
                    "tab_source": current_tab,
                    "tracking_number": tracking_number,
                    "items": [{"name": product_name, "variation": variation, "quantity": quantity, "image": ""}]
                })
            except Exception as e:
                self.log(f"   ⚠️ Lỗi bóc 1 đơn Lazada: {e}")

        return orders
