import openpyxl
import unicodedata

# Thêm dòng này
try:
    import openpyxl
    HAS_OPENPYXL = True
except ImportError:
    HAS_OPENPYXL = False

class ShopeeParser:
    def __init__(self, log_func):
        self.log = log_func

    # Kéo hàm này ra ngang hàng với __init__
    def parse_shopee_excel(self, local_path, shop_name):
        if not HAS_OPENPYXL:
            self.log("⚠️ Không có openpyxl, bỏ qua parse Excel")
            return None
        try:
            # KHÔNG dùng read_only=True vì bị lỗi chỉ đọc 1 cột
            wb = openpyxl.load_workbook(local_path, data_only=True)
            ws = wb.active
            headers = []
            orders_map = {}
            items = []

            import unicodedata
            for i, row in enumerate(ws.iter_rows(values_only=True)):
                if i == 0:
                    # Normalize NFC toàn bộ headers để tránh lỗi encoding NFD
                    headers = [unicodedata.normalize("NFC", str(c).strip()) if c else "" for c in row]
                    continue
                if not any(row):
                    continue

                r = dict(zip(headers, row))
                order_id = str(r.get("Mã đơn hàng", "") or "").strip()
                if not order_id:
                    continue

                # Phân loại đơn — dùng normalize NFC để tránh lỗi encoding
                def get_col(row, key):
                    # Thử exact match trước
                    val = row.get(key)
                    if val is not None:
                        return str(val or "").strip()
                    # Fallback: normalize NFC rồi so sánh
                    import unicodedata
                    key_nfc = unicodedata.normalize("NFC", key)
                    for k, v in row.items():
                        if unicodedata.normalize("NFC", str(k)) == key_nfc:
                            return str(v or "").strip()
                    return ""

                trang_thai = get_col(r, "Trạng Thái Đơn Hàng")
                ly_do_huy  = get_col(r, "Lý do hủy")
                tra_hang   = get_col(r, "Trạng thái Trả hàng/Hoàn tiền")

                order_type = "normal"
                if trang_thai == "Đã hủy" or ly_do_huy:
                    order_type = "cancel"
                if any(k in tra_hang.lower() for k in ["hoàn tiền", "trả hàng", "chấp thuận"]):
                    order_type = "return"

                # Chuẩn hóa shipping_status từ trạng thái Shopee
                tt_lower = trang_thai.lower()
                if "chờ lấy hàng" in tt_lower or "chờ xác nhận" in tt_lower:
                    shipping_status = "Chờ lấy hàng"
                elif "đang giao" in tt_lower or "đang vận chuyển" in tt_lower:
                    shipping_status = "Đang giao"
                elif "đã giao" in tt_lower or "hoàn thành" in tt_lower:
                    shipping_status = "Đã giao"
                elif "đã hủy" in tt_lower or order_type == "cancel":
                    shipping_status = "Đã hủy"
                elif order_type == "return":
                    shipping_status = "Hoàn hàng"
                else:
                    shipping_status = trang_thai or ""

                # Ngày đặt hàng — hỗ trợ cả 2 format
                ngay = get_col(r, "Ngày đặt hàng")
                order_date = ""
                if "-" in ngay:
                    order_date = ngay[:10]  # Format mới: "2026-01-01 06:10" → lấy "2026-01-01"
                elif "/" in ngay:
                    parts = ngay.split("/")
                    if len(parts) >= 3:
                        order_date = f"{parts[2][:4]}-{parts[1].zfill(2)}-{parts[0].zfill(2)}"

                # Doanh thu
                def to_num(val):
                    try: return round(float(str(val).replace(",", "").strip()))
                    except: return 0

                qty = max(1, int(to_num(r.get("Số lượng", 1)) or 1))

                # Doanh thu — ưu tiên file cũ, fallback file mới
                tong_gia_ban   = to_num(r.get("Tổng giá bán (sản phẩm)", 0))
                tong_nguoi_mua = to_num(r.get("Tổng số tiền Người mua thanh toán", 0))
                raw_revenue    = tong_gia_ban if tong_gia_ban > 0 else tong_nguoi_mua
                revenue        = raw_revenue if order_type == "normal" else 0
                return_amount  = raw_revenue if order_type == "return" else 0
                sku = str(r.get("SKU phân loại hàng", "") or "").strip()
                product_name = str(r.get("Tên sản phẩm", "") or "").strip()
                shipped = bool(r.get("Ngày gửi hàng"))

                cancel_reason = ly_do_huy or (trang_thai if order_type == "cancel" else None)
                return_fee = 0
                if order_type == "return":
                    return_fee = 1620
                elif order_type == "cancel" and any(k in (ly_do_huy or "").lower() for k in ["thất bại", "không giao"]):
                    return_fee = 1620

                # Items
                if sku:
                    items.append({
                        "order_id": order_id,
                        "sku": sku,
                        "product_name": product_name,
                        "qty": qty,
                        "revenue_line": revenue,
                        "cost_real": 0,
                        "cost_invoice": 0,
                    })

                # Orders (gộp)
                if order_id not in orders_map:
                    orders_map[order_id] = {
                    "order_id":      order_id,
                    "platform":      "shopee",
                    "shop":          shop_name,
                    "order_date":    order_date,
                    "order_type":    order_type,
                    "revenue":       revenue,
                    "raw_revenue":   raw_revenue,
                    "cancel_reason": cancel_reason,
                    "return_fee":    return_fee,
                    "shipped":       1 if shipped else 0,
                    "cost_invoice":  0, "cost_real": 0,
                    "fee":           0, "profit_invoice": 0, "profit_real": 0,
                    "tax_flat":      0, "tax_income": 0,
                    "fee_platform":  to_num(r.get("Phí cố định", 0)),
                    "fee_payment":   to_num(r.get("Phí thanh toán", 0)),
                    "fee_service":   to_num(r.get("Phí Dịch Vụ", 0)),
                    "fee_affiliate": 0, "fee_ads": 0,
                    "fee_piship":    0,
                    "fee_packaging": 0, "fee_operation": 0, "fee_labor": 0,
                    "discount_shop":         to_num(r.get("Mã giảm giá của Shop", 0)),
                    "discount_shopee":       to_num(r.get("Mã giảm giá của Shopee", 0)),
                    "discount_combo":        to_num(r.get("Giảm giá từ Combo của Shop", 0)),
                    "shipping_return_fee":   to_num(r.get("Phí vận chuyển trả hàng (đơn Trả hàng/hoàn tiền)", 0)),
                    "shipping_status":       shipping_status,
                }
                else:
                    orders_map[order_id]["revenue"]              += revenue
                    orders_map[order_id]["raw_revenue"]          += raw_revenue
                    orders_map[order_id]["discount_shop"]        += to_num(r.get("Mã giảm giá của Shop", 0))
                    orders_map[order_id]["discount_shopee"]      += to_num(r.get("Mã giảm giá của Shopee", 0))
                    orders_map[order_id]["discount_combo"]       += to_num(r.get("Giảm giá từ Combo của Shop", 0))
                    orders_map[order_id]["shipping_return_fee"]  += to_num(r.get("Phí vận chuyển trả hàng (đơn Trả hàng/hoàn tiền)", 0))

            wb.close()
            self.log(f"📊 Parse Excel xong: {len(orders_map)} đơn, {len(items)} items")
            return {"orders": list(orders_map.values()), "items": items}
        except Exception as e:
            self.log(f"⚠️ Lỗi parse Excel: {str(e)}")
            return None