import os
import sys
import time
import json
import zipfile
import threading
import subprocess
import urllib.request

# ==============================================================================
# BỘ MÁY AUTO-SETUP: TỰ ĐỘNG SINH TỒN VÀ TRANG BỊ VŨ KHÍ
# ==============================================================================
def install_packages():
    """Tự động cài đặt các thư viện Python còn thiếu"""
    packages = ["flask", "flask-cors", "requests"]
    for pkg in packages:
        try:
            __import__(pkg.replace('-', '_'))
        except ImportError:
            print(f"[*] Đang trang bị thư viện: {pkg}...")
            subprocess.check_call([sys.executable, "-m", "pip", "install", pkg, "--quiet"])

def download_with_progress(url, dest):
    """Tải file có thanh tiến trình"""
    def hook(count, block_size, total_size):
        percent = int(count * block_size * 100 / total_size)
        sys.stdout.write(f"\r   -> Đang tải... {min(percent, 100)}%")
        sys.stdout.flush()
    urllib.request.urlretrieve(url, dest, hook)
    print(" [Hoàn tất]")

def setup_weapons():
    """Tự động tải Ngrok và FFmpeg nếu chưa có"""
    # 1. Setup Ngrok
    if not os.path.exists("ngrok.exe"):
        print("\n[*] Không tìm thấy Ngrok. Đang tự động tải vũ khí xuyên tường...")
        ngrok_zip = "ngrok.zip"
        download_with_progress("https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-windows-amd64.zip", ngrok_zip)
        with zipfile.ZipFile(ngrok_zip, 'r') as zip_ref:
            zip_ref.extractall()
        os.remove(ngrok_zip)

    # 2. Setup FFmpeg
    if not os.path.exists("ffmpeg.exe"):
        print("\n[*] Không tìm thấy FFmpeg. Đang tải cưa máy nén video (Khoảng 80MB, vui lòng đợi)...")
        ffmpeg_zip = "ffmpeg.zip"
        download_with_progress("https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip", ffmpeg_zip)
        print("   -> Đang giải nén cưa máy...")
        with zipfile.ZipFile(ffmpeg_zip, 'r') as zip_ref:
            for member in zip_ref.namelist():
                if member.endswith("ffmpeg.exe"):
                    source = zip_ref.open(member)
                    target = open("ffmpeg.exe", "wb")
                    with source, target: target.write(source.read())
        os.remove(ffmpeg_zip)
        # Dọn dẹp thư mục rác giải nén
        for d in os.listdir():
            if os.path.isdir(d) and "ffmpeg" in d.lower():
                import shutil
                shutil.rmtree(d)

# KÍCH HOẠT AUTO-SETUP NGAY LẬP TỨC
install_packages()
setup_weapons()

# ==============================================================================
# KHỞI TẠO SERVER & IMPORT SAU KHI ĐÃ CÓ ĐỦ THƯ VIỆN
# ==============================================================================
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

SERVER_URL = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api"
TEMP_DIR = "temp_videos"
os.makedirs(TEMP_DIR, exist_ok=True)

@app.before_request
def log_request_info():
    if request.method != 'OPTIONS':
        print(f"\n[📡 TÍN HIỆU VÀO] Từ Tiền tuyến | Lệnh: {request.method} {request.path}")

@app.errorhandler(Exception)
def handle_exception(e):
    print(f"❌ [LỖI NGHIÊM TRỌNG]: {str(e)}")
    return jsonify(error=str(e)), 500

def process_and_upload_video(raw_video_path, order_id):
    """LUỒNG NGẦM: Nén và Đẩy lên đám mây"""
    compressed_video_path = os.path.join(TEMP_DIR, f"{order_id}_compressed.mp4")
    print(f"[*] [FFMPEG] Bắt đầu nén video đơn {order_id}...")
    try:
        # Gọi thẳng ffmpeg.exe trong cùng thư mục
        cmd = [
            'ffmpeg.exe', '-y', '-i', raw_video_path,
            '-vcodec', 'libx264', '-preset', 'ultrafast', 
            '-crf', '30', '-acodec', 'aac', '-b:a', '32k',
            compressed_video_path
        ]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        print(f"✅ [FFMPEG] Nén thành công: {order_id}.mp4")
        if os.path.exists(raw_video_path): os.remove(raw_video_path)
        
        print(f"☁️ Đang đẩy mây R2...")
        with open(compressed_video_path, "rb") as f: video_bytes = f.read()
            
        up_res = requests.put(f"{SERVER_URL}/upload?file=videos/{order_id}.mp4&token=huyvan_secret_2026", 
                              data=video_bytes, headers={"Content-Type": "video/mp4"}, timeout=60)
        
        if up_res.status_code == 200:
            print(f"✅ [CLOUD] Đã lưu R2: videos/{order_id}.mp4")
            res = requests.patch(f"{SERVER_URL}/orders/{order_id}/oms-status", json={"oms_status": "PACKED_WITH_VIDEO"})
            if res.status_code == 200: print(f"🔄 Đã báo cáo trạng thái hoàn tất về Web!")
        else: print(f"⚠️ [CLOUD] Lỗi đẩy mây R2: {up_res.text}")
            
    except Exception as e: print(f"❌ [CRITICAL] Lỗi: {e}")
    finally:
        if os.path.exists(compressed_video_path): os.remove(compressed_video_path)

@app.route('/upload-video', methods=['POST'])
def receive_video():
    try:
        if 'video' not in request.files: return jsonify({"error": "Thiếu file"}), 400
        order_id = request.form.get('order_id')
        video_file = request.files['video']
        if not order_id: return jsonify({"error": "Thiếu mã đơn"}), 400
            
        raw_video_path = os.path.join(TEMP_DIR, f"{order_id}_raw.webm")
        video_file.save(raw_video_path)
        print(f"⚡ [RADAR] Nhận thành công gói video gốc: {order_id}")
        
        threading.Thread(target=process_and_upload_video, args=(raw_video_path, order_id), daemon=True).start()
        return jsonify({"message": "Đang xử lý ngầm!"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def start_ngrok_and_report():
    """Tự động đào hầm Ngrok và báo cáo tọa độ lên Server Web"""
    print("\n[*] Đang khởi động Ngrok ngầm...")
    # Khởi chạy ngrok ẩn
    subprocess.Popen(['ngrok.exe', 'http', '5000'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(3) # Đợi ngrok lấy link
    
    try:
        # Xin link từ local ngrok API
        res = requests.get("http://127.0.0.1:4040/api/tunnels", timeout=5)
        tunnels = res.json().get('tunnels', [])
        public_url = next((t['public_url'] for t in tunnels if t['public_url'].startswith('https')), None)
        
        if public_url:
            print(f"✅ TỌA ĐỘ MỚI (HTTPS): {public_url}")
            # --- CHỖ NÀY SẼ BẮN TỌA ĐỘ LÊN CLOUDFLARE ---
            try:
                # Gọi API Server để lưu cấu hình
                requests.post(f"{SERVER_URL}/cctv-config", json={"ngrok_url": public_url}, timeout=10)
                print("☁️ Đã đồng bộ tọa độ tự động lên Server Đám mây!")
            except:
                print("⚠️ Server chưa có API đón tọa độ. Sẽ cập nhật sau.")
        else:
            print("⚠️ Không lấy được link Ngrok.")
    except Exception as e:
        print(f"⚠️ Lỗi kết nối Ngrok: {e}")

if __name__ == '__main__':
    print("=====================================================================")
    print("🚀 SIÊU TRẠM ĐÓNG GÓI - ZERO TOUCH ĐÃ SẴN SÀNG!")
    print("=====================================================================")
    threading.Thread(target=start_ngrok_and_report, daemon=True).start()
    app.run(host='0.0.0.0', port=5000, threaded=True)
