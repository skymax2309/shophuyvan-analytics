import pandas as pd
import requests
import os
import glob

# ==========================================
# BẢN VÁ LỖI ĐẶC TRỊ FILE EXCEL CỦA SHOPEE
# Lỗi: Shopee xuất file bị sai chuẩn 'activePane'
# ==========================================
try:
    import openpyxl
    from openpyxl.worksheet.views import Pane
    from openpyxl.descriptors import String
    # Ép Python không kiểm tra nghiêm ngặt thẻ activePane nữa
    Pane.activePane = String(allow_none=True)
except Exception:
    pass

# --- CẤU HÌNH ---
API_URL = "https://shophuyvan-analytics.nghiemchihuy.workers.dev/api/products/shopee-import"

# 1. TỰ ĐỘNG TÌM FILE TRONG THƯ MỤC HIỆN TẠI
current_dir = os.path.dirname(os.path.abspath(__file__))

def find_file(keyword):
    # Tìm file csv hoặc xlsx có chứa từ khóa
    files = glob.glob(os.path.join(current_dir, f"*{keyword}*.csv"))
    if not files:
        files = glob.glob(os.path.join(current_dir, f"*{keyword}*.xlsx"))
    return files[0] if files else None

sales_file = find_file("sales")
media_file = find_file("media")
basic_file = find_file("basic")

if not sales_file or not media_file or not basic_file:
    print("❌ LỖI: Không tìm thấy đủ 3 file (Sales, Media, Basic) trong thư mục!")
    print(f"Vui lòng copy 3 file tải từ Shopee vào thư mục:\n{current_dir}")
    exit()

print("✅ Đã tìm thấy file:")
print(f" - Sales: {os.path.basename(sales_file)}")
print(f" - Media: {os.path.basename(media_file)}")
print(f" - Basic: {os.path.basename(basic_file)}")
print("-" * 30)

# 2. ĐỌC FILE THÔNG MINH (TỰ NHẬN DIỆN EXCEL HAY CSV VÀ LỌC RÁC)
def read_shopee_file(filepath):
    if filepath.lower().endswith('.xlsx'):
        df = pd.read_excel(filepath, header=0, dtype=str).fillna('')
    else:
        try:
            df = pd.read_csv(filepath, header=0, dtype=str, encoding='utf-8-sig').fillna('')
        except UnicodeDecodeError:
            df = pd.read_csv(filepath, header=0, dtype=str, encoding='utf-16-le').fillna('')
            
    # Lọc bỏ 5 dòng rác đầu tiên của Shopee: Chỉ giữ lại các dòng mà ID là chuỗi số
    if 'et_title_product_id' in df.columns:
        df = df[df['et_title_product_id'].str.isnumeric()]
    return df

print("⏳ Đang đọc dữ liệu...")
df_sales = read_shopee_file(sales_file)
df_media = read_shopee_file(media_file)
df_basic = read_shopee_file(basic_file)

# Ép ID về chung định dạng string để gộp
df_sales['product_id'] = df_sales['et_title_product_id']
df_media['product_id'] = df_media['et_title_product_id']
df_basic['product_id'] = df_basic['et_title_product_id']

# 3. GỘP 3 FILE LẠI LÀM 1
print("🔄 Đang gộp dữ liệu...")
df_merged = df_sales.merge(df_media, on='product_id', how='left').merge(df_basic, on='product_id', how='left')

product_tree = {}

# 4. XÂY DỰNG CẤU TRÚC JSON CHA - CON
for index, row in df_merged.iterrows():
    p_id = row['product_id']
    parent_sku = str(row.get('et_title_parent_sku_x', '') or f"SP_{p_id}").strip().upper()
    var_sku = str(row.get('et_title_variation_sku', '')).strip().upper()
    
    if p_id not in product_tree:
        # Gom list ảnh (Từ cột cover đến 8 ảnh phụ)
        images = []
        if row.get('ps_item_cover_image'): images.append(row['ps_item_cover_image'])
        for i in range(1, 9):
            img_col = f'ps_item_image.{i}'
            if row.get(img_col): images.append(row[img_col])
            
        product_tree[p_id] = {
            "parent_sku": parent_sku,
            "product_name": row.get('et_title_product_name_x', ''),
            "description": row.get('et_title_product_description', ''),
            "video_url": row.get('ps_item_video', '') or row.get('ps_item_video_url', ''),
            "image_url": images[0] if images else "",
            "images": images,
            "variations": []
        }
    
    # Gom phân loại con
    if var_sku:
        var_name = row.get('et_title_variation_name', '')
        var_image = ""
        
        # Dò ảnh phân loại trong 20 cột option
        for i in range(1, 21):
            if row.get(f'et_title_option_{i}_for_variation_1') == var_name:
                var_image = row.get(f'et_title_option_image_{i}_for_variation_1', '')
                break
                
        product_tree[p_id]['variations'].append({
            "sku": var_sku,
            "variation_name": var_name,
            "price": float(row.get('et_title_variation_price', 0) or 0),
            "stock": int(row.get('et_title_variation_stock', 0) or 0),
            "image_url": var_image
        })

# 5. BẮN API LÊN CLOUDFLARE WORKER
payload = list(product_tree.values())

print(f"🚀 Bắt đầu đẩy {len(payload)} Sản phẩm (Kèm phân loại) lên Server...")

headers = {'Content-Type': 'application/json'}
response = requests.post(API_URL, json={"products_data": payload}, headers=headers)

if response.status_code == 200:
    print(f"✅ THÀNH CÔNG! Đã cập nhật xong hệ thống: {response.json()}")
else:
    print(f"❌ LỖI API: {response.status_code} - {response.text}")
