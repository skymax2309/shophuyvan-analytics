import urllib.parse

# === 1. THÔNG TIN APP LAZADA TỪ ẢNH CHỤP ===
APP_KEY = "135731" 
REDIRECT_URI = "https://google.com"

def generate_lazada_auth_url():
    # Thuật toán tạo link của Lazada siêu đơn giản, chỉ cần ghép chuỗi
    url = f"https://auth.lazada.com/oauth/authorize?response_type=code&force_auth=true&redirect_uri={urllib.parse.quote(REDIRECT_URI)}&client_id={APP_KEY}"
    
    print("\n" + "="*60)
    print("🚀 LINK ỦY QUYỀN LAZADA CỦA BẠN ĐÂY:")
    print("="*60)
    print(url)
    print("="*60)

if __name__ == "__main__":
    generate_lazada_auth_url()
