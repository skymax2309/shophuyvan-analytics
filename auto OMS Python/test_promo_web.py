import os
import pandas as pd
import requests
import tkinter as tk
from tkinter import filedialog

print("="*50)
print("🚀 BẮT ĐẦU TEST LUỒNG BÓC TÁCH & ĐẨY GIÁ KM LÊN WEB 🚀")
print("="*50)

# Tên shop đang test (bạn có thể sửa nếu cần)
shop_name = "KHOGIADUNGHUYVAN"

# 1. Hiển thị cửa sổ chọn file
print("👉 Đang mở hộp thoại chọn file... Hãy chọn file Excel Khuyến Mãi tải từ Shopee về!")
root = tk.Tk()
root.withdraw()
root.attributes('-topmost', True)

file_path = filedialog.askopenfilename(
    title="Chọn file Excel Khuyến Mãi Shopee",
    filetypes=[("Excel files", "*.xlsx *.xls")]
)
root.destroy()

if not file_path:
    print("❌ BẠN ĐÃ HỦY CHỌN FILE. KẾT THÚC TEST.")
    exit()

print(f"📁 Đã chọn file: {os.path.basename(file_path)}")

def run_test():
    try:
        print("\n⏳ Đang đọc file Excel và lột bỏ các dòng hướng dẫn...")
        try:
            df = pd.read_excel(file_path, dtype=str, engine='calamine')
        except:
            df = pd.read_excel(file_path, dtype=str)
            
        # Dò tìm dòng Header thực sự
        header_idx = 0
        for i in range(min(15, len(df))):
            row_str = " ".join([str(x).lower() for x in df.iloc[i].values])
            if "sku" in row_str and "giá" in row_str:
                header_idx = i + 1
                break
                
        if header_idx > 0:
            print(f"🔍 Đã phát hiện Header thật nằm ở dòng số {header_idx + 1} của Excel (bỏ qua {header_idx} dòng đầu).")
            try:
                df = pd.read_excel(file_path, dtype=str, header=header_idx, engine='calamine')
            except:
                df = pd.read_excel(file_path, dtype=str, header=header_idx)
        else:
            print("🔍 Không phát hiện dòng hướng dẫn thừa, dùng Header mặc định ở dòng 1.")

        print("\n🎯 DANH SÁCH TÊN CỘT THỰC TẾ (Sau khi lọc):")
        for col in df.columns:
            print(f" - '{col}'")

        # Tự động quét tìm tên cột
        COT_SKU = next((c for c in df.columns if "sku" in str(c).lower()), None)
        COT_GIA_KM = next((c for c in df.columns if "giá sau giảm" in str(c).lower() or "giá khuyến mãi" in str(c).lower()), None)

        if not COT_SKU or not COT_GIA_KM:
            print(f"\n❌ LỖI: Không tìm thấy cột SKU hoặc Giá KM trong danh sách trên!")
            return

        print(f"\n✅ Đã chốt cột SKU là: '{COT_SKU}'")
        print(f"✅ Đã chốt cột Giá KM là: '{COT_GIA_KM}'")

        print("\n⏳ Đang bóc tách dữ liệu...")
        items = []
        for index, row in df.iterrows():
            sku = str(row[COT_SKU]).strip()
            gia_km_str = str(row[COT_GIA_KM]).replace(',', '').replace('.', '').strip()
            if sku and sku != 'nan' and gia_km_str.isdigit():
                items.append({"sku": sku, "price": float(gia_km_str)})
                
        if not items:
            print("❌ Không tìm thấy dữ liệu dòng nào có Giá Khuyến Mãi hợp lệ (hoặc trống giá).")
            return

        print(f"✅ Đã bóc tách thành công {len(items)} phân loại có Giá Khuyến Mãi!")
        
        print("\n--- IN THỬ 5 SẢN PHẨM ĐẦU TIÊN ---")
        for it in items[:5]:
            print(f"SKU: {it['sku']}  ==>  Giá KM: {it['price']}")
        print("-----------------------------------")

        print("\n🚀 Đang bắn dữ liệu lên Server API...")
        api_url = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/products/update-promo-prices"
        payload = {"platform": "shopee", "shop": shop_name, "items": items}
        
        res = requests.post(api_url, json=payload)
        
        print(f"🌐 HTTP Status Code: {res.status_code}")
        print(f"🌐 Server Response: {res.text}")
        
        if res.status_code == 200 and res.json().get("success"):
            print(f"\n🎉 HOÀN TẤT! Đã cập nhật {len(items)} mức Giá KM lên Database Website thành công!")
        else:
            print("\n❌ Lỗi từ Server!")

    except Exception as e:
        print(f"❌ Lỗi hệ thống: {str(e)}")

if __name__ == "__main__":
    run_test()
    print("\n" + "="*50)
    print("🏁 KẾT THÚC TEST 🏁")
    print("="*50)
