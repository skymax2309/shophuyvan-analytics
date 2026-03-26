import os
import json
import urllib.request
import urllib.parse

try:
    import pdfplumber
    HAS_PDFPLUMBER = True
except ImportError:
    HAS_PDFPLUMBER = False

from config import UPLOAD_URL, R2_TOKEN, AUTO_IMPORT_TRIGGER_URL

def log_to_widget(widget, message):
    """Hàm ghi log vào giao diện (Textbox)"""
    if widget:
        widget.insert("end", f"[*] {message}\n")
        widget.see("end")

def extract_pdf_text(local_path):
    """Trích xuất văn bản từ file PDF"""
    if not HAS_PDFPLUMBER:
        return ""
    try:
        text_parts = []
        with pdfplumber.open(local_path) as pdf:
            for page in pdf.pages:
                t = page.extract_text()
                if t: text_parts.append(t)
        return "\n".join(text_parts)
    except Exception as e:
        print(f"⚠️ Lỗi PDF: {e}")
        return ""

def upload_to_r2(local_path, remote_name):
    """Tải file lên Cloud R2"""
    try:
        with open(local_path, 'rb') as f:
            file_data = f.read()
        ext = remote_name.split('.')[-1].lower()
        content_type = 'application/pdf' if ext == 'pdf' else 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        req_url = f"{UPLOAD_URL}?file={urllib.parse.quote(remote_name)}&token={R2_TOKEN}"
        headers = {'Content-Type': content_type, 'User-Agent': 'HuyVanBot/2.0'}
        req = urllib.request.Request(req_url, data=file_data, headers=headers, method='PUT')
        with urllib.request.urlopen(req) as res:
            return res.status == 200
    except Exception as e:
        print(f"⚠️ Lỗi Upload R2: {e}")
        return False
        
def trigger_server_import(self, file_key, shop_name, platform, report_type, local_path=None):
    """Kích hoạt Server tự động xử lý file sau khi đã lên R2"""
    try:
        url = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/auto-import-trigger"

        # Extract PDF text trên máy local để gửi kèm
        pdf_text = ""
        if local_path and local_path.endswith(".pdf"):
            pdf_text = self.extract_pdf_text(local_path)
            if pdf_text:
                self.log(f"📄 Đã extract PDF text: {len(pdf_text)} ký tự")

        payload = {
            "file_key":    file_key,
            "shop":        shop_name,
            "platform":    platform,
            "report_type": report_type,
            "pdf_text":    pdf_text,
        }
        # Nếu có parsed_json truyền vào thì gửi kèm
        if hasattr(self, '_pending_parsed_json') and self._pending_parsed_json:
            payload["parsed_json"] = self._pending_parsed_json
            self._pending_parsed_json = None
        data = json.dumps(payload).encode('utf-8')
        
        headers = {'Content-Type': 'application/json', 'User-Agent': 'HuyVanBot/2.0'}
        req = urllib.request.Request(url, data=data, headers=headers, method='POST')
        with urllib.request.urlopen(req) as res:
            if res.status == 200:
                self.log(f"⚡ [Auto-Import] Đã báo Server xử lý {report_type} cho Shop: {shop_name}")
    except Exception as e:
        self.log(f"⚠️ Lỗi kích hoạt Import: {str(e)}")

def upload_to_r2(self, local_path, remote_name):
    try:
        api_upload = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/upload"
        
        with open(local_path, 'rb') as f:
            file_data = f.read()

        # Xác định Content-Type
        ext = remote_name.split('.')[-1].lower()
        content_type = 'application/pdf' if ext == 'pdf' else 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

        req_url = f"{api_upload}?file={urllib.parse.quote(remote_name)}&token=huyvan_secret_2026"
        headers = {
            'Content-Type': content_type,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'
        }
        req = urllib.request.Request(req_url, data=file_data, headers=headers, method='PUT')
        with urllib.request.urlopen(req) as res:
            if res.status == 200:
                self.log(f"☁️ Đã đồng bộ lên Cloud R2: {remote_name}")
                return True
    except Exception as e:
        self.log(f"⚠️ Lỗi Upload R2: {str(e)}")
    return False