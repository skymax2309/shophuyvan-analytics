import os
import sys
import time
import threading
import subprocess
import urllib.request
import zipfile

# --- 1 CLICK AUTO-INSTALLER: Tự cài đặt thư viện ---
try:
    import requests
    from flask import Flask, request, jsonify
    from flask_cors import CORS
except ImportError:
    print("⏳ Đang tự động cài đặt thư viện (Chỉ mất 10 giây cho lần đầu)...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "flask", "flask-cors", "requests", "urllib3"])
    import requests
    from flask import Flask, request, jsonify
    from flask_cors import CORS

# --- CẤU HÌNH ---
SERVER_URL = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api"
TEMP_DIR = "temp_videos"
os.makedirs(TEMP_DIR, exist_ok=True)

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

# [BỌC THÉP CORS]: Ép Apple Safari phải chấp nhận gói hàng
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

# [TRANG KIỂM TRA MẠNG]: Dành cho iPad tự test kết nối
@app.route('/', methods=['GET'])
def ping():
    return "✅ TRẠM PC ĐÃ THÔNG HẦM VÀ SẴN SÀNG NHẬN VIDEO!"

def setup_cloudflared():
    """Tự động tải Cloudflare Tunnel nếu thiếu"""
    if not os.path.exists("cloudflared.exe"):
        print("[*] Đang tải Cloudflare Tunnel (Siêu nhẹ, không cần Token)...")
        url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
        urllib.request.urlretrieve(url, "cloudflared.exe")
        print("✅ Đã chuẩn bị xong vũ khí Cloudflare.")

def setup_ffmpeg():
    """Tự động tải Động cơ nén video chuẩn công nghiệp"""
    if not os.path.exists("ffmpeg.exe"):
        print("\n[*] Đang tải bộ nén video FFmpeg (Khoảng 80MB - Chỉ tải 1 lần duy nhất)...")
        url = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"
        urllib.request.urlretrieve(url, "ffmpeg.zip")
        print("[*] Đang lắp ráp Động cơ...")
        with zipfile.ZipFile("ffmpeg.zip", "r") as z:
            for info in z.infolist():
                if info.filename.endswith("ffmpeg.exe"):
                    with z.open(info) as source, open("ffmpeg.exe", "wb") as target:
                        target.write(source.read())
                    break
        os.remove("ffmpeg.zip")
        print("✅ Đã trang bị xong Lò nén MP4 siêu tốc!")

def start_tunnel_and_report():
    """Khởi động hầm Cloudflare và báo cáo tọa độ"""
    print("\n[*] Đang dọn dẹp và mở hầm Cloudflare...")
    os.system("taskkill /f /im cloudflared.exe >nul 2>&1")
    time.sleep(1)

    # Chạy hầm Cloudflare và ghi log ra file để lấy link
    log_file = "tunnel.log"
    if os.path.exists(log_file): os.remove(log_file)
    
    cmd = f'cloudflared.exe tunnel --url http://localhost:5000'
    with open(log_file, "wb") as f:
        subprocess.Popen(cmd, stdout=f, stderr=f, shell=True)

    public_url = None
    print("[*] Đang dò tìm link Tunnel...")
    for i in range(20):
        time.sleep(1)
        if os.path.exists(log_file):
            with open(log_file, "r") as f:
                content = f.read()
                # Tìm link có đuôi trycloudflare.com
                if "trycloudflare.com" in content:
                    import re
                    match = re.search(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com", content)
                    if match:
                        public_url = match.group(0)
                        break
        sys.stdout.write(f"\r   -> Đang bắt sóng... {i+1}s")
        sys.stdout.flush()

    if public_url:
        print(f"\n✅ THÔNG HẦM CLOUDFLARE: {public_url}")
        requests.post(f"{SERVER_URL}/cctv-config", json={"ngrok_url": public_url})
        print("☁️ Đã đồng bộ tọa độ lên Đám mây!")
    else:
        print("\n❌ LỖI: Không lấy được link Cloudflare Tunnel.")

# --- LOGIC NÉN MP4 VÀ BẮN LÊN MÂY ---
@app.route('/upload-video', methods=['POST', 'OPTIONS'])
def receive_video():
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200
        
    order_id = request.form.get('order_id')
    video_file = request.files.get('video')
    
    if order_id and video_file:
        raw_path = os.path.join(TEMP_DIR, f"{order_id}_raw.webm")
        mp4_path = os.path.join(TEMP_DIR, f"{order_id}.mp4")
        video_file.save(raw_path)
        print(f"⚡ Đã nhận băng hình thô của Đơn: {order_id}")

        def process_and_upload(o_id, raw, mp4):
            try:
                print(f"[{o_id}] ⏳ Đang ép khung sang chuẩn MP4...")
                
                # Bắt quả tang bộ nén FFmpeg
                if not os.path.exists("ffmpeg.exe"):
                    print(f"[{o_id}] ❌ LỖI PC: Không tìm thấy file ffmpeg.exe trong thư mục!")
                    return
                    
                cmd = f'ffmpeg.exe -y -i "{raw}" -c:v libx264 -preset ultrafast -crf 28 -c:a aac "{mp4}"'
                subprocess.run(cmd, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                
                if not os.path.exists(mp4):
                    print(f"[{o_id}] ❌ LỖI PC: Ép khung thất bại. File MP4 không được tạo ra!")
                    return

                print(f"[{o_id}] ☁️ Đang bắn MP4 lên kho Cloudflare R2...")
                with open(mp4, 'rb') as f:
                    files = {'video': (f"{o_id}.mp4", f, 'video/mp4')}
                    data = {'order_id': o_id}
                    # Ép thời gian chờ mạng lên 60 giây để tránh đứt gánh giữa đường
                    res = requests.post(f"{SERVER_URL}/cctv/upload", data=data, files=files, timeout=60)
                    
                if res.status_code == 200:
                    print(f"[{o_id}] ✅ Gửi mây thành công! Đã tự cập nhật trạng thái PACKED.")
                    os.remove(raw) # Dọn rác file thô sau khi thành công
                else:
                    print(f"[{o_id}] ❌ LỖI MÂY (Mã {res.status_code}): {res.text}")
            except Exception as e:
                print(f"[{o_id}] ❌ LỖI NGHIÊM TRỌNG TẠI PC: {str(e)}")

        # Cho chạy luồng ngầm để iPad trả kết quả ngay, PC tự cày cuốc
        threading.Thread(target=process_and_upload, args=(order_id, raw_path, mp4_path)).start()
        
        return jsonify({"status": "ok"}), 200
    return jsonify({"error": "missing"}), 400

if __name__ == '__main__':
    setup_ffmpeg()
    setup_cloudflared()
    threading.Thread(target=start_tunnel_and_report, daemon=True).start()
    app.run(host='0.0.0.0', port=5000, threaded=True)
