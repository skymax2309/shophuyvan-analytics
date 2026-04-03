import requests
import json
import datetime
import os

# 🔴 QUAN TRỌNG: Hãy thay thế bằng URL Server Website thực tế của bạn
API_BASE_URL = "https://api.huyvan.workers.dev" # Ví dụ: https://oms.ten-ban.workers.dev

def log(message):
    now = datetime.datetime.now().strftime("%H:%M:%S")
    print(f"[{now}] {message}")

def get_unmapped_orders():
    log("📡 Đang kết nối lên Server để truy quét các đơn 'Chưa Map SKU'...")
    # Tận dụng đúng filter "data_status=unmapped" từ hệ thống Dashboard của bạn
    url = f"{API_BASE_URL}/api/orders?data_status=unmapped&limit=500"
    try:
        response = requests.get(url)
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
    log("🚀 KHỞI ĐỘNG TOOL QUÉT VÀ DỌN DẸP ĐƠN LỖI (OMS CLEANER)")
    order_ids = get_unmapped_orders()

    if not order_ids:
        log("✅ Tuyệt vời! Hệ thống sạch sẽ, không có đơn hàng nào bị lỗi 'Chưa Map SKU'.")
        return

    log(f"⚠️ Phát hiện {len(order_ids)} đơn hàng bị lỗi Phân loại/SKU trên Server.")
    log(f"📋 Danh sách mã đơn lỗi: {', '.join(order_ids)}")

    # 1. TẠO FILE SQL DỰ PHÒNG (Cho phép bạn copy/paste thủ công vào Cloudflare D1)
    sql_content = "-- FILE CHỨA LỆNH XÓA ĐƠN LỖI (CHẠY TRONG CLOUDFLARE D1 CONSOLE)\n"
    for oid in order_ids:
        sql_content += f"DELETE FROM order_items WHERE order_id = '{oid}';\n"
        sql_content += f"DELETE FROM orders_v2 WHERE order_id = '{oid}';\n"

    file_name = "clean_unmapped_backup.sql"
    with open(file_name, "w", encoding="utf-8") as f:
        f.write(sql_content)
    log(f"💾 [BACKUP] Đã xuất file '{file_name}' chứa {len(order_ids)*2} lệnh xóa an toàn vào thư mục.")

    # 2. THỰC THI XÓA TỰ ĐỘNG QUA API MẠNG
    confirm = input("\n❓ Bạn có muốn Tool tự động gửi lệnh XÓA CÁC ĐƠN NÀY lên Server ngay bây giờ không? (y/n): ")
    if confirm.lower() == 'y':
        log("📡 Đang gửi lệnh xóa tự động lên Server...")
        delete_url = f"{API_BASE_URL}/api/orders/bulk-delete"
        payload = {"order_ids": order_ids}
        try:
            # Gửi lệnh xóa (Method POST)
            res = requests.post(delete_url, json=payload)
            if res.status_code == 200:
                log("✅ [THÀNH CÔNG] Đã dọn dẹp sạch sẽ toàn bộ đơn lỗi trên Server!")
                log("👉 Bây giờ bạn hãy xóa các file Cache (.json) và chạy lại Tool cào đơn để cập nhật dữ liệu chuẩn nhé.")
            else:
                log(f"❌ [LỖI TỪ SERVER] Server từ chối lệnh xóa (HTTP {res.status_code}).")
                log("💡 Gợi ý: Server Cloudflare Worker của bạn chưa có Router nhận lệnh xóa này.")
        except Exception as e:
            log(f"❌ Lỗi gửi lệnh xóa: {e}")
    else:
        log("🛑 Đã hủy thao tác xóa tự động qua API.")
        log(f"👉 Bạn có thể mở file '{file_name}' vừa tạo, copy lệnh và dán vào Cloudflare Console để tự xóa.")

if __name__ == "__main__":
    main()
