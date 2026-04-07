import os
import threading
import subprocess
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
# MỞ TOANG CỬA BẢO MẬT: Cho phép mọi thiết bị, mọi domain (kể cả HTTPS) gửi data vào
CORS(app, resources={r"/*": {"origins": "*"}})

# --- CẤU HÌNH HỆ THỐNG ---
SERVER_URL = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api"
TEMP_DIR = "temp_videos"

if not os.path.exists(TEMP_DIR):
    os.makedirs(TEMP_DIR)

# 🌟 RADAR GIÁM SÁT CỔNG: Bắt mọi tín hiệu bay đến Server (Dù lỗi hay không)
@app.before_request
def log_request_info():
    # Bỏ qua việc in log các request OPTIONS (trình duyệt tự gửi để check CORS)
    if request.method != 'OPTIONS':
        print(f"\n[📡 TÍN HIỆU VÀO] Từ IP: {request.remote_addr} | Lệnh: {request.method} {request.path}")

@app.errorhandler(Exception)
def handle_exception(e):
    """Bắt mọi lỗi sập Server và in ra màn hình thay vì im lặng"""
    print(f"❌ [LỖI HỆ THỐNG NGHIÊM TRỌNG]: {str(e)}")
    return jsonify(error=str(e)), 500

@app.route('/ping', methods=['GET', 'POST'])
def ping():
    """Cổng Test: Dùng để iPad kiểm tra xem có nhìn thấy PC không"""
    return jsonify({"status": "ok", "message": "Trạm nội bộ đã thông mạng!"}), 200

def process_and_upload_video(raw_video_path, order_id):
    """LUỒNG NGẦM: Nén file và Đẩy mây"""
    compressed_video_path = os.path.join(TEMP_DIR, f"{order_id}_compressed.mp4")
    
    print(f"[*] [FFMPEG] Bắt đầu nén video cho đơn {order_id}...")
    try:
        cmd = [
            'ffmpeg', '-y', '-i', raw_video_path,
            '-vcodec', 'libx264', '-preset', 'ultrafast', 
            '-crf', '30', '-acodec', 'aac', '-b:a', '32k',
            compressed_video_path
        ]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        print(f"✅ [FFMPEG] Nén thành công: {order_id}.mp4")
        
        if os.path.exists(raw_video_path):
            os.remove(raw_video_path)
        
        print(f"☁️ Đang đẩy video nén của đơn {order_id} lên R2...")
        with open(compressed_video_path, "rb") as f:
            video_bytes = f.read()
            
        upload_url = f"{SERVER_URL}/upload?file=videos/{order_id}.mp4&token=huyvan_secret_2026"
        up_res = requests.put(upload_url, data=video_bytes, headers={"Content-Type": "video/mp4"}, timeout=60)
        
        if up_res.status_code == 200:
            print(f"✅ [CLOUD] Đã lưu trữ đám mây thành công: videos/{order_id}.mp4")
            
            status_url = f"{SERVER_URL}/orders/{order_id}/oms-status"
            res = requests.patch(status_url, json={"oms_status": "PACKED_WITH_VIDEO"})
            if res.status_code == 200:
                print(f"🔄 Đã báo cáo trạng thái hoàn tất về Web cho đơn {order_id}!")
        else:
            print(f"⚠️ [CLOUD] Lỗi đẩy mây R2: {up_res.text}")
            
    except Exception as e:
        print(f"❌ [CRITICAL] Lỗi luồng xử lý video đơn {order_id}: {e}")
    finally:
        if os.path.exists(compressed_video_path):
            os.remove(compressed_video_path)

@app.route('/upload-video', methods=['POST'])
def receive_video():
    """CỔNG TIẾP TÂN: Nhận file từ iPad"""
    try:
        if 'video' not in request.files:
            print("⚠️ Lỗi: iPad có gọi đến nhưng KHÔNG CÓ file video đính kèm.")
            return jsonify({"error": "Thiếu file video"}), 400
            
        order_id = request.form.get('order_id')
        video_file = request.files['video']
        
        if not order_id or not video_file.filename:
            print("⚠️ Lỗi: Thiếu mã đơn hàng hoặc file rỗng.")
            return jsonify({"error": "Thiếu mã đơn hàng"}), 400
            
        raw_video_path = os.path.join(TEMP_DIR, f"{order_id}_raw.webm")
        video_file.save(raw_video_path)
        
        print(f"⚡ [RADAR] Nhận thành công gói video gốc: {order_id}_raw.webm ({os.path.getsize(raw_video_path)} bytes)")
        
        threading.Thread(target=process_and_upload_video, args=(raw_video_path, order_id), daemon=True).start()
        return jsonify({"message": "Trạm nội bộ đã nhận, đang xử lý ngầm!"}), 200
        
    except Exception as e:
        print(f"❌ Lỗi khi bóc tách file từ iPad: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    print("=====================================================================")
    print("🚀 ĐỘNG CƠ HẬU PHƯƠNG - TRẠM XỬ LÝ VIDEO ĐÃ KHỞI ĐỘNG (BẢN CÓ RADAR)!")
    print("=====================================================================")
    app.run(host='0.0.0.0', port=5000, threaded=True)
