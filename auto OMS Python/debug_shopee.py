import os
import glob
import pandas as pd

print("="*50)
print("🔍 ĐANG SOI TÊN CỘT TRONG FILE HÌNH ẢNH 🔍")
print("="*50)

shop_name = "KHOGIADUNGHUYVAN"
base_dir = os.path.dirname(os.path.abspath(__file__))

def find_file(prefix):
    search_pattern = os.path.join(base_dir, '**', f"{prefix}_{shop_name}*.*")
    files = glob.glob(search_pattern, recursive=True)
    valid = [f for f in files if f.endswith('.xlsx') or f.endswith('.csv')]
    return valid[0] if valid else None

media_file = find_file('media')

if not media_file:
    print("❌ KHÔNG TÌM THẤY FILE MEDIA!")
else:
    print(f"📁 Đã mở: {media_file}")
    
    # Đọc file
    df = pd.read_excel(media_file, header=0, dtype=str, engine='calamine')
    
    print("\n🎯 DANH SÁCH TÊN CỘT THỰC TẾ TRONG FILE LÀ:")
    # Chỉ in 20 cột đầu tiên để tìm cột ID
    for idx, col in enumerate(df.columns.tolist()[:20]):
        print(f"Cột {idx}: '{col}'")
        
    print("\n" + "="*50)
    print("👉 BẠN HÃY COPY TOÀN BỘ KẾT QUẢ NÀY GỬI LÊN ĐÂY NHÉ!")
