import os
from utils import process_and_sync_files

# 1. Hàm in log ra màn hình console (thay thế cho log giao diện Tool)
def console_log(msg):
    print(f"[*] {msg}")

# 2. BẠN HÃY THAY ĐƯỜNG DẪN NÀY BẰNG ĐƯỜNG DẪN TỚI 3 FILE TRÊN MÁY BẠN
# Lưu ý: Giữ nguyên chữ 'r' ở đầu chuỗi đường dẫn để Python không bị lỗi ký tự
file_paths = {
    'basic': r"E:\shophuyvan-analytics\auto OMS Python\engines\shopee\basic_KHOGIADUNGHUYVAN.xlsx",
    'sales': r"E:\shophuyvan-analytics\auto OMS Python\engines\shopee\sales_KHOGIADUNGHUYVAN.xlsx",
    'media': r"E:\shophuyvan-analytics\auto OMS Python\engines\shopee\media_KHOGIADUNGHUYVAN.xlsx"
}

# 3. Tên shop test
shop_name = "KHOGIADUNGHUYVAN"

# 4. CHẠY THỬ
if __name__ == "__main__":
    print("==================================================")
    print("🚀 BẮT ĐẦU TEST LUỒNG BÓC TÁCH DỮ LIỆU ĐỘC LẬP 🚀")
    print("==================================================")
    
    # Kiểm tra xem file có tồn tại không trước khi chạy
    files_exist = True
    for key, path in file_paths.items():
        if not os.path.exists(path):
            print(f"❌ KHÔNG TÌM THẤY FILE: {path}")
            files_exist = False
            
    if files_exist:
        # Gọi thẳng hàm trong utils.py
        process_and_sync_files(shop_name, file_paths, console_log)
        
    print("==================================================")
    print("🏁 KẾT THÚC TEST 🏁")
    print("==================================================")
