import requests
import pandas as pd
import os
import shutil
import tempfile
import base64
from io import BytesIO
from datetime import datetime
from openpyxl import Workbook
from openpyxl.drawing.image import Image as ExcelImage
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Image as PDFImage, Paragraph
from reportlab.lib.pagesizes import landscape, A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# ==========================================
# CẤU HÌNH HỆ THỐNG
# ==========================================
API_URL = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/purchase"

TEMP_IMAGE_DIR = tempfile.mkdtemp(prefix='huyvan_img_')

def download_image_to_file(url, product_id):
    if not url: return None
    try:
        if url.startswith('data:image'):
            header, base64_str = url.split(',', 1)
            ext = '.jpg'
            if 'png' in header: ext = '.png'
            elif 'gif' in header: ext = '.gif'
            
            image_path = os.path.join(TEMP_IMAGE_DIR, f"p_{product_id}{ext}")
            with open(image_path, 'wb') as f:
                f.write(base64.b64decode(base64_str))
            return image_path
            
        elif url.startswith('http'):
            response = requests.get(url, stream=True, timeout=10)
            if response.status_code == 200:
                content_type = response.headers.get('content-type', '')
                ext = '.jpg'
                if 'png' in content_type: ext = '.png'
                elif 'gif' in content_type: ext = '.gif'
                
                image_path = os.path.join(TEMP_IMAGE_DIR, f"p_{product_id}{ext}")
                with open(image_path, 'wb') as f:
                    shutil.copyfileobj(response.raw, f)
                return image_path
    except Exception as e:
        print(f"❌ Lỗi xử lý ảnh SP {product_id}: {e}")
    return None

def fetch_and_process_data():
    print("⏳ Đang tải dữ liệu từ máy chủ...")
    try:
        response = requests.get(API_URL)
        response.raise_for_status()
        data = response.json()
        if not data:
            print("❌ Không có dữ liệu để xuất!")
            return None
        print(f"✅ Đã tải thành công {len(data)} sản phẩm. Bắt đầu kết xuất...")
        return data
    except Exception as e:
        print(f"❌ Có lỗi khi tải dữ liệu: {e}")
        return None

# ==========================================
# 1. LOGIC XUẤT EXCEL CÓ HÌNH ẢNH & THÊM CỘT
# ==========================================
def export_purchase_to_excel(raw_data):
    today_str = datetime.now().strftime('%Y-%m-%d_%H%M%S')
    filename = f"HuyVan_Export_{today_str}.xlsx"
    print(f"⏳ Đang tạo file Excel: {filename}")

    wb = Workbook()
    ws = wb.active
    ws.title = "Hàng Nhập Chính Ngạch"

    # Cập nhật thêm 3 cột Kích thước & Trọng lượng
    headers = ["Hình ảnh", "Mã Vận Đơn", "Tên SP", "SKU", "SL Nhập", "Giá Khai ($)", "KT SP (mm)", "KT Kiện (cm)", "Trọng Lượng (KG)", "Công Dụng", "Chất Liệu", "Số Kiện", "Link SP"]
    ws.append(headers)
    ws.column_dimensions['A'].width = 15
    ws.column_dimensions['C'].width = 35
    ws.column_dimensions['G'].width = 15
    ws.column_dimensions['H'].width = 15
    ws.column_dimensions['M'].width = 25

    for row_idx, item in enumerate(raw_data, start=2):
        sl_nhap = item.get('sl_nhap') or 0
        sl_sp_tren_kien = item.get('sl_sp_tren_kien') or 1
        so_kien = round(sl_nhap / sl_sp_tren_kien, 2)
        
        # Gom kích thước thành chuỗi "D x R x C"
        kt_sp = f"{item.get('kich_thuoc_sp_d') or 0}x{item.get('kich_thuoc_sp_r') or 0}x{item.get('kich_thuoc_sp_c') or 0}"
        kt_kien = f"{item.get('kich_thuoc_d') or 0}x{item.get('kich_thuoc_r') or 0}x{item.get('kich_thuoc_c') or 0}"
        
        image_url = item.get('image_url')
        product_id = item.get('id', row_idx)
        local_image_path = download_image_to_file(image_url, product_id)
        
        row_data = [
            None,
            item.get('ma_van_don', ''),
            item.get('ten_san_pham', ''),
            item.get('ma_hang', ''),
            sl_nhap,
            item.get('gia_khai_thue', 0),
            kt_sp,
            kt_kien,
            item.get('trong_luong_kg', 0),
            item.get('cong_dung', ''),
            item.get('chat_lieu', ''),
            so_kien,
            item.get('link_nhap_hang', '')
        ]
        ws.append(row_data)
        
        if local_image_path:
            try:
                img = ExcelImage(local_image_path)
                img.width = 90 
                img.height = 90 
                ws.row_dimensions[row_idx].height = 70 
                ws.add_image(img, f"A{row_idx}") 
            except Exception:
                ws[f"A{row_idx}"].value = "Lỗi ảnh"

    wb.save(filename)
    print(f"🎉 Xuất file Excel thành công! Lưu tại: {filename}")

# ==========================================
# 2. LOGIC XUẤT PDF CÓ HÌNH ẢNH & TIẾNG VIỆT
# ==========================================
def export_purchase_to_pdf(raw_data):
    today_str = datetime.now().strftime('%Y-%m-%d_%H%M%S')
    filename = f"HuyVan_Export_{today_str}.pdf"
    print(f"⏳ Đang tạo file PDF: {filename}")
    
    font_path = "C:\\Windows\\Fonts\\arial.ttf"
    try:
        pdfmetrics.registerFont(TTFont('Arial_VN', font_path))
        pdf_font = 'Arial_VN'
    except Exception:
        print("⚠️ Không tìm thấy Font Arial trên máy, PDF có thể bị lỗi chữ tiếng Việt.")
        pdf_font = 'Helvetica'
    
    doc = SimpleDocTemplate(filename, pagesize=landscape(A4), topMargin=10, bottomMargin=10, leftMargin=10, rightMargin=10)
    story = []
    
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('Title', fontName=pdf_font, fontSize=16, leading=20, spaceAfter=10, textColor=colors.teal, alignment=1)
    cell_style = ParagraphStyle('CellStyle', fontName=pdf_font, fontSize=7, leading=9, wordWrap='CJK')
    
    story.append(Paragraph("DANH SÁCH HÀNG NHẬP CHÍNH NGẠCH - HUY VÂN", title_style))
    
    # Cập nhật thêm 3 cột vào PDF
    header = [
        "Hình ảnh", "MVĐ", "Tên Sản Phẩm", "SKU", "SL", "Giá($)", "KT SP(mm)", "KT Kiện(cm)", "TL(kg)", "Công Dụng", "Chất Liệu", "Kiện", "Link"
    ]
    header_formatted = [Paragraph(f"<b>{h}</b>", cell_style) for h in header]
    
    table_data = [header_formatted]
    for item in raw_data:
        sl_nhap = item.get('sl_nhap') or 0
        sl_sp_tren_kien = item.get('sl_sp_tren_kien') or 1
        so_kien = str(round(sl_nhap / sl_sp_tren_kien, 2))
        
        kt_sp = f"{item.get('kich_thuoc_sp_d') or 0}x{item.get('kich_thuoc_sp_r') or 0}x{item.get('kich_thuoc_sp_c') or 0}"
        kt_kien = f"{item.get('kich_thuoc_d') or 0}x{item.get('kich_thuoc_r') or 0}x{item.get('kich_thuoc_c') or 0}"
        trong_luong = str(item.get('trong_luong_kg', 0))

        image_url = item.get('image_url')
        product_id = item.get('id', sl_nhap)
        local_image_path = download_image_to_file(image_url, product_id)
        
        if local_image_path:
            try:
                img = PDFImage(local_image_path, width=35, height=35)
            except Exception:
                img = "Lỗi ảnh"
        else:
            img = ""
            
        row = [
            img,
            Paragraph(str(item.get('ma_van_don', '')), cell_style),
            Paragraph(str(item.get('ten_san_pham', '')), cell_style),
            Paragraph(str(item.get('ma_hang', '')), cell_style),
            str(sl_nhap),
            str(item.get('gia_khai_thue', 0)),
            Paragraph(kt_sp, cell_style),
            Paragraph(kt_kien, cell_style),
            Paragraph(trong_luong, cell_style),
            Paragraph(str(item.get('cong_dung', '')), cell_style),
            Paragraph(str(item.get('chat_lieu', '')), cell_style),
            so_kien,
            Paragraph(str(item.get('link_nhap_hang', '')), cell_style)
        ]
        table_data.append(row)
        
    # Cân đối lại độ rộng 13 cột sao cho vừa vặn tờ giấy A4 nằm ngang
    col_widths = [40, 50, 140, 40, 25, 35, 55, 55, 35, 75, 70, 25, 95]
    table = Table(table_data, colWidths=col_widths)
    
    style = TableStyle([
        ('FONTNAME', (0,0), (-1,-1), pdf_font),
        ('BACKGROUND', (0,0), (-1,0), colors.teal),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('ALIGN', (2,1), (2,-1), 'LEFT'), 
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.grey),
        ('BOX', (0,0), (-1,-1), 1, colors.black),
        ('ROWHEIGHT', (0,1), (-1,-1), 45), 
    ])
    table.setStyle(style)
    
    story.append(table)
    doc.build(story)
    print(f"🎉 Xuất file PDF thành công! Lưu tại: {filename}")

# ==========================================
# 3. MENU CHÍNH
# ==========================================
def main_menu():
    print("\n" + "="*50)
    print("💎 HỆ THỐNG XUẤT BÁO CÁO MUA HÀNG HUY VÂN 💎")
    print("="*50)
    
    raw_data = fetch_and_process_data()
    if not raw_data: return

    while True:
        print("\nChọn định dạng file bạn muốn xuất:")
        print("1️⃣. Xuất file EXCEL CÓ HÌNH ẢNH")
        print("2️⃣. Xuất file PDF CÓ HÌNH ẢNH & TIẾNG VIỆT CÓ DẤU")
        print("3️⃣. Thoát chương trình")
        
        choice = input("👉 Nhập lựa chọn của bạn (1, 2, 3): ").strip()
        
        if choice == '1':
            export_purchase_to_excel(raw_data)
        elif choice == '2':
            export_purchase_to_pdf(raw_data)
        elif choice == '3':
            print("Chương trình kết thúc. Tạm biệt Huy!")
            if os.path.exists(TEMP_IMAGE_DIR):
                shutil.rmtree(TEMP_IMAGE_DIR)
            break
        else:
            print("❌ Lựa chọn không hợp lệ, vui lòng nhập lại.")

if __name__ == "__main__":
    main_menu()
