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
            return df[pd.to_numeric(df['et_title_product_id'], errors='coerce').notnull()]
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
    media_map = {row['et_title_product_id']: row.get('ps_item_cover_image', '') for _, row in df_media.iterrows()}

    products_dict = {}
    for _, row in df_sales.iterrows():
        p_id = row['et_title_product_id']
        if p_id not in products_dict:
            products_dict[p_id] = {
                "item_id": str(p_id),
                "product_name": str(row.get('et_title_product_name', '')),
                "description": str(basic_map.get(p_id, '')),
                "images": [str(media_map.get(p_id, ''))] if media_map.get(p_id, '') else [],
                "variations": []
            }
            
        var_sku = str(row.get('et_title_variation_sku', '')).strip()
        price = str(row.get('et_title_variation_price', '0')).replace(',', '')
        stock = str(row.get('et_title_variation_stock', '0')).replace(',', '')
        
        products_dict[p_id]["variations"].append({
            "variation_name": str(row.get('et_title_variation_name', '')).strip(),
            "sku": var_sku if var_sku != 'nan' else '',
            "price": float(price) if price.replace('.', '', 1).isdigit() else 0,
            "stock": int(stock) if float(stock).is_integer() else 0,
            "variation_image": ""
        })

    payload = {"platform": "shopee", "shop": shop_name, "products": list(products_dict.values())}
    
    log_func(f"🚀 Đang bắn {len(payload['products'])} Sản phẩm lên Website...")
    try:
        res = requests.post(SYNC_VARIATIONS_URL, json=payload)
        if res.status_code == 200:
            data = res.json()
            log_func(f"🎉 HOÀN TẤT! Đã đồng bộ {data.get('synced', 0)} phân loại lên Web.")
            log_func(f"🤖 Hệ thống tự động Map được: {data.get('auto_mapped', 0)} SKU.")
        else:
            log_func(f"❌ Lỗi từ Server: {res.status_code} - {res.text}")
    except Exception as e:
        log_func(f"❌ Lỗi mạng: {e}")

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

    payload = {"platform": "tiktok", "shop": shop_name, "products": list(products_dict.values())}
    
    log_func(f"🚀 Đang bắn {len(payload['products'])} Sản phẩm TikTok lên Website...")
    try:
        res = requests.post(SYNC_VARIATIONS_URL, json=payload)
        if res.status_code == 200:
            data = res.json()
            log_func(f"🎉 HOÀN TẤT! Đã đồng bộ {data.get('synced', 0)} phân loại lên Web.")
            log_func(f"🤖 Hệ thống tự động Map được: {data.get('auto_mapped', 0)} SKU.")
        else:
            log_func(f"❌ Lỗi từ Server: {res.status_code} - {res.text}")
    except Exception as e:
        log_func(f"❌ Lỗi mạng: {e}")
