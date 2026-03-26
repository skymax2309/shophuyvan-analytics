import openpyxl
import datetime

try:
    import openpyxl
    HAS_OPENPYXL = True
except ImportError:
    HAS_OPENPYXL = False

class LazadaParser:
    def __init__(self, log_func):
        self.log = log_func

    def parse_lazada_excel(self, local_path, shop_name):
        if not HAS_OPENPYXL:
            self.log("⚠️ Không có openpyxl...")
            return None
        try:
            wb = openpyxl.load_workbook(local_path, data_only=True)
            ws = wb.active
            headers = []
            orders_map = {}
            items = []

            for i, row in enumerate(ws.iter_rows(values_only=True)):
                if i == 0:
                    headers = [str(c).strip() if c else "" for c in row]
                    continue
                if not any(row):
                    continue

                r = dict(zip(headers, row))
                order_id = str(r.get("orderNumber", "") or "").strip()
                if not order_id:
                    continue

                # Phân loại đơn
                status = str(r.get("status", "") or "").strip().lower()
                failed_reason = str(r.get("buyerFailedDeliveryReason", "") or "").strip()
                refund = float(r.get("refundAmount") or 0)

                order_type = "normal"
                if status in ["canceled", "cancelled"]:
                    order_type = "cancel"
                elif status in ["returned", "return"]:
                    order_type = "return"
                elif refund > 0:
                    order_type = "return"

                # Chuẩn hóa shipping_status Lazada
                if status in ["pending", "unpaid"]:
                    shipping_status = "Chờ xác nhận"
                elif status in ["ready_to_ship", "processing"]:
                    shipping_status = "Chờ lấy hàng"
                elif status in ["shipped"]:
                    shipping_status = "Đang giao"
                elif status in ["delivered"]:
                    shipping_status = "Đã giao"
                elif order_type == "cancel":
                    shipping_status = "Đã hủy"
                elif order_type == "return":
                    shipping_status = "Hoàn hàng"
                else:
                    shipping_status = status or ""

                # Ngày đặt — format "21 Mar 2026 19:45"
                raw_date = str(r.get("createTime", "") or "").strip()
                order_date = ""
                try:
                    import datetime
                    d = datetime.datetime.strptime(raw_date, "%d %b %Y %H:%M")
                    order_date = d.strftime("%Y-%m-%d")
                except:
                    pass

                # Doanh thu
                def to_num(val):
                    try: return round(float(str(val or "0").replace(",", "")))
                    except: return 0

                paid_price  = to_num(r.get("paidPrice"))
                revenue     = paid_price if order_type == "normal" else 0
                raw_revenue = paid_price

                sku          = str(r.get("sellerSku", "") or "").strip()
                product_name = str(r.get("itemName", "") or "").strip()
                cancel_reason = failed_reason or (status if order_type in ["cancel", "return"] else "")

                return_fee = 0
                if order_type == "return":
                    return_fee = 1620
                elif order_type == "cancel" and failed_reason:
                    return_fee = 1620

                # Items
                if sku:
                    items.append({
                        "order_id":     order_id,
                        "sku":          sku,
                        "product_name": product_name,
                        "qty":          1,
                        "revenue_line": revenue,
                        "cost_real":    0,
                        "cost_invoice": 0,
                    })

                # Orders (gộp theo orderNumber)
                if order_id not in orders_map:
                    orders_map[order_id] = {
                        "order_id":      order_id,
                        "platform":      "lazada",
                        "shop":          shop_name,
                        "order_date":    order_date,
                        "order_type":    order_type,
                        "revenue":       revenue,
                        "raw_revenue":   raw_revenue,
                        "cancel_reason": cancel_reason,
                        "return_fee":    return_fee,
                        "shipped":       1 if status == "shipped" else 0,
                        "cost_invoice":  0, "cost_real": 0,
                        "fee": 0, "profit_invoice": 0, "profit_real": 0,
                        "tax_flat": 0, "tax_income": 0,
                        "fee_platform": 0, "fee_payment": 0,
                        "fee_affiliate": 0, "fee_ads": 0,
                        "fee_piship": 0, "fee_service": 0,
                        "fee_packaging": 0, "fee_operation": 0, "fee_labor": 0,
                        "discount_shop": to_num(r.get("sellerDiscountTotal")),
                        "discount_shopee": 0, "discount_combo": 0,
                        "shipping_return_fee": 0,
                        "shipping_status": shipping_status,
                    }
                else:
                    orders_map[order_id]["revenue"]       += revenue
                    orders_map[order_id]["raw_revenue"]   += raw_revenue
                    orders_map[order_id]["discount_shop"] += to_num(r.get("sellerDiscountTotal"))

            wb.close()
            self.log(f"📊 Parse Lazada Excel xong: {len(orders_map)} đơn, {len(items)} items")
            return {"orders": list(orders_map.values()), "items": items}
        except Exception as e:
            self.log(f"⚠️ Lỗi parse Lazada Excel: {str(e)}")
            return None