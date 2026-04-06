import os
import json
import urllib.request
import urllib.parse

try:
    import pdfplumber
    HAS_PDFPLUMBER = True
except ImportError:
    HAS_PDFPLUMBER = False

from config import UPLOAD_URL, R2_TOKEN, AUTO_IMPORT_TRIGGER_URL

def log_to_widget(widget, message):
    """Hàm ghi log vào giao diện (Textbox)"""
    if widget:
        widget.insert("end", f"[*] {message}\n")
        widget.see("end")

def extract_pdf_text(local_path):
    """Trích xuất văn bản từ file PDF"""
    if not HAS_PDFPLUMBER:
        return ""
    try:
        text_parts = []
        with pdfplumber.open(local_path) as pdf:
            for page in pdf.pages:
                t = page.extract_text()
                if t: text_parts.append(t)
        return "\n".join(text_parts)
    except Exception as e:
        print(f"⚠️ Lỗi PDF: {e}")
        return ""

def upload_to_r2(local_path, remote_name):
    """Tải file lên Cloud R2"""
    try:
        with open(local_path, 'rb') as f:
            file_data = f.read()
        ext = remote_name.split('.')[-1].lower()
        content_type = 'application/pdf' if ext == 'pdf' else 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        req_url = f"{UPLOAD_URL}?file={urllib.parse.quote(remote_name)}&token={R2_TOKEN}"
        headers = {'Content-Type': content_type, 'User-Agent': 'HuyVanBot/2.0'}
        req = urllib.request.Request(req_url, data=file_data, headers=headers, method='PUT')
        with urllib.request.urlopen(req) as res:
            return res.status == 200
    except Exception as e:
        print(f"⚠️ Lỗi Upload R2: {e}")
        return False
        
def trigger_server_import(file_key, shop_name, platform, report_type, local_path=None):
    """Kích hoạt Server tự động xử lý file sau khi đã lên R2"""
    try:
        url = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/auto-import-trigger"

        # Extract PDF text trên máy local để gửi kèm
        pdf_text = ""
        if local_path and local_path.endswith(".pdf"):
            pdf_text = extract_pdf_text(local_path)
            if pdf_text:
                print(f"📄 Đã extract PDF text: {len(pdf_text)} ký tự")

        payload = {
            "file_key":    file_key,
            "shop":        shop_name,
            "platform":    platform,
            "report_type": report_type,
            "pdf_text":    pdf_text,
        }
        
        data = json.dumps(payload).encode('utf-8')
        
        headers = {'Content-Type': 'application/json', 'User-Agent': 'HuyVanBot/2.0'}
        req = urllib.request.Request(url, data=data, headers=headers, method='POST')
        with urllib.request.urlopen(req) as res:
            if res.status == 200:
                print(f"⚡ [Auto-Import] Đã báo Server xử lý {report_type} cho Shop: {shop_name}")
    except Exception as e:
        print(f"⚠️ Lỗi kích hoạt Import: {str(e)}")

def upload_to_r2(local_path, remote_name):
    try:
        api_upload = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/upload"
        
        import urllib.request
        import urllib.parse
        with open(local_path, 'rb') as f:
            file_data = f.read()

        # Xác định Content-Type
        ext = remote_name.split('.')[-1].lower()
        content_type = 'application/pdf' if ext == 'pdf' else 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

        req_url = f"{api_upload}?file={urllib.parse.quote(remote_name)}&token=huyvan_secret_2026"
        headers = {
            'Content-Type': content_type,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'
        }
        req = urllib.request.Request(req_url, data=file_data, headers=headers, method='PUT')
        with urllib.request.urlopen(req) as res:
            if res.status == 200:
                print(f"☁️ Đã đồng bộ lên Cloud R2: {remote_name}")
                return True
    except Exception as e:
        print(f"⚠️ Lỗi Upload R2: {str(e)}")
    return False
# ==========================================
# XỬ LÝ GHÉP NỐI EXCEL SHOPEE
# ==========================================
import pandas as pd
import requests

def process_and_sync_files(shop_name, file_paths, log_func):
    from config import SYNC_VARIATIONS_URL
    
    def read_shopee_file(filepath):
        try:
            if filepath.endswith('.csv'):
                df = pd.read_csv(filepath, header=0, dtype=str)
            else:
                # Dùng engine calamine để lách lỗi định dạng của Shopee
                df = pd.read_excel(filepath, header=0, dtype=str, engine='calamine')
            
            # Quét tìm cột ID sản phẩm (Bọc thêm ps_product_id đề phòng Shopee đổi tên)
            id_col = None
            for col in ['et_title_product_id', 'ps_product_id', 'Product ID', 'Mã Sản Phẩm']:
                if col in df.columns:
                    id_col = col
                    break
                    
            if id_col:
                import numpy as np
                # BẮT BUỘC: Biến các chuỗi rỗng "" thành NaN để lệnh ffill() có thể hoạt động
                df[id_col] = df[id_col].replace(r'^\s*$', np.nan, regex=True).ffill()
                
                # Đổi tên cột về chuẩn để code ghép nối phía sau không bị gãy
                if id_col != 'et_title_product_id':
                    df.rename(columns={id_col: 'et_title_product_id'}, inplace=True)
                
                return df[pd.to_numeric(df['et_title_product_id'], errors='coerce').notnull()]
            else:
                return df
        except Exception as e:
            log_func(f"❌ Lỗi đọc file {filepath}: {e}")
            return None

    log_func("⏳ Đang bóc tách và gom dữ liệu 3 file...")
    df_basic = read_shopee_file(file_paths['basic'])
    df_sales = read_shopee_file(file_paths['sales'])
    df_media = read_shopee_file(file_paths['media'])
    
    if df_basic is None or df_sales is None or df_media is None:
        log_func("❌ Lỗi: Không thể đọc dữ liệu từ file Excel.")
        return

    basic_map = {row['et_title_product_id']: row.get('et_title_product_description', '') for _, row in df_basic.iterrows()}
    
    # 1. BÓC TÁCH ẢNH ĐẠI DIỆN (Đề phòng Shopee đổi tên cột)
    media_map = {}
    if df_media is not None:
        cover_cols = ['ps_item_cover_image', 'et_title_item_cover_image', 'Hình ảnh sản phẩm 1', 'Ảnh bìa', 'Hình ảnh sản phẩm']
        for _, row in df_media.iterrows():
            pid = str(row.get('et_title_product_id', '')).strip().replace('.0', '')
            cover = ""
            for col in cover_cols:
                if col in df_media.columns and str(row[col]).strip() not in ['', 'nan', 'None']:
                    cover = str(row[col]).strip()
                    if not cover.startswith('http'): cover = f"https://cf.shopee.vn/file/{cover}"
                    break
            if pid and cover and pid not in media_map:
                media_map[pid] = cover

    # 2. BÓC TÁCH ẢNH PHÂN LOẠI (Quét ngang 60 cột + Bắt mã ẩn Shopee + Tự vá Link)
    var_media_map = {}
    if df_media is not None:
        for _, m_row in df_media.iterrows():
            m_pid = str(m_row.get('et_title_product_id', '')).strip().replace('.0', '')
            if not m_pid or m_pid == 'nan': continue
            
            # Quét mảng ngang (Bao gồm cả mã hệ thống et_title_option...)
            for i in range(1, 61):
                name_cols = [
                    f"et_title_option_{i}_for_variation_1", 
                    f"Tên phân loại {i}", f"Variation Name {i}", f"Tên phân loại hàng {i}"
                ]
                img_cols = [
                    f"et_title_option_image_{i}_for_variation_1", 
                    f"Hình ảnh phân loại {i}", f"Variation Image {i}", f"Hình ảnh Phân loại hàng {i}"
                ]
                
                m_vname = ""
                for col in name_cols:
                    if col in df_media.columns and str(m_row[col]).strip() not in ['', 'nan', 'None']:
                        m_vname = str(m_row[col]).strip()
                        break
                        
                m_vimg = ""
                for col in img_cols:
                    if col in df_media.columns and str(m_row[col]).strip() not in ['', 'nan', 'None']:
                        m_vimg = str(m_row[col]).strip()
                        if not m_vimg.startswith('http'): m_vimg = f"https://cf.shopee.vn/file/{m_vimg}"
                        break
                        
                if m_vname and m_vimg:
                    key = f"{m_pid}_{m_vname.lower().replace(' ', '')}"
                    var_media_map[key] = m_vimg
            
            # Quét cột dọc (Shopee Form Cũ)
            old_name = str(m_row.get('ps_variation_name', m_row.get('et_title_variation_name', ''))).strip()
            old_img = str(m_row.get('ps_variation_image', m_row.get('et_title_variation_image', ''))).strip()
            if old_name and old_name not in ['', 'nan', 'None'] and old_img and old_img not in ['', 'nan', 'None']:
                if not old_img.startswith('http'): old_img = f"https://cf.shopee.vn/file/{old_img}"
                key = f"{m_pid}_{old_name.lower().replace(' ', '')}"
                var_media_map[key] = old_img

    # 3. GHÉP NỐI VÀO SẢN PHẨM CHÍNH
    products_dict = {}
    for _, row in df_sales.iterrows():
        p_id = str(row['et_title_product_id']).strip().replace('.0', '')
        if p_id not in products_dict:
            products_dict[p_id] = {
                "item_id": p_id,
                "product_name": str(row.get('et_title_product_name', '')),
                "description": str(basic_map.get(p_id, '')),
                "images": [media_map.get(p_id, '')] if media_map.get(p_id, '') else [],
                "variations": []
            }
            
        var_sku = str(row.get('et_title_variation_sku', '')).strip()
        price = str(row.get('et_title_variation_price', '0')).replace(',', '')
        stock = str(row.get('et_title_variation_stock', '0')).replace(',', '')
        
        # Lấy tên phân loại gốc trong Sales file (VD: "Túi 40CM x60CM, Màu Đỏ")
        vname_cols_sales = ['et_title_variation_name', 'Tên Phân loại hàng', 'Variation Name']
        vname = ""
        for col in vname_cols_sales:
            if col in df_sales.columns and str(row[col]).strip() not in ['', 'nan', 'None']:
                vname = str(row[col]).strip()
                break
                
        # BÍ QUYẾT: Cắt lấy Cấp 1 (Phía trước dấu phẩy) để ghép đúng 100% với file Hình Ảnh
        vname_tier1 = vname.split(',')[0].strip() if ',' in vname else vname
        
        search_key = f"{p_id}_{vname_tier1.lower().replace(' ', '')}"
        v_img = var_media_map.get(search_key, "")
        
        products_dict[p_id]["variations"].append({
            "variation_name": str(row.get('variation_value', '')).strip(),
            "sku": var_sku if var_sku != 'nan' else '',
            "price": float(price) if price.replace('.', '', 1).isdigit() else 0,
            "stock": int(stock) if float(stock).is_integer() else 0,
            "variation_image": var_image if var_image != 'nan' else ""
        })

    # --- 🌟 BỌC THÉP TỔNG TỒN KHO: LỌC BỎ SẢN PHẨM CHẾT (TỒN = 0) ---
    valid_products = []
    for p in products_dict.values():
        # Cộng dồn tồn kho của tất cả phân loại
        total_stock = sum(v.get("stock", 0) for v in p["variations"])
        # Chỉ giữ lại sản phẩm nếu tổng tồn kho > 0
        if total_stock > 0:
            valid_products.append(p)
    
    product_list = valid_products
    total_products = len(product_list)
    
    # Báo cáo số lượng rác đã dọn
    trash_count = len(products_dict) - total_products
    if trash_count > 0:
        log_func(f"🧹 Đã dọn dẹp {trash_count} sản phẩm rác (Tổng tồn bằng 0).")
        
    log_func(f"🚀 Chuẩn bị bắn {total_products} Sản phẩm TIKTOK lên Website...")
    
    # 4. ĐỒNG BỘ QUA TỔNG QUẢN PRODUCT HUB
    import sys, os
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
    try:
        from engines.product_core_hub import ProductCoreHub
        hub = ProductCoreHub(log_func)
        
        chunk_size = 40
        for i in range(0, total_products, chunk_size):
            chunk = product_list[i:i + chunk_size]
            log_func(f"\n⏳ Đang đẩy lô {i//chunk_size + 1} ({len(chunk)} SP) vào Trạm trung chuyển (Hub)...")
            hub.sync_products(shop_name, "shopee", chunk)
            
        log_func("🎉 HOÀN TẤT CHUYỂN TOÀN BỘ DỮ LIỆU SHOPEE QUA HUB!")
    except ImportError:
        log_func("❌ LỖI HỆ THỐNG: Không tìm thấy ProductCoreHub.")
    except Exception as e:
        log_func(f"❌ Lỗi bất ngờ: {str(e)}")

# ==========================================
# XỬ LÝ GHÉP NỐI EXCEL TIKTOK
# ==========================================
def process_tiktok_excel_and_sync(shop_name, filepath, log_func):
    import pandas as pd
    import requests
    from config import SYNC_VARIATIONS_URL

    log_func("⏳ Đang bóc tách dữ liệu từ file Template TikTok...")
    try:
        # Đọc file CSV, TikTok dùng dòng 0 làm mã cột chuẩn
        if filepath.endswith('.csv'):
            df = pd.read_csv(filepath, header=0, dtype=str)
        else:
            # File TikTok có nhiều sheet, bắt buộc phải đọc đích danh sheet 'Template'
            try:
                df = pd.read_excel(filepath, sheet_name='Template', header=0, dtype=str, engine='calamine')
            except ValueError:
                # Nếu lỡ file không có sheet Template thì đọc sheet đầu tiên chữa cháy
                df = pd.read_excel(filepath, header=0, dtype=str, engine='calamine')
        
        # Dòng dữ liệu thật luôn có product_id là số
        df = df[pd.to_numeric(df['product_id'], errors='coerce').notnull()]
    except Exception as e:
        log_func(f"❌ Lỗi đọc file Template: {e}")
        return

    products_dict = {}
    for _, row in df.iterrows():
        p_id = str(row.get('product_id', '')).strip()
        if not p_id or p_id == 'nan': continue

        if p_id not in products_dict:
            products_dict[p_id] = {
                "item_id": p_id,
                "product_name": str(row.get('product_name', '')),
                "description": str(row.get('product_description', '')),
                "images": [str(row.get('main_image', ''))] if row.get('main_image', '') and str(row.get('main_image', '')) != 'nan' else [],
                "variations": []
            }
        
        var_sku = str(row.get('seller_sku', '')).strip()
        price = str(row.get('price', '0')).replace(',', '')
        stock = str(row.get('quantity', '0')).replace(',', '')
        
        # Bóc tách hình ảnh của phân loại
        var_image = str(row.get('variation_image', '')).strip()

        products_dict[p_id]["variations"].append({
            "variation_name": str(row.get('variation_value', '')).strip(),
            "sku": var_sku if var_sku != 'nan' else '',
            "price": float(price) if price.replace('.', '', 1).isdigit() else 0,
            "stock": int(stock) if float(stock).is_integer() else 0,
            "variation_image": var_image if var_image != 'nan' else ""
        })

    product_list = list(products_dict.values())
    total_products = len(product_list)
    log_func(f"🚀 Chuẩn bị bắn {total_products} Sản phẩm lên Website...")
    
   # ==========================================
    # [DEBUG] XUẤT FILE LOG ĐỂ KHÁM NGHIỆM DỮ LIỆU
    # ==========================================
    # ==========================================
    # [DEBUG] XUẤT FILE LOG TIKTOK
    # ==========================================
    try:
        import json
        import os
        current_dir = os.path.dirname(os.path.abspath(__file__))
        debug_file = os.path.join(current_dir, "debug_payload_tiktok.json")
        
        with open(debug_file, "w", encoding="utf-8") as f:
            json.dump(product_list, f, ensure_ascii=False, indent=4)
        # Bỏ đi đoạn in link ảnh bị lỗi của Shopee
    except Exception as e:
        log_func(f"⚠️ Lỗi tạo file debug TikTok: {e}")

    # 4. ĐỒNG BỘ QUA TỔNG QUẢN PRODUCT HUB
    import sys, os
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
    try:
        from engines.product_core_hub import ProductCoreHub
        hub = ProductCoreHub(log_func)
        
        chunk_size = 40
        for i in range(0, total_products, chunk_size):
            chunk = product_list[i:i + chunk_size]
            log_func(f"\n⏳ Đang đẩy lô {i//chunk_size + 1} ({len(chunk)} SP) vào Trạm trung chuyển (Hub)...")
            hub.sync_products(shop_name, "tiktok", chunk)
            
        log_func("🎉 HOÀN TẤT CHUYỂN TOÀN BỘ DỮ LIỆU TIKTOK QUA HUB!")
    except ImportError:
        log_func("❌ LỖI HỆ THỐNG: Không tìm thấy ProductCoreHub.")
    except Exception as e:
        log_func(f"❌ Lỗi bất ngờ: {str(e)}")

# ==========================================
# XỬ LÝ GHÉP NỐI EXCEL LAZADA (3 FILE)
# ==========================================
def process_lazada_excel_and_sync(shop_name, file_paths, log_func):
    import pandas as pd
    import requests
    from config import SYNC_VARIATIONS_URL
    import os
    import json
    
    def read_lazada_file(filepath):
        try:
            # Dùng calamine để lách lỗi định dạng Excel
            df = pd.read_excel(filepath, header=0, dtype=str, engine='calamine')
            
            # ĐẶC SẢN LAZADA: 2 dòng đầu tiên là mô tả cột (Không phải dữ liệu)
            # Dòng dữ liệu thật luôn có Product ID là số. Dùng bọc thép để lọc:
            if 'Product ID' in df.columns:
                df['Product ID'] = pd.to_numeric(df['Product ID'], errors='coerce')
                return df[df['Product ID'].notnull()]
            return df
        except Exception as e:
            log_func(f"❌ Lỗi đọc file Lazada {os.path.basename(filepath)}: {e}")
            return None

    def parse_number(val):
        """Hàm chuẩn hóa số liệu chống gãy float của Pandas"""
        try:
            v_str = str(val).strip()
            if v_str in ['nan', 'None', '', 'NaT']: return 0
            return float(v_str.replace(',', ''))
        except:
            return 0

    log_func("⏳ Đang bóc tách và gom dữ liệu 3 file Lazada...")
    df_basic = read_lazada_file(file_paths['basic'])
    df_sales = read_lazada_file(file_paths['sales'])
    df_media = read_lazada_file(file_paths['media'])
    
    if df_basic is None or df_sales is None or df_media is None:
        log_func("❌ Lỗi: Không thể đọc đủ dữ liệu 3 file Excel Lazada.")
        return

    # 1. BÓC TÁCH FILE 1 (BASIC) - Lấy Tên, Mô tả, Ảnh bìa
    basic_map = {}
    for _, row in df_basic.iterrows():
        pid = str(int(row['Product ID']))
        name = str(row.get('Tên sản phẩm', ''))
        desc = str(row.get('Mô tả chính', ''))
        
        # Gom các cột ảnh sản phẩm (Từ 1 đến 8)
        images = []
        for i in range(1, 9):
            img_col = f'Ảnh sản phẩm{i}'
            if img_col in df_basic.columns and pd.notna(row[img_col]) and str(row[img_col]).strip() != 'nan':
                images.append(str(row[img_col]).strip())
                
        basic_map[pid] = {
            "name": name,
            "desc": desc,
            "images": images
        }

    # 2. BÓC TÁCH FILE 3 (MEDIA) - Lấy Hình ảnh riêng của từng Phân loại (Variation)
    var_media_map = {}
    for _, row in df_media.iterrows():
        lz_sku = str(row.get('Lazada SKU', '')).strip()
        seller_sku = str(row.get('SellerSku', '')).strip()
        img = str(row.get('Hình Ảnh1', '')).strip()
        
        if img and img != 'nan':
            # Lưu vết bằng cả mã Lazada lẫn SKU của Shop để đối chiếu cho chắc ăn
            if lz_sku and lz_sku != 'nan': var_media_map[lz_sku] = img
            if seller_sku and seller_sku != 'nan': var_media_map[seller_sku] = img

    # 3. LẮP RÁP TỪ FILE 2 (SALES) - Khung xương trung tâm
    products_dict = {}
    for _, row in df_sales.iterrows():
        pid = str(int(row['Product ID']))
        lz_sku = str(row.get('Lazada SKU', '')).strip()
        seller_sku = str(row.get('SellerSku', '')).strip()
        v_name = str(row.get('Variations Combo', '')).strip()
        
        # Bắt dính cả Giá Gốc lẫn Giá Đặc Biệt (Khuyến mãi)
        price = parse_number(row.get('Giá', 0))
        special_price = parse_number(row.get('SpecialPrice', 0))
        stock = int(parse_number(row.get('Số lượng', 0)))
        
        if not v_name or v_name == 'nan': v_name = "Mặc định"
            
        # Lấy lại thông tin từ File Basic
        b_info = basic_map.get(pid, {})
        if pid not in products_dict:
            products_dict[pid] = {
                "item_id": pid,
                "product_name": b_info.get("name", str(row.get('Tên sản phẩm', ''))),
                "description": b_info.get("desc", ""),
                "images": b_info.get("images", []),
                "variations": []
            }
            
        # Móc nối lấy Ảnh của Phân loại từ File Media
        v_img = var_media_map.get(lz_sku, var_media_map.get(seller_sku, ""))
        
        # THUẬT TOÁN ĐẢO GIÁ HIỂN THỊ LÊN WEBSITE
        # Nếu có giá Khuyến mãi (SpecialPrice > 0): Web sẽ lấy giá KM làm giá bán chính, Giá gốc sẽ bị đẩy xuống làm giá gạch chéo.
        # Nếu không có KM: Giá bán chính là giá gốc, không có giá gạch chéo.
        gia_ban_thuc_te = special_price if special_price > 0 else price
        gia_goc_gach_cheo = price if special_price > 0 else 0

        # TRUYỀN DỮ LIỆU CHUẨN 100% THEO DATABASE SCHEMA (BẢNG product_variations)
        products_dict[pid]["variations"].append({
            "variation_name": v_name,
            "sku": seller_sku if seller_sku != 'nan' else '',
            "price": price,                  # Bắn thẳng Giá gốc vào cột 'price'
            "discount_price": special_price, # Bắn thẳng Giá KM vào cột 'discount_price'
            "stock": stock,
            "variation_image": v_img
        })

    # --- 🌟 BỌC THÉP TỔNG TỒN KHO: LỌC BỎ SẢN PHẨM CHẾT (TỒN = 0) ---
    valid_products = []
    for p in products_dict.values():
        total_stock = sum(v.get("stock", 0) for v in p["variations"])
        if total_stock > 0:
            valid_products.append(p)
            
    product_list = valid_products
    total_products = len(product_list)
    
    trash_count = len(products_dict) - total_products
    if trash_count > 0:
        log_func(f"🧹 Đã dọn dẹp {trash_count} sản phẩm rác (Tổng tồn bằng 0).")
        
    log_func(f"🚀 Xào nấu hoàn tất! Đã gom được {total_products} Sản phẩm Lazada. Chuẩn bị bắn lên Website...")
    
    # [DEBUG] XUẤT FILE LOG ĐỂ KIỂM TRA DỮ LIỆU JSON
    try:
        current_dir = os.path.dirname(os.path.abspath(__file__))
        debug_file = os.path.join(current_dir, "debug_payload_lazada.json")
        with open(debug_file, "w", encoding="utf-8") as f:
            json.dump(product_list, f, ensure_ascii=False, indent=4)
    except: pass

    # 4. ĐỒNG BỘ QUA TỔNG QUẢN PRODUCT HUB
    import sys, os
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
    try:
        from engines.product_core_hub import ProductCoreHub
        hub = ProductCoreHub(log_func)
        
        chunk_size = 40
        for i in range(0, total_products, chunk_size):
            chunk = product_list[i:i + chunk_size]
            log_func(f"\n⏳ Đang đẩy lô {i//chunk_size + 1} ({len(chunk)} SP) vào Trạm trung chuyển (Hub)...")
            hub.sync_products(shop_name, "lazada", chunk)
            
        log_func("🎉 HOÀN TẤT CHUYỂN TOÀN BỘ DỮ LIỆU LAZADA QUA HUB!")
    except ImportError:
        log_func("❌ LỖI HỆ THỐNG: Không tìm thấy ProductCoreHub.")
    except Exception as e:
        log_func(f"❌ Lỗi bất ngờ: {str(e)}")
