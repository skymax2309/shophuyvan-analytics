import pandas as pd
import requests
import re
import math

# Cấu hình API và tên file
API_URL = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/purchase"
FILE_PATH = "NHẬP HÀNG CHÍNH NGẠCH.xlsx" # Đảm bảo file Excel nằm cùng thư mục với file code này

def parse_dimension(dim_str):
    """Hàm thông minh bóc tách 3 số kích thước từ chuỗi lộn xộn"""
    if pd.isna(dim_str) or not str(dim_str).strip(): 
        return 0, 0, 0
    # Tìm tất cả các con số (bao gồm số thập phân) trong chuỗi
    nums = re.findall(r'[\d.]+', str(dim_str).replace(',', '.'))
    nums = [float(n) for n in nums]
    d = nums[0] if len(nums) > 0 else 0
    r = nums[1] if len(nums) > 1 else 0
    c = nums[2] if len(nums) > 2 else 0
    return d, r, c

def import_data():
    print(f"⏳ Đang đọc file Excel '{FILE_PATH}'...")
    
    try:
        # Bước 1: Đọc thô để dò tìm xem dòng nào chứa Tiêu đề thật sự (chứa chữ 'tên sản phẩm')
        df_raw = pd.read_excel(FILE_PATH, sheet_name=0, header=None)
        header_idx = 0
        for idx, row in df_raw.iterrows():
            row_str = ' '.join([str(val).lower() for val in row.values])
            if 'tên sản phẩm' in row_str or 'tensanpham' in row_str.replace(' ', ''):
                header_idx = idx
                break
                
        # Bước 2: Đọc lại file chuẩn xác từ dòng Tiêu đề vừa tìm được
        df = pd.read_excel(FILE_PATH, sheet_name=0, header=header_idx)
        
        # Chuẩn hóa tên cột (Viết thường, bỏ khoảng trắng dư thừa)
        df.columns = [str(c).strip().lower() for c in df.columns]
        
        success_count = 0
        print("🚀 Bắt đầu đẩy dữ liệu lên Database...\n")
        
        for index, row in df.iterrows():
            ten_sp = str(row.get('tên sản phẩm', '')).strip()
            # Bỏ qua các dòng trống hoặc dòng tính tổng của Excel
            if pd.isna(ten_sp) or ten_sp == 'nan' or ten_sp == '' or ten_sp == '0':
                continue
                
            # Hàm hỗ trợ lấy dữ liệu an toàn, không bị lỗi nếu thiếu cột
            def get_val(keyword, default=0):
                for c in df.columns:
                    if keyword in c.replace(' ', ''):
                        val = row[c]
                        if pd.isna(val): return default
                        try: return float(val)
                        except: return default
                return default
            
            def get_str(keyword):
                for c in df.columns:
                    if keyword in c.replace(' ', ''):
                        val = row[c]
                        return "" if pd.isna(val) else str(val).strip()
                return ""

            # Bóc tách Kích thước sản phẩm bằng Regex
            kt_sp_d, kt_sp_r, kt_sp_c = parse_dimension(get_str('kíchthướcsảnphẩm'))
            
            # Phân biệt Tính KG hay Tính Khối
            cach_tinh = "TÍNH KHỐI" if "khối" in get_str('tiềnkg/khối').lower() else "TÍNH KG"

            # Đóng gói dữ liệu chuẩn bị gửi đi
            payload = {
                "ten_san_pham": ten_sp,
                "ma_van_don": get_str('mãvậnđơn'),
                "ma_hang": get_str('mãhàng'),
                "sl_nhap": get_val('slnhập', 0),
                "gia_nhap_te": get_val('giánhập', 0),
                "gia_khai_thue": get_val('giákhai', 0),
                "ship_noi_dia_te": get_val('shipnộiđịa', 0),
                "so_kien": int(get_val('sốkiện', 1)) or 1,
                "sl_sp_tren_kien": int(get_val('sl/kiện', 1)) or 1,
                "trong_luong_kg": get_val('tổngkg', 0),
                "thue_vat_percent": get_val('thuếvat', 10),
                "phi_vanchuyen_thuc": get_val('tổngtiềnvậnchuyển', 0),
                "cong_dung": get_str('mụcđích'),
                "chat_lieu": get_str('chấtliệu'),
                "link_nhap_hang": get_str('linksp'),
                "kich_thuoc_sp_d": kt_sp_d,
                "kich_thuoc_sp_r": kt_sp_r,
                "kich_thuoc_sp_c": kt_sp_c,
                "kich_thuoc_d": 0, # Kiện chưa có cột riêng trong file, set 0
                "kich_thuoc_r": 0,
                "kich_thuoc_c": 0,
                "cach_tinh_vc": cach_tinh,
                "image_url": ""
            }
            
            # Bắn API đẩy vào Database
            try:
                res = requests.post(API_URL, json=payload)
                if res.status_code == 200:
                    success_count += 1
                    print(f"✅ Đã thêm: {ten_sp[:40]}...")
                else:
                    print(f"❌ Lỗi dòng {index+2}: API từ chối lưu")
            except Exception as e:
                print(f"❌ Lỗi mạng: {e}")
                
        print(f"\n🎉 TUYỆT VỜI! Đã import thành công {success_count} sản phẩm lên Web.")

    except FileNotFoundError:
        print(f"❌ Không tìm thấy file '{FILE_PATH}'. Hãy kiểm tra lại tên file!")
    except Exception as e:
        print(f"❌ Lỗi xử lý Excel: {e}")

if __name__ == '__main__':
    import_data()
