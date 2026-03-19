"""
ShopHuyVan — Tự động tải báo cáo Shopee
=========================================
Cài đặt:
    pip install selenium webdriver-manager requests

Chạy:
    python shopee_download.py

Yêu cầu: Chrome đã cài sẵn trên máy
"""

import time
import os
import glob
import requests
from datetime import datetime, timedelta
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager

# ══════════════════════════════════════════════════════════════════
# CẤU HÌNH — chỉnh sửa ở đây
# ══════════════════════════════════════════════════════════════════
API_URL      = "https://huyvan-worker-api.nghiemchihuy.workers.dev"
DOWNLOAD_DIR = os.path.join(os.path.expanduser("~"), "Downloads", "shopee_reports")
HEADLESS     = False   # False = thấy trình duyệt, True = chạy ẩn

# Khoảng ngày mặc định: tháng trước
today      = datetime.today()
first_day  = datetime(today.year, today.month - 1 if today.month > 1 else 12, 1)
last_day   = datetime(today.year, today.month, 1) - timedelta(days=1)
DATE_FROM  = first_day.strftime("%Y-%m-%d")
DATE_TO    = last_day.strftime("%Y-%m-%d")

# ══════════════════════════════════════════════════════════════════

def log(msg, level="INFO"):
    colors = {"INFO": "\033[0m", "OK": "\033[92m", "WARN": "\033[93m", "ERR": "\033[91m", "STEP": "\033[94m"}
    icons  = {"INFO": "ℹ️ ", "OK": "✅", "WARN": "⚠️ ", "ERR": "❌", "STEP": "▶️ "}
    t = datetime.now().strftime("%H:%M:%S")
    print(f"{colors.get(level,'')}[{t}] {icons.get(level,'')} {msg}\033[0m")

def wait(seconds, reason=""):
    if reason: log(f"Chờ {seconds}s — {reason}", "INFO")
    for i in range(seconds, 0, -1):
        print(f"\r  ⏳ Còn {i}s...   ", end="", flush=True)
        time.sleep(1)
    print("\r  ✓ Xong!         ")

# ── Cổng Remote Debugging của Chrome đang chạy ───────────────────
CHROME_DEBUG_PORT = 9222
# Profile Shopee: Profile 2 (C:\Users\Admin\AppData\Local\Google\Chrome\User Data\Profile 2)

def setup_driver():
    log("Kết nối vào Chrome đang chạy...", "STEP")
    os.makedirs(DOWNLOAD_DIR, exist_ok=True)

    opts = Options()
    opts.add_experimental_option("debuggerAddress", f"127.0.0.1:{CHROME_DEBUG_PORT}")

    # Tự động tải về DOWNLOAD_DIR
    opts.add_experimental_option("prefs", {
        "download.default_directory": DOWNLOAD_DIR,
        "download.prompt_for_download": False,
        "plugins.always_open_pdf_externally": True,
    })

    try:
        # Thử dùng chromedriver có sẵn trong PATH trước
        driver = webdriver.Chrome(options=opts)
        log("Dùng chromedriver có sẵn trong PATH", "OK")
    except Exception:
        try:
            log("Đang tải chromedriver...", "INFO")
            service = Service(ChromeDriverManager().install())
            driver  = webdriver.Chrome(service=service, options=opts)
        except Exception as e:
            log(f"Không thể khởi động Chrome: {e}", "ERR")
            raise

    driver.implicitly_wait(5)
    log(f"Đã kết nối Chrome! Đang ở: {driver.current_url}", "OK")
    return driver

def find_element_by_text(driver, text, tag="*", timeout=15):
    """Tìm element có text chính xác"""
    try:
        elements = WebDriverWait(driver, timeout).until(
            lambda d: [e for e in d.find_elements(By.TAG_NAME, tag)
                      if e.text.strip() == text and e.is_displayed()]
        )
        return elements[0] if elements else None
    except Exception:
        return None

def find_elements_by_text(driver, text, tag="*"):
    """Tìm tất cả elements có text"""
    return [e for e in driver.find_elements(By.TAG_NAME, tag)
            if e.text.strip() == text and e.is_displayed()]

def get_downloaded_files_before():
    """Lấy danh sách file hiện tại trước khi download"""
    return set(glob.glob(os.path.join(DOWNLOAD_DIR, "*.pdf")) +
               glob.glob(os.path.join(DOWNLOAD_DIR, "*.xlsx")))

def wait_for_new_file(files_before, timeout=120):
    """Chờ file mới xuất hiện trong thư mục download"""
    log(f"Chờ file tải về trong {DOWNLOAD_DIR}...", "INFO")
    start = time.time()
    while time.time() - start < timeout:
        current = set(glob.glob(os.path.join(DOWNLOAD_DIR, "*.pdf")) +
                      glob.glob(os.path.join(DOWNLOAD_DIR, "*.xlsx")))
        new_files = current - files_before
        # Lọc bỏ file .crdownload (đang tải)
        done = [f for f in new_files if not f.endswith(".crdownload")]
        if done:
            log(f"File tải xong: {os.path.basename(done[0])}", "OK")
            return done[0]
        time.sleep(2)
    return None

def upload_to_server(filepath):
    """Upload file lên ShopHuyVan"""
    log(f"Đang upload {os.path.basename(filepath)} lên server...", "STEP")
    try:
        with open(filepath, "rb") as f:
            resp = requests.post(
                f"{API_URL}/api/upload-report",
                files={"file": (os.path.basename(filepath), f)},
                data={"platform": "shopee"},
                timeout=60
            )
        data = resp.json()
        if data.get("error"):
            log(f"Upload lỗi: {data['error']}", "ERR")
        else:
            log(f"Upload thành công! Kết quả: {data}", "OK")
        return data
    except Exception as e:
        log(f"Upload thất bại: {e}", "ERR")
        return None

# ══════════════════════════════════════════════════════════════════
# MAIN FLOW
# ══════════════════════════════════════════════════════════════════
def run():
    log("=" * 55, "INFO")
    log("ShopHuyVan — Tự động tải báo cáo Shopee", "INFO")
    log(f"Khoảng ngày: {DATE_FROM} → {DATE_TO}", "INFO")
    log(f"Lưu tại: {DOWNLOAD_DIR}", "INFO")
    log("=" * 55, "INFO")

    driver = setup_driver()
    wait_obj = WebDriverWait(driver, 30)

    try:
        # ── BƯỚC 1: Mở trang báo cáo ─────────────────────────────
        log("[1/5] Mở trang báo cáo thu nhập Shopee...", "STEP")
        driver.get("https://banhang.shopee.vn/portal/finance/income/statement")
        wait(5, "trang load")

        # Kiểm tra đã đăng nhập chưa
        if "login" in driver.current_url or "passport" in driver.current_url:
            log("Chưa đăng nhập! Vui lòng đăng nhập vào Shopee Seller...", "WARN")
            log("Script sẽ chờ 60 giây để bạn đăng nhập...", "WARN")
            wait(60, "đăng nhập")
            driver.get("https://banhang.shopee.vn/portal/finance/income/statement")
            wait(5, "trang load sau đăng nhập")

        log("[1/5] Đã vào trang báo cáo thu nhập!", "OK")

        # ── BƯỚC 2: Chờ bảng load ────────────────────────────────
        log("[2/5] Chờ bảng báo cáo xuất hiện...", "STEP")
        wait(4, "bảng render")

        # Log các báo cáo có sẵn
        download_btns = find_elements_by_text(driver, "Download", "a")
        if not download_btns:
            download_btns = find_elements_by_text(driver, "Download")
        log(f"[2/5] Tìm thấy {len(download_btns)} báo cáo có thể tải", "INFO")

        if not download_btns:
            log("[2/5] Không thấy nút Download — kiểm tra thủ công!", "ERR")
            input("Nhấn Enter để thoát...")
            return

        # ── BƯỚC 3: Click Download để trigger export ─────────────
        log("[3/5] Click Download báo cáo mới nhất...", "STEP")
        files_before = get_downloaded_files_before()
        wait(1, "trước khi click")
        download_btns[0].click()
        log("[3/5] Đã click! Shopee đang chuẩn bị file...", "OK")

        # ── BƯỚC 4: Chờ Shopee xử lý (3 phút) ───────────────────
        log("[4/5] Chờ Shopee xử lý file (3 phút)...", "STEP")
        wait(180, "Shopee xử lý")

        # ── BƯỚC 5: Mở panel "Báo cáo gần nhất" và tải ──────────
        log("[5/5] Tìm icon 3 gạch để mở panel báo cáo...", "STEP")
        wait(2, "")

        # Tìm icon 3 gạch — thường là button nhỏ góc phải
        icon_found = False
        for selector in [
            "//button[contains(@class,'report')]",
            "//div[@role='button' and contains(@class,'list')]",
            "//*[local-name()='svg' and @viewBox]/ancestor::button[1]",
        ]:
            try:
                btns = driver.find_elements(By.XPATH, selector)
                for btn in btns:
                    if btn.is_displayed():
                        btn.click()
                        icon_found = True
                        log("[5/5] Đã click icon 3 gạch!", "OK")
                        break
                if icon_found:
                    break
            except Exception:
                continue

        if not icon_found:
            # Thử tìm theo vị trí: góc trên phải màn hình
            log("[5/5] Thử tìm theo vị trí góc phải...", "WARN")
            all_btns = driver.find_elements(By.TAG_NAME, "button")
            for btn in all_btns:
                try:
                    rect = driver.execute_script(
                        "const r=arguments[0].getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}", btn)
                    if (rect['x'] > driver.execute_script("return window.innerWidth") * 0.85
                            and rect['y'] < 300
                            and 10 < rect['w'] < 60):
                        btn.click()
                        icon_found = True
                        log(f"[5/5] Đã click button tại x={rect['x']:.0f}, y={rect['y']:.0f}", "OK")
                        break
                except Exception:
                    continue

        wait(3, "panel mở")

        # Tìm nút "Tải về" trong panel
        tai_ve_btns = find_elements_by_text(driver, "Tải về")
        log(f"[5/5] Tìm thấy {len(tai_ve_btns)} nút Tải về", "INFO")

        if not tai_ve_btns:
            log("[5/5] Chưa thấy nút Tải về, chờ thêm 60s...", "WARN")
            wait(60, "Shopee tiếp tục xử lý")
            # Click lại icon 3 gạch
            if icon_found:
                driver.find_elements(By.XPATH, "//button[contains(@class,'report')]")[0].click()
            wait(3, "panel mở lại")
            tai_ve_btns = find_elements_by_text(driver, "Tải về")

        if not tai_ve_btns:
            log("[5/5] Vẫn không thấy nút Tải về! Hãy tự tải thủ công.", "ERR")
            input("Nhấn Enter để thoát...")
            return

        # Click Tải về
        log("[5/5] Click Tải về...", "STEP")
        files_before2 = get_downloaded_files_before()
        tai_ve_btns[0].click()
        wait(3, "download bắt đầu")

        # Chờ file tải xong
        new_file = wait_for_new_file(files_before2, timeout=120)

        if new_file:
            log(f"File đã tải về: {new_file}", "OK")
            # Upload lên server
            upload_to_server(new_file)
        else:
            log("Không phát hiện file mới. Kiểm tra thư mục Downloads.", "WARN")

        log("=" * 55)
        log("HOÀN THÀNH!", "OK")
        log(f"File lưu tại: {DOWNLOAD_DIR}", "OK")

    except KeyboardInterrupt:
        log("Đã dừng bởi người dùng.", "WARN")
    except Exception as e:
        log(f"Lỗi không xác định: {e}", "ERR")
        import traceback; traceback.print_exc()
    finally:
        input("\nNhấn Enter để đóng trình duyệt...")
        driver.quit()

if __name__ == "__main__":
    run()
