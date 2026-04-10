import asyncio
import json
import os
import math
import re
import hashlib
from datetime import datetime

class ShopeeOrdersBrowser:
    def __init__(self, log_func, parser):
        self.log = log_func
        self.parser = parser

    async def scrape_by_browser(self, page, limits=None, shop_name="default", mode="all"):
        if not limits:
            limits = {"new": 100, "shipping": 50, "done": 20}
            
        if mode == "new_only":
            self.log(f"[*] ⚡ Bắt đầu Kéo Đơn Tốc Độ Cao. Chỉ quét Tab: Chờ lấy hàng ({limits['new']} đơn)")
        else:
            self.log(f"[*] Bắt đầu Tuần tra Đa Tab Shopee. Giới hạn: Mới({limits['new']}), Đang giao({limits['shipping']}), Xong({limits['done']})")
            
        cache_file = f"cache_orders_shopee_{shop_name}.json"
        cached_final_orders = {}
        try:
            if os.path.exists(cache_file):
                with open(cache_file, "r") as f:
                    data = json.load(f)
                    if isinstance(data, dict):
                        cached_final_orders = {str(k): str(v) for k, v in data.items() if isinstance(v, str)}
        except Exception as e:
            self.log(f"⚠️ Không thể đọc Sổ đen cũ, sẽ khởi tạo mới: {e}")

        all_orders_data = []
        
        if mode == "new_only":
            tabs_to_scan = [{"name": "Chờ lấy hàng (Chưa xử lý)", "url": "https://banhang.shopee.vn/portal/sale/order?type=toship&source=to_process", "limit_type": "new"}]
        elif mode == "status_only":
            tabs_to_scan = [
                {"name": "Đang giao", "url": "https://banhang.shopee.vn/portal/sale/order?type=shipping", "limit_type": "shipping"},
                {"name": "Đã giao", "url": "https://banhang.shopee.vn/portal/sale/order?type=completed", "limit_type": "done"},
                {"name": "Hủy & Trả hàng", "url": "https://banhang.shopee.vn/portal/sale/returnrefundcancel", "limit_type": "done"}
            ]
        else:
            tabs_to_scan = [
                {"name": "Chờ lấy hàng (Chưa xử lý)", "url": "https://banhang.shopee.vn/portal/sale/order?type=toship&source=to_process", "limit_type": "new"},
                {"name": "Chờ lấy hàng (Đã xử lý)", "url": "https://banhang.shopee.vn/portal/sale/order?type=toship&source=processed", "limit_type": "new"},
                {"name": "Đang giao", "url": "https://banhang.shopee.vn/portal/sale/order?type=shipping", "limit_type": "shipping"},
                {"name": "Đã giao", "url": "https://banhang.shopee.vn/portal/sale/order?type=completed", "limit_type": "done"},
                {"name": "Hủy & Trả hàng", "url": "https://banhang.shopee.vn/portal/sale/returnrefundcancel", "limit_type": "done"}
            ]

        newly_completed = {}

        try:
            for tab in tabs_to_scan:
                limit_count = limits.get(tab['limit_type'], 50)
                max_pages = math.ceil(limit_count / 40)
                if max_pages <= 0: continue

                self.log(f"-------------------------------------------------")
                self.log(f"📡 Đang mở Tab: {tab['name']} (Mục tiêu {limit_count} đơn -> Quét tối đa {max_pages} trang)")
                
                await page.goto(tab['url'], timeout=60000, wait_until="domcontentloaded")
                self.log("   ⏳ Đang chờ Shopee load và nới lỏng Delay để quan sát...")
                await asyncio.sleep(12) 

                try:
                    popups = await page.locator("button.eds-button--primary:has-text('Đã hiểu'), button.eds-button--primary:has-text('Later')").all()
                    for popup in popups:
                        if await popup.is_visible():
                            await popup.click()
                            await asyncio.sleep(1)
                except: pass

                if "Chờ lấy hàng" in tab['name'] or tab['name'] == "Hủy & Trả hàng":
                    try:
                        self.log("   ⚙️ Đang bung toàn bộ các nút 'Tất cả' đang bị ẩn...")
                        clicked_any_total = False
                        
                        for _ in range(6): 
                            clicked_this_round = await page.evaluate('''() => {
                                let btns = Array.from(document.querySelectorAll('*')).filter(el => {
                                    if (el.children.length > 0) return false;
                                    let txt = el.textContent.trim();
                                    return txt === "Tất cả" || /^Tất cả\\s*\\(\\d+\\)$/.test(txt);
                                });
                                
                                for (let btn of btns) {
                                    let rect = btn.getBoundingClientRect();
                                    if (rect.left < 240 || rect.top < 40) continue; 
                                    
                                    let wrap = btn.parentElement;
                                    let classStr = (btn.className + " " + (wrap ? wrap.className : "")).toLowerCase();
                                    let isUnselected = !classStr.includes('active') && !classStr.includes('checked') && !classStr.includes('primary') && !classStr.includes('selected');
                                    
                                    if (isUnselected) {
                                        btn.click();
                                        return true;
                                    }
                                }
                                return false;
                            }''')
                            
                            if clicked_this_round:
                                clicked_any_total = True
                                await asyncio.sleep(1.5)
                            else:
                                break
                                
                        if clicked_any_total:
                            self.log("   ⏳ Đã bật Full bộ lọc 'Tất cả', chờ dữ liệu ổn định (4 giây)...")
                            await asyncio.sleep(4)
                    except Exception as e:
                        self.log(f"   ⚠️ Lỗi khi định vị bộ lọc: {e}")

                tab_orders = []
                page_num = 1
                
                while page_num <= max_pages:
                    self.log(f"   📄 Đang bóc tách dữ liệu Trang {page_num}/{max_pages}...")
                    
                    for _ in range(3):
                        await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                        await asyncio.sleep(1.5)

                    page_text = await page.evaluate("() => document.body.innerText")
                    if "Mã đơn hàng" not in page_text:
                        self.log("   ⚠️ Không tìm thấy đơn hàng nào trên trang này.")
                        break

                    blocks = page_text.split("Mã đơn hàng")
                    
                    for i in range(1, len(blocks)):
                        block = blocks[i]
                        lines = [line.strip() for line in block.split('\n') if line.strip()]
                        if not lines: continue

                        id_match = re.search(r'([A-Z0-9]{14,15})', lines[0])
                        if not id_match: continue
                        order_id = id_match.group(1)

                        buyer_name = "Khách hàng"
                        prev_block = blocks[i-1]
                        prev_lines = [l.strip() for l in prev_block.split('\n') if l.strip()]
                        if prev_lines:
                            for pl in reversed(prev_lines):
                                clean_pl = pl.replace('|', '').strip()
                                if clean_pl and len(clean_pl) > 2 and "Trang chủ" not in clean_pl and "Đơn hàng" not in clean_pl:
                                    buyer_name = clean_pl
                                    break

                        total_price = "0"
                        for line in lines:
                            if "₫" in line:
                                p_match = re.search(r'₫([\d\.]+)', line)
                                if p_match:
                                    total_price = p_match.group(1).replace(".", "")
                                    break

                        carrier = ""
                        tracking_number = ""
                        for line in lines:
                            if "Express" in line or "Giao Hàng" in line or "Ninja" in line or "Viettel" in line or "VNPost" in line or "Ahamove" in line or "BeDelivery" in line:
                                # 🌟 Bọc thép ĐVVC: Loại bỏ nhãn trạng thái rác dính vào tên ĐVVC để cột hiển thị sạch sẽ
                                carrier = line.replace("Vận chuyển chiều giao hàng", "").replace("Vận chuyển qua nền tảng", "")\
                                              .replace("READY_TO_SHIP", "").replace("RETRY_SHIP", "").replace("PROCESSED", "")\
                                              .replace("|", "").strip()
                                break
                                
                        for line in lines:
                            t_match = re.search(r'(SPX[A-Z0-9]+|[A-Z0-9]{10,20})', line)
                            if t_match and "Variation" not in line and "SKU" not in line and t_match.group(1) != order_id:
                                tracking_number = t_match.group(1)
                                break

                        order_date = ""
                        true_date_str = ""
                        if order_id and len(order_id) >= 14:
                            try:
                                yy, mm, dd = order_id[0:2], order_id[2:4], order_id[4:6]
                                true_date_str = f"20{yy}-{mm}-{dd}"
                            except: pass

                        for line in lines:
                            d_match = re.search(r'(\d{4}[-/]\d{2}[-/]\d{2}(?:\s\d{2}:\d{2})?)|(\d{2}[-/]\d{2}[-/]\d{4}(?:\s\d{2}:\d{2})?)', line)
                            if d_match:
                                raw_d = d_match.group(0)
                                try:
                                    if re.match(r'^\d{4}', raw_d):
                                        dt = datetime.strptime(raw_d.replace('/', '-'), "%Y-%m-%d %H:%M" if len(raw_d) > 10 else "%Y-%m-%d")
                                    else:
                                        dt = datetime.strptime(raw_d.replace('-', '/'), "%d/%m/%Y %H:%M" if len(raw_d) > 10 else "%d/%m/%Y")
                                    
                                    parsed_date = dt.strftime("%Y-%m-%d")
                                    if true_date_str and parsed_date == true_date_str:
                                        order_date = dt.strftime("%Y-%m-%d %H:%M:%S")
                                        break
                                except: pass
                        
                        if not order_date and true_date_str:
                            order_date = f"{true_date_str} 00:00:00"

                        sku = ""
                        original_variation = ""
                        clean_variation = ""
                        product_name = ""
                        qty = 1
                        
                        price_idx = len(lines)
                        for idx in range(1, len(lines)):
                            if "₫" in lines[idx]:
                                price_idx = idx
                                break
                                
                        item_lines = lines[1:price_idx]
                        
                        for txt in item_lines:
                            txt_clean = txt.strip()
                            txt_lower = txt_clean.lower()
                            
                            if txt_lower in ["yêu thích", "yêu thích+", "mall", "xử lý bởi shopee"]: continue
                            if "mua nhiều giảm giá" in txt_lower or ("giảm" in txt_lower and "&" in txt_lower): continue
                            if "trả hàng/hoàn" in txt_lower or "thanh toán khi nhận hàng" in txt_lower: continue
                                
                            if re.match(r'^[xX×]\s*\d+$', txt_clean):
                                qty = int(re.sub(r'[^\d]', '', txt_clean))
                                continue
                                
                            if re.search(r'^(Variation:|Phân loại hàng:|Phân loại:?)\s*', txt_clean, re.IGNORECASE):
                                original_variation = re.sub(r'^(Variation:|Phân loại hàng:|Phân loại:?)\s*', '', txt_clean, flags=re.IGNORECASE).strip()
                                sku_match = re.search(r'\[(.*?)\]', original_variation)
                                if sku_match and not sku:
                                    sku = sku_match.group(1).strip()
                                    clean_variation = re.sub(r'\[.*?\]', '', original_variation).strip()
                                else:
                                    clean_variation = original_variation
                                continue
                                
                            if "sku" in txt_lower:
                                sku = txt_clean.split(":")[-1].strip()
                                continue
                            elif txt_clean.startswith("[") and txt_clean.endswith("]") and not sku:
                                sku = txt_clean.strip("[]")
                                continue
                                
                            if not product_name and len(txt_clean) > 8:
                                sku_match = re.search(r'\[(.*?)\]', txt_clean)
                                if sku_match and not sku:
                                    sku = sku_match.group(1).strip()
                                    product_name = re.sub(r'\[.*?\]', '', txt_clean).strip()
                                else:
                                    product_name = txt_clean
                                
                        if not product_name: product_name = "Sản phẩm Shopee"
                        if not original_variation: original_variation = ""
                        if not clean_variation: clean_variation = ""
                        
                        self.log(f"   [DEBUG_ITEM] Đơn {order_id} | Var: '{original_variation}' | SKU: '{sku}' | Qty: {qty}")

                        if not order_date and order_id and len(order_id) >= 14:
                            try:
                                yy, mm, dd = order_id[0:2], order_id[2:4], order_id[4:6]
                                order_date = f"20{yy}-{mm}-{dd} 00:00:00"
                            except: pass

                        if not order_date:
                            self.log(f"❌ [LỖI DỮ LIỆU] Đơn {order_id} không có Ngày đặt hàng!")
                            continue 

                        revenue_numeric = self.parser._clean_price(total_price)
                        status_raw = tab['name'] 

                        # 1. Tinh chỉnh từ khóa status_raw dựa trên thực tế đơn hàng
                        if "Chờ lấy hàng" in tab['name']:
                            full_text = " ".join(lines)
                            if "Chuẩn bị hàng" in full_text or "Chưa xử lý" in tab['name']:
                                status_raw = "Chưa xử lý"
                            elif "In phiếu giao" in full_text or "Thông tin vận chuyển" in full_text or "Đã xử lý" in tab['name']:
                                status_raw = "Đã xử lý"

                        # 🌟 2. Ép qua Siêu Từ Điển của Parser để lấy 2 mã chuẩn
                        shipping_st, oms_st = self.parser._normalize_status(status_raw)

                        order_obj = {
                            "order_id": order_id,
                            "platform": "shopee",
                            "shop": shop_name,
                            "order_date": order_date,
                            "customer_name": buyer_name,
                            "revenue": revenue_numeric,
                            "raw_revenue": revenue_numeric,
                            "status": status_raw,               
                            "shipping_status": shipping_st,  # 🌟 Mã chi tiết chuẩn
                            "oms_status": oms_st,            # 🌟 Mã Tab chuẩn
                            "tracking_number": tracking_number,
                            "shipping_carrier": carrier if carrier else "SPX Express",
                            "oms_updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                            "items": [{
                                "sku": sku,
                                "variation_name": original_variation, 
                                "clean_variation": clean_variation,   
                                "product_name": product_name,
                                "qty": qty,
                                "image_url": ""
                            }]
                        }

                        hash_data = order_obj.copy()
                        del hash_data['oms_updated_at']
                        order_signature = hashlib.md5(json.dumps(hash_data, sort_keys=True).encode('utf-8')).hexdigest()

                        if order_id in cached_final_orders and cached_final_orders[order_id] == order_signature:
                            self.log(f"👁️ [ĐÃ QUÉT] {order_id} | Ngày: {order_date} | {oms_st} -> (Bỏ qua vì không đổi)")
                            continue 

                        self.log(f"🚀 [CẬP NHẬT] {order_id} | Ngày: {order_date} | {oms_st} -> (Dữ liệu Mới/Đã sửa)")
                        
                        if not any(o['order_id'] == order_id for o in tab_orders):
                            order_obj['_signature'] = order_signature
                            tab_orders.append(order_obj)

                        if len(tab_orders) >= limit_count:
                            break 

                    self.log(f"   -> Đã nhặt được {len(tab_orders)}/{limit_count} đơn mục tiêu.")
                    
                    if len(tab_orders) >= limit_count:
                        break 
                        
                    try:
                        self.log(f"   ➡️ Đang tìm nút qua trang {page_num + 1}...")
                        clicked_next = await page.evaluate('''(nextPageNum) => {
                            let pageStr = String(nextPageNum);
                            let pageNodes = document.querySelectorAll("li.eds-pager__page, button.shopee-button-no-solid, .shopee-page-controller button");
                            for (let node of pageNodes) {
                                if (node.textContent.trim() === pageStr) {
                                    node.click();
                                    return true;
                                }
                            }
                            
                            let nextBtn = document.querySelector(".eds-pager__btn--next, .eds-pagination__btn--next, .shopee-icon-button--right, button.pagination-next");
                            
                            if (!nextBtn) {
                                let svgs = Array.from(document.querySelectorAll("svg"));
                                let rightSvg = svgs.find(svg => typeof svg.className === 'string' && (svg.className.includes('angle-right') || svg.className.includes('arrow-right')));
                                if (rightSvg) nextBtn = rightSvg.closest('button');
                            }

                            if (nextBtn) {
                                let isDisabled = nextBtn.disabled || nextBtn.classList.contains('eds-pagination__btn--disabled') || nextBtn.classList.contains('eds-pager__btn--disabled') || nextBtn.getAttribute('aria-disabled') === 'true';
                                if (!isDisabled) {
                                    nextBtn.click(); 
                                    return true;
                                }
                            }
                            return false;
                        }''', page_num + 1)

                        if clicked_next:
                            self.log(f"   ✅ Đã bấm sang trang {page_num + 1}, đang chờ dữ liệu load...")
                            await asyncio.sleep(5) 
                            page_num += 1
                        else:
                            self.log("   🛑 Đã vét sạch đến trang cuối cùng (Hoặc không có nút lật trang).")
                            break
                    except Exception as e:
                        self.log(f"   ⚠️ Lỗi lật trang: {e}")
                        break
                
                orders_to_keep = tab_orders[:limit_count]
                self.log(f"   ✅ CHỐT: Giữ lại {len(orders_to_keep)} đơn mới nhất tại Tab '{tab['name']}'.")
                
                for o in orders_to_keep:
                    if '_signature' in o:
                        newly_completed[o['order_id']] = o['_signature']
                        del o['_signature'] 
                        
                all_orders_data.extend(orders_to_keep)
                    
                await asyncio.sleep(2)

            if newly_completed:
                cached_final_orders.update(newly_completed)
                with open(cache_file, "w") as f:
                    json.dump(cached_final_orders, f, indent=4)
                self.log(f"💾 CẬP NHẬT SỔ ĐEN THÔNG MINH: Đã ghi nhận/cập nhật {len(newly_completed)} đơn!")

            self.log(f"🎉 Hoàn tất tuần tra Shopee! Tổng gom được: {len(all_orders_data)} đơn từ các Tab.")
            return all_orders_data

        except Exception as e:
            self.log(f"❌ Lỗi khi tuần tra Shopee: {e}")
            return all_orders_data
