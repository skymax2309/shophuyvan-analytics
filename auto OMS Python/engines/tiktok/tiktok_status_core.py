import asyncio
import requests
import re
from parsers.tiktok_order_parser import TiktokOrderParser

class TikTokStatusCore:
    def __init__(self, log_callback):
        self.log = log_callback
        self.api_url = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/orders/{}/oms-status"

    async def scan_and_update(self, page, shop_name):
        self.log(f"🚀 Bắt đầu quét Trạng thái đơn TikTok - Shop: {shop_name}")
        try:
            # 1. Mở trang quản lý
            await page.goto("https://seller-vn.tiktok.com/order?selected_sort=6&tab=all", wait_until="networkidle")
            self.log("⏳ Đang chờ TikTok tải khung giao diện (30s)...")
            await asyncio.sleep(30)

            # 2. Bật "Xem dạng thẻ"
            try:
                self.log("⚙️ Click mở menu 'Chế độ xem' và chờ (15s)...")
                await page.locator('span:has-text("Chế độ xem")').first.click(timeout=5000)
                await asyncio.sleep(15)
                
                self.log("⚙️ Click 'Xem dạng thẻ' và chờ giao diện lật (15s)...")
                await page.locator('div:has-text("Xem dạng thẻ")').first.click(timeout=5000)
                await asyncio.sleep(15)
            except:
                self.log("⚠️ Đã ở dạng thẻ sẵn (hoặc menu bị ẩn), tiếp tục.")

            # 3. Chỉnh 50 đơn/trang
            try:
                self.log("⚙️ Click menu chọn số lượng đơn/trang và chờ (15s)...")
                await page.locator('.p-pagination-options, [class*="pagination"] svg, #p-select-popup-1').last.click(timeout=5000)
                await asyncio.sleep(15)
                
                self.log("⚙️ Chọn mốc 50 đơn/trang...")
                await page.locator('.p-select-dropdown-menu li:nth-child(3), #p-select-popup-1 li:nth-child(3)').click(timeout=5000)
                self.log("⏳ Chờ TikTok load lại danh sách 50 đơn (30s)...")
                await asyncio.sleep(30)
            except:
                self.log("⚠️ Không đổi được số lượng trang, tiếp tục quét với mốc mặc định.")

            # 4. Quét dữ liệu tàng hình bằng phương pháp "Chặt Khúc Text"
            page_num = 1
            total_updated = 0
            while True:
                self.log(f"📄 Đang tiến hành bóc tách dữ liệu trang {page_num}...")
                
                # Rút trích TOÀN BỘ Text trên màn hình
                page_text = await page.evaluate("() => document.body.innerText")
                
                if "ID đơn hàng:" not in page_text:
                    self.log("⚠️ Không tìm thấy đơn hàng nào trên trang này. (Hoặc mạng quá chậm chưa load xong)")
                    break
                
                # Chặt toàn bộ Text thành từng khối, mỗi khối là 1 đơn hàng
                blocks = page_text.split("ID đơn hàng:")
                
                for block in blocks[1:]: # Bỏ qua phần header trên cùng
                    # 🌟 Bắt chính xác mã đơn TikTok (Bắt đầu bằng số 5, dài 18-19 số, VD: 583339185351853565)
                    id_match = re.search(r'(?<!\d)(5\d{17,18})(?!\d)', block)
                    if not id_match:
                        continue
                    order_id = id_match.group(1)
                    
                    # 🌟 1. Nhặt Mã Vận Đơn (Tracking Number) từ khối text - Regex bọc thép
                    tracking_number = ""
                    # Dò tìm dãy số 12-14 chữ số đứng sau dấu phẩy hoặc tên ĐVVC (Theo ảnh bác gửi)
                    track_match = re.search(r'(?:Express|vận chuyển|,\s*)(\d{12,15})(?!\d)', block)
                    if track_match:
                        tracking_number = track_match.group(1)

                    # 🌟 2. Nhặt từ khóa trạng thái thực tế trong block
                    raw_st = ""
                    keywords = ["Đang chờ lấy hàng", "Đang chờ vận chuyển", "Đang trung chuyển", "Đã giao hàng", "Bị hủy bởi Tiktok", "Đã hủy", "Đã hoàn tất", "Giao không thành công", "Giao thất bại"]
                    for kw in keywords:
                        if kw in block:
                            raw_st = kw
                            break
                    
                    if not raw_st:
                        # Fallback nếu không thấy từ khóa chi tiết, lấy tab tổng quát
                        if "Đã hoàn tất" in block: raw_st = "Đã hoàn tất"
                        elif "Đang trung chuyển" in block or "Đã gửi" in block: raw_st = "Đang trung chuyển"
                        elif "Đã hủy" in block: raw_st = "Đã hủy"

                    # 🌟 3. Gọi Siêu từ điển dịch ra 2 mã chuẩn
                    if raw_st:
                        parser = TiktokOrderParser(self.log)
                        shipping_st, oms_st = parser._normalize_status(raw_st)
                        
                        # 🌟 4. Bắn API cập nhật CẢ 2 TRẠNG THÁI + MÃ VẬN ĐƠN [cite: 1]
                        try:
                            payload = {
                                "oms_status": oms_st,
                                "shipping_status": shipping_st,
                                "tracking_number": tracking_number
                            }
                            res = requests.patch(
                                self.api_url.format(order_id),
                                json=payload,
                                timeout=10
                            )
                            if res.status_code == 200:
                                total_updated += 1
                                self.log(f"✅ Đã update: {order_id} -> [{shipping_st}] (Tab: {oms_st}) | Vận đơn: {tracking_number or 'Chưa thấy'}")
                            else:
                                self.log(f"❌ Server từ chối {order_id}: {res.text}")
                        except Exception as e:
                            self.log(f"❌ Lỗi mạng khi update {order_id}: {e}")
                            
                # 5. Chuyển trang tiếp theo
                # 🌟 Đã bọc thép: Dùng :text-is để khớp chính xác tuyệt đối, không bị nhầm 7 với 1187
                next_btn = page.locator(f'li.p-pagination-item:text-is("{page_num + 1}")')
                if await next_btn.count() > 0:
                    self.log(f"➡️ Bấm sang trang {page_num + 1} và chờ tải dữ liệu (25s)...")
                    await next_btn.click()
                    await asyncio.sleep(25)
                    page_num += 1
                else:
                    arrow_next = page.locator('li[title="Next Page"], li.p-pagination-next:not(.p-pagination-disabled)')
                    if await arrow_next.count() > 0:
                        self.log(f"➡️ Bấm mũi tên sang trang {page_num + 1} và chờ (25s)...")
                        await arrow_next.first.click()
                        await asyncio.sleep(25)
                        page_num += 1
                    else:
                        self.log(f"🎉 Đã quét xong {page_num} trang. Cập nhật thành công {total_updated} đơn TikTok.")
                        break
                        
        except Exception as e:
            self.log(f"❌ Lỗi quét trạng thái TikTok: {e}")