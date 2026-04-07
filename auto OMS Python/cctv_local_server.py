import os
import sys
import time
import threading
import subprocess
import urllib.request
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS

# --- CẤU HÌNH ---
SERVER_URL = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api"
TEMP_DIR = "temp_videos"
os.makedirs(TEMP_DIR, exist_ok=True)

app = Flask(__name__)
CORS(app)

def setup_cloudflared():
    """Tự động tải Cloudflare Tunnel nếu thiếu"""
    if not os.path.exists("cloudflared.exe"):
        print("[*] Đang tải Cloudflare Tunnel (Siêu nhẹ, không cần Token)...")
        url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
        urllib.request.urlretrieve(url, "cloudflared.exe")
        print("✅ Đã chuẩn bị xong vũ khí Cloudflare.")

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

# --- GIỮ NGUYÊN LOGIC XỬ LÝ VIDEO ---
@app.route('/upload-video', methods=['POST'])
def receive_video():
    order_id = request.form.get('order_id')
    video_file = request.files.get('video')
    if order_id and video_file:
        path = os.path.join(TEMP_DIR, f"{order_id}_raw.webm")
        video_file.save(path)
        print(f"⚡ Nhận video đơn: {order_id}")
        # (Thêm logic nén/up như cũ tại đây)
        return jsonify({"status": "ok"}), 200
    return jsonify({"error": "missing"}), 400

if __name__ == '__main__':
    setup_cloudflared()
    threading.Thread(target=start_tunnel_and_report, daemon=True).start()
    app.run(host='0.0.0.0', port=5000, threaded=True)
