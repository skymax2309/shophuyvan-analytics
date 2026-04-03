import requests
import json
import datetime
import os
import time  # Thêm thư viện time để tạo nhịp nghỉ cho vòng lặp

# 🔴 QUAN TRỌNG: Hãy thay thế bằng URL Server Website thực tế của bạn
API_BASE_URL = 'https://huyvan-worker-api.nghiemchihuy.workers.dev' # Ví dụ: https://oms.ten-ban.workers.dev

def log(message):
    now = datetime.datetime.now().strftime("%H:%M:%S")
    print(f"[{now}] {message}")

def get_unmapped_orders():
    log("📡 Đang kết nối lên Server để truy quét các đơn 'Chưa Map SKU'...")
    # Bắt chước chính xác tham số của Web (limit=50) để chống lỗi Timeout 500 của Cloudflare
    url = f"{API_BASE_URL}/api/orders?data_status=unmapped&limit=50&page=1"
    try:
        response = requests.get(url, timeout=30)
        if response.status_code != 200:
            log(f"❌ Server trả về mã lỗi {response.status_code}. Không thể lấy dữ liệu.")
            return []
        
        data = response.json()
        orders = data.get("data", [])
        order_ids = [o["order_id"] for o in orders]
        return order_ids
    except Exception as e:
        log(f"❌ Lỗi kết nối API: {e}")
        return []

def main():
    log("-------------------------------------------------")
    log("🚀 KHỞI ĐỘNG TOOL DỌN RÁC (CHẾ ĐỘ AUTO-LOOP CUỐN CHIẾU)")
    
    confirm = input("\n❓ Bạn có muốn Tool TỰ ĐỘNG quét và xóa cuốn chiếu (mỗi vòng 50 đơn) cho đến khi sạch kho không? (y/n): ")
    if confirm.lower() != 'y':
        log("🛑 Đã hủy thao tác.")
        return

    total_deleted = 0
    while True:
        order_ids = get_unmapped_orders()

        if not order_ids:
            log("-------------------------------------------------")
            log(f"🏆 HOÀN TẤT! Đã dọn dẹp tổng cộng {total_deleted} đơn lỗi. Hệ thống hiện tại đã sạch sẽ 100%.")
            log("👉 Hãy xóa các file Cache (.json) trong thư mục và chạy lại Bot cào đơn nhé!")
            break

        log(f"⚠️ Phát hiện lô {len(order_ids)} đơn lỗi. Đang tiến hành tiêu diệt...")

        # Thực thi xóa lô 50 đơn
        delete_url = f"{API_BASE_URL}/api/orders/bulk-delete"
        payload = {"order_ids": order_ids}
        try:
            res = requests.post(delete_url, json=payload)
            if res.status_code == 200:
                log(f"✅ Đã xóa xong lô {len(order_ids)} đơn. Tạm nghỉ 2 giây cho Server thở...")
                total_deleted += len(order_ids)
                time.sleep(2) # Nhịp nghỉ bảo vệ Server Cloudflare
            else:
                log(f"❌ [LỖI SERVER] Server từ chối lệnh xóa (HTTP {res.status_code}). Ngừng vòng lặp.")
                break
        except Exception as e:
            log(f"❌ Lỗi gửi lệnh xóa: {e}. Ngừng vòng lặp.")
            break

if __name__ == "__main__":
    main()
