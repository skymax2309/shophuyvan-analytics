import hmac
import hashlib
import time
import requests

# === 1. ĐIỀN THÔNG TIN BẢO MẬT ===
PARTNER_ID = 2013730
PARTNER_KEY = "shpk66746e4845745341714d6b63656a5a6c7049524b7444486c4a686c4d4a4d"

# === 2. ĐIỀN CHÌA KHÓA & MÃ SHOP ===
ACCESS_TOKEN = "77725359524b536a7973634d58655646" 
SHOP_ID = 166563639 

# === 3. ĐIỀN MÃ ĐƠN HÀNG & MÃ VẬN ĐƠN CẦN IN ===
ORDER_SN = "2604052FTYNM12"
TRACKING_NUMBER = "SPXVN064116444934" 

# Chuẩn tem in nhiệt A6 của Shopee
DOC_TYPE = "THERMAL_AIR_WAYBILL" 

def tao_chu_ky(path, timestamp):
    base_string = f"{PARTNER_ID}{path}{timestamp}{ACCESS_TOKEN}{SHOP_ID}"
    return hmac.new(PARTNER_KEY.encode(), base_string.encode(), hashlib.sha256).hexdigest()

def get_pdf_shopee():
    headers = {"Content-Type": "application/json"}
    
    # =========================================================
    # BƯỚC 1: RA LỆNH CHO MÁY CHỦ SHOPEE "VẼ" TEM (CREATE)
    # =========================================================
    print(f"⚙️ [BƯỚC 1] Đang ra lệnh Shopee tạo tem nhiệt (A6) cho đơn {ORDER_SN}...")
    path_create = "/api/v2/logistics/create_shipping_document"
    ts_create = int(time.time())
    sign_create = tao_chu_ky(path_create, ts_create)
    url_create = f"https://partner.shopeemobile.com{path_create}?partner_id={PARTNER_ID}&timestamp={ts_create}&access_token={ACCESS_TOKEN}&shop_id={SHOP_ID}&sign={sign_create}"
    
    # 🌟 BỌC THÉP PAYLOAD: Đã gỡ bỏ package_number để Shopee không bị "ảo giác"
    payload_create = {
        "order_list": [
            {
                "order_sn": ORDER_SN,
                "tracking_number": TRACKING_NUMBER
            }
        ],
        "shipping_document_type": DOC_TYPE
    }
    
    res_create = requests.post(url_create, json=payload_create, headers=headers).json()
    if res_create.get("error"):
        print(f"❌ Lỗi Bước 1: {res_create}")
        return

    print("   ✅ Đã phát lệnh tạo tem thành công!")
    print("   ⏳ Đang cho máy chủ Shopee 2 giây để render hình ảnh mã vạch...")
    time.sleep(2) 

    # =========================================================
    # BƯỚC 2: TIẾN HÀNH TẢI FILE PDF VỀ MÁY (DOWNLOAD)
    # =========================================================
    print(f"\n🚀 [BƯỚC 2] Đang kéo file PDF về máy tính...")
    path_dl = "/api/v2/logistics/download_shipping_document"
    ts_dl = int(time.time())
    sign_dl = tao_chu_ky(path_dl, ts_dl)
    url_dl = f"https://partner.shopeemobile.com{path_dl}?partner_id={PARTNER_ID}&timestamp={ts_dl}&access_token={ACCESS_TOKEN}&shop_id={SHOP_ID}&sign={sign_dl}"
    
    payload_dl = {
        "shipping_document_type": DOC_TYPE,
        "order_list": [
            {
                "order_sn": ORDER_SN,
                "tracking_number": TRACKING_NUMBER
            }
        ]
    }
    
    res_dl = requests.post(url_dl, json=payload_dl, headers=headers)
    
    if res_dl.headers.get("Content-Type") == "application/pdf":
        file_name = f"Tem_API_{ORDER_SN}.pdf"
        with open(file_name, "wb") as f:
            f.write(res_dl.content)
        print("="*50)
        print(f"🎉 THÀNH CÔNG RỰC RỠ! Đã vác file PDF về máy với tên: {file_name}")
        print("👉 Hãy mở file lên, bạn sẽ thấy nó phẳng lì, tràn viền A6 và không hề có thanh cuộn!")
        print("="*50)
    else:
        print("❌ Lỗi Bước 2: Không lấy được PDF. Lỗi:")
        print(res_dl.text)

if __name__ == "__main__":
    get_pdf_shopee()
