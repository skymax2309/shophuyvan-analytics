import os
import threading
import subprocess
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
# Mở cửa cho phép iPad (từ domain khác) gửi file vào qua mạng LAN
CORS(app) 

# --- CẤU HÌNH HỆ THỐNG ---
SERVER_URL = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api"
TEMP_DIR = "temp_videos"

if not os.path.exists(TEMP_DIR):
    os.makedirs(TEMP_DIR)

def process_and_upload_video(raw_video_path, order_id):
    """LUỒNG NGẦM: Chịu trách nhiệm Nén file và Đẩy lên mây để không làm lag iPad"""
    compressed_video_path = os.path.join(TEMP_DIR, f"{order_id}_compressed.mp4")
    
    print(f"\n[*] [FFMPEG] Bắt đầu nén video cho đơn {order_id}...")
    try:
        # 1. Cưa máy FFmpeg: Ép dung lượng siêu nhẹ (giảm bitrate, dùng H.264), chạy tốc độ bàn thờ (ultrafast)
        cmd = [
            'ffmpeg', '-y', '-i', raw_video_path,
            '-vcodec', 'libx264', '-preset', 'ultrafast', 
            '-crf', '30', '-acodec', 'aac', '-b:a', '32k',
            compressed_video_path
        ]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        print(f"✅ [FFMPEG] Nén thành công: {order_id}.mp4 (Chỉ còn khoảng vài MB)")
        
        # Xóa file webm gốc cho sạch ổ cứng
        if os.path.exists(raw_video_path):
            os.remove(raw_video_path)
        
        # 2. Đẩy lên "Kho Lạnh" Cloudflare R2
        print(f"☁️ Đang đẩy video nén của đơn {order_id} lên R2...")
        with open(compressed_video_path, "rb") as f:
            video_bytes = f.read()
            
        upload_url = f"{SERVER_URL}/upload?file=videos/{order_id}.mp4&token=huyvan_secret_2026"
        up_res = requests.put(upload_url, data=video_bytes, headers={"Content-Type": "video/mp4"}, timeout=60)
        
        if up_res.status_code == 200:
            print(f"✅ [CLOUD] Đã lưu trữ đám mây thành công: videos/{order_id}.mp4")
            
            # 3. Đồng bộ trạng thái về Database D1 (Khai thác cột oms_status)
            # Lưu ý: Database D1 orders_v2 không có cột video_url, nhưng hệ thống Website 
            # sẽ tự động biết link video là "https://<domain_R2>/videos/MÃ_ĐƠN.mp4" 
            status_url = f"{SERVER_URL}/orders/{order_id}/oms-status"
            res = requests.patch(status_url, json={"oms_status": "PACKED_WITH_VIDEO"})
            if res.status_code == 200:
                print(f"🔄 Đã báo cáo trạng thái hoàn tất về Web cho đơn {order_id}!")
        else:
            print(f"⚠️ [CLOUD] Lỗi đẩy mây R2: {up_res.text}")
            
    except Exception as e:
        print(f"❌ [CRITICAL] Lỗi luồng xử lý video đơn {order_id}: {e}")
    finally:
        # Dọn dẹp nốt file nén mp4 sau khi up xong
        if os.path.exists(compressed_video_path):
            os.remove(compressed_video_path)


@app.route('/upload-video', methods=['POST'])
def receive_video():
    """CỔNG TIẾP TÂN: Nhận file từ iPad và đẩy việc cho Luồng ngầm"""
    if 'video' not in request.files:
        return jsonify({"error": "Thiếu file video"}), 400
        
    order_id = request.form.get('order_id')
    video_file = request.files['video']
    
    if not order_id or not video_file:
        return jsonify({"error": "Thiếu mã đơn hàng"}), 400
        
    # Lưu file gốc nhận từ iPad
    raw_video_path = os.path.join(TEMP_DIR, f"{order_id}_raw.webm")
    video_file.save(raw_video_path)
    
    print(f"\n⚡ [RADAR] Nhận được video gói hàng đơn: {order_id} từ Tiền Tuyến (iPad).")
    
    # KÍCH HOẠT ĐA LUỒNG: Bàn giao file cho Background Thread xử lý,
    # giải phóng cổng Tiếp Tân ngay lập tức để iPad quét mã tiếp theo.
    threading.Thread(target=process_and_upload_video, args=(raw_video_path, order_id), daemon=True).start()
    
    # Phản hồi siêu tốc (0.01s) cho iPad tiếp tục làm việc
    return jsonify({"message": "Trạm nội bộ đã nhận, đang xử lý ngầm!"}), 200

if __name__ == '__main__':
    print("=====================================================================")
    print("🚀 ĐỘNG CƠ HẬU PHƯƠNG - TRẠM XỬ LÝ VIDEO ĐÃ KHỞI ĐỘNG!")
    print("=====================================================================")
    print("👉 HƯỚNG DẪN KẾT NỐI:")
    print("1. Hãy đảm bảo Máy tính này và iPad đang dùng CHUNG 1 mạng WiFi.")
    print("2. Mở CMD gõ 'ipconfig' để lấy địa chỉ IPv4 của máy tính này (VD: 192.168.1.15).")
    print("3. Điền IP đó vào dòng 'PYTHON_SERVER_URL' trong file cctv_packing.html.")
    print("=====================================================================")
    
    # Lắng nghe 24/7 trên cổng 5000 ở tất cả card mạng LAN
    app.run(host='0.0.0.0', port=5000, threaded=True)
