import customtkinter as ctk
import tkinter as tk
from tkinter import filedialog, messagebox
import pandas as pd
import threading
import os
import datetime

# Cấu hình giao diện cơ bản
ctk.set_appearance_mode("Dark")
ctk.set_default_color_theme("blue")

class AIHelperTool(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("🤖 AI Automation Helper Tool - Kỹ Sư Hệ Thống")
        self.geometry("950x750")
        
        # Biến lưu trữ
        self.current_df = None
        self.current_file_path = ""
        self.is_recording = False
        self.recorded_actions = []

        self._build_ui()

    def _build_ui(self):
        self.tabview = ctk.CTkTabview(self, width=900, height=700)
        self.tabview.pack(padx=20, pady=20, fill="both", expand=True)

        self.tab_web = self.tabview.add("🌐 Web Scanner")
        self.tab_excel_col = self.tabview.add("📊 Excel Column")
        self.tab_excel_agg = self.tabview.add("📈 Excel Thống Kê")
        self.tab_recorder = self.tabview.add("🔴 Action Recorder (MỚI)") # Bổ sung Tab mới

        self._build_web_tab()
        self._build_excel_col_tab()
        self._build_excel_agg_tab()
        self._build_recorder_tab()

    # ==========================================
    # TAB 1: WEB ELEMENT SCANNER
    # ==========================================
    def _build_web_tab(self):
        ctk.CTkLabel(self.tab_web, text="Trích xuất cấu trúc Website tĩnh cho AI", font=("Segoe UI", 16, "bold"), text_color="#00FF88").pack(pady=10)
        
        frame_input = ctk.CTkFrame(self.tab_web, fg_color="transparent")
        frame_input.pack(fill="x", padx=20, pady=5)
        
        ctk.CTkLabel(frame_input, text="URL:").pack(side="left", padx=5)
        self.url_entry = ctk.CTkEntry(frame_input, width=500, placeholder_text="https://shopee.vn/...")
        self.url_entry.pack(side="left", padx=5)
        
        self.btn_scan = ctk.CTkButton(frame_input, text="🚀 Quét Nhanh", command=self.run_web_scanner, fg_color="#ea580c")
        self.btn_scan.pack(side="left", padx=10)

        self.web_log = ctk.CTkTextbox(self.tab_web, font=("Consolas", 12), fg_color="#1A1A1A", text_color="#00CED1")
        self.web_log.pack(fill="both", expand=True, padx=20, pady=10)

    def run_web_scanner(self):
        url = self.url_entry.get().strip()
        if not url: return messagebox.showwarning("Cảnh báo", "Nhập URL!")
        self.btn_scan.configure(state="disabled", text="⏳ Đang quét...")
        self.web_log.delete("1.0", "end")
        
        def _scan_thread():
            try:
                from playwright.sync_api import sync_playwright
                with sync_playwright() as p:
                    browser = p.chromium.launch(headless=True)
                    page = browser.new_page()
                    page.goto(url, timeout=60000, wait_until="domcontentloaded")
                    page.wait_for_timeout(3000)
                    elements = page.evaluate("""() => {
                        let results = [];
                        document.querySelectorAll('button, a').forEach(el => {
                            if(el.innerText || el.className) results.push({tag: el.tagName, text: el.innerText.trim(), class: el.className, id: el.id});
                        });
                        document.querySelectorAll('input').forEach(el => {
                            results.push({tag: 'INPUT', type: el.type, placeholder: el.placeholder, class: el.className, id: el.id});
                        });
                        return results;
                    }""")
                    browser.close()
                    log_text = f"🎯 TÌM THẤY {len(elements)} PHẦN TỬ:\n" + "="*40 + "\n"
                    for el in elements: log_text += f"[{el.get('tag')}] Text: '{el.get('text', '')[:30]}' | Class: '{el.get('class', '')}' | ID: '{el.get('id', '')}'\n"
                    self.web_log.insert("end", log_text)
            except Exception as e: self.web_log.insert("end", f"❌ Lỗi: {e}")
            finally: self.btn_scan.configure(state="normal", text="🚀 Quét Nhanh")
        threading.Thread(target=_scan_thread, daemon=True).start()

    # ==========================================
    # TAB 2 & 3: EXCEL (Giữ nguyên thuật toán bóc thép)
    # ==========================================
    def _build_excel_col_tab(self):
        ctk.CTkLabel(self.tab_excel_col, text="Soi tên cột ẩn file Excel", font=("Segoe UI", 16, "bold"), text_color="#FFD700").pack(pady=10)
        self.btn_import_col = ctk.CTkButton(self.tab_excel_col, text="📂 Import File", command=lambda: self.import_excel(self.inspect_columns), fg_color="#10b981")
        self.btn_import_col.pack(pady=10)
        self.col_log = ctk.CTkTextbox(self.tab_excel_col, font=("Consolas", 13), fg_color="#1A1A1A", text_color="white")
        self.col_log.pack(fill="both", expand=True, padx=20, pady=10)

    def _build_excel_agg_tab(self):
        ctk.CTkLabel(self.tab_excel_agg, text="Thống kê dữ liệu", font=("Segoe UI", 16, "bold"), text_color="#3b82f6").pack(pady=10)
        frame_controls = ctk.CTkFrame(self.tab_excel_agg, fg_color="transparent")
        frame_controls.pack(fill="x", padx=20, pady=5)
        ctk.CTkButton(frame_controls, text="📂 Import", command=lambda: self.import_excel(self._update_agg_dropdown), fg_color="#10b981", width=80).grid(row=0, column=0, padx=5)
        self.combo_group = ctk.CTkComboBox(frame_controls, values=["-- Chờ Import --"], width=150)
        self.combo_group.grid(row=0, column=1, padx=5)
        self.combo_sum = ctk.CTkComboBox(frame_controls, values=["Không tính tổng"], width=150)
        self.combo_sum.grid(row=0, column=2, padx=5)
        ctk.CTkButton(frame_controls, text="⚡ Tính", command=self.run_aggregation, fg_color="#3b82f6", width=80).grid(row=0, column=3, padx=5)
        self.agg_log = ctk.CTkTextbox(self.tab_excel_agg, font=("Consolas", 13), fg_color="#1A1A1A", text_color="#FCA5A5")
        self.agg_log.pack(fill="both", expand=True, padx=20, pady=10)

    def import_excel(self, callback):
        file_path = filedialog.askopenfilename(filetypes=[("Excel", "*.xlsx *.xls *.csv")])
        if not file_path: return
        self.current_file_path = file_path
        try:
            if file_path.endswith('.csv'): self.current_df = pd.read_csv(file_path, dtype=str)
            else:
                try: self.current_df = pd.read_excel(file_path, dtype=str, engine='calamine')
                except: self.current_df = pd.read_excel(file_path, dtype=str)
            header_idx = 0
            for i in range(min(15, len(self.current_df))):
                if any(kw in " ".join([str(x).lower() for x in self.current_df.iloc[i].values]) for kw in ["sku", "mã", "đơn"]):
                    header_idx = i + 1; break
            if header_idx > 0:
                if file_path.endswith('.csv'): self.current_df = pd.read_csv(file_path, dtype=str, skiprows=header_idx)
                else:
                    try: self.current_df = pd.read_excel(file_path, dtype=str, header=header_idx, engine='calamine')
                    except: self.current_df = pd.read_excel(file_path, dtype=str, header=header_idx)
            callback()
        except Exception as e: messagebox.showerror("Lỗi", str(e))

    def inspect_columns(self):
        self.col_log.delete("1.0", "end")
        self.col_log.insert("end", f"🎯 DANH SÁCH CỘT:\n" + "="*40 + "\n")
        for idx, col in enumerate(self.current_df.columns): self.col_log.insert("end", f"[{idx:02d}] '{col}'\n")
        self._update_agg_dropdown()

    def _update_agg_dropdown(self):
        if self.current_df is not None:
            cols = list(self.current_df.columns)
            self.combo_group.configure(values=cols)
            if cols: self.combo_group.set(cols[0])
            self.combo_sum.configure(values=["Không tính tổng"] + cols)
            self.combo_sum.set("Không tính tổng")

    def run_aggregation(self):
        if self.current_df is None: return
        col_group, col_sum = self.combo_group.get(), self.combo_sum.get()
        self.agg_log.delete("1.0", "end")
        try:
            counts = self.current_df[col_group].value_counts()
            for key, count in counts.items():
                if pd.isna(key): key = "Trống"
                res = f"🔸 {key}: {count} dòng"
                if col_sum != "Không tính tổng":
                    subset = self.current_df[self.current_df[col_group] == key]
                    tong = pd.to_numeric(subset[col_sum].astype(str).str.replace(',', ''), errors='coerce').sum()
                    res += f" | Tổng tiền: {tong:,.0f}"
                self.agg_log.insert("end", res + "\n")
        except Exception as e: self.agg_log.insert("end", f"❌ Lỗi: {str(e)}")

   # ==========================================
    # TAB 4: ACTION RECORDER (GHI LẠI THAO TÁC) - NÂNG CẤP LOGIN
    # ==========================================
    # ==========================================
    # TAB 4: ACTION RECORDER (GHI LẠI THAO TÁC) - NÂNG CẤP LOGIN
    # ==========================================
    
    # Thêm hàm chuẩn hóa tên để cả hệ thống hiển thị và tìm kiếm khớp nhau 100%
    def _format_shop_name(self, shop):
        nen_tang = shop.get('nen_tang') or shop.get('platform') or 'N/A'
        ten_shop = shop.get('ten_shop') or shop.get('name') or 'Unnamed'
        return f"[{str(nen_tang).upper()}] {ten_shop}"

    def _load_shops_from_json(self):
        try:
            import json
            import os
            base_dir = os.path.dirname(os.path.abspath(__file__))
            json_path = os.path.join(base_dir, 'data', 'shops.json')
            
            if os.path.exists(json_path):
                with open(json_path, 'r', encoding='utf-8') as f:
                    self.shops_data = json.load(f)
                    # Dùng hàm chuẩn hóa để hiển thị
                    return [self._format_shop_name(s) for s in self.shops_data]
            return []
        except Exception as e:
            print(f"Lỗi đọc shops.json: {e}")
            return []

    def _build_recorder_tab(self):
        ctk.CTkLabel(self.tab_recorder, text="Ghi hình thao tác & Lấy Class tự động cho AI", font=("Segoe UI", 16, "bold"), text_color="#f43f5e").pack(pady=10)
        
        frame_controls = ctk.CTkFrame(self.tab_recorder, fg_color="transparent")
        frame_controls.pack(fill="x", padx=10, pady=5)
        
        self.shop_list = self._load_shops_from_json()
        ctk.CTkLabel(frame_controls, text="Chọn Shop:").pack(side="left", padx=5)
        self.combo_shop = ctk.CTkComboBox(frame_controls, values=self.shop_list if self.shop_list else ["-- Không tìm thấy data/shops.json --"], width=220)
        self.combo_shop.pack(side="left", padx=5)

        ctk.CTkLabel(frame_controls, text="URL:").pack(side="left", padx=5)
        self.rec_url_entry = ctk.CTkEntry(frame_controls, width=250, placeholder_text="https://seller.tiktok.com/...")
        self.rec_url_entry.insert(0, "https://seller-vn.tiktok.com/")
        self.rec_url_entry.pack(side="left", padx=5)
        
        self.btn_start_rec = ctk.CTkButton(frame_controls, text="🔴 Bắt đầu Ghi", command=self.start_recording, fg_color="#ef4444", hover_color="#dc2626", width=100)
        self.btn_start_rec.pack(side="left", padx=5)

        self.btn_stop_rec = ctk.CTkButton(frame_controls, text="⏹️ Dừng & Lưu", command=self.stop_recording, fg_color="#64748b", state="disabled", width=100)
        self.btn_stop_rec.pack(side="left", padx=5)

        ctk.CTkLabel(self.tab_recorder, text="👇 Lịch sử thao tác của bạn sẽ hiện ở đây 👇", font=("Segoe UI", 11)).pack(pady=5)
        self.recorder_log = ctk.CTkTextbox(self.tab_recorder, font=("Consolas", 12), fg_color="#1A1A1A", text_color="#E2E8F0")
        self.recorder_log.pack(fill="both", expand=True, padx=20, pady=10)

    def start_recording(self):
        url = self.rec_url_entry.get().strip()
        selected_shop_str = self.combo_shop.get()
        
        if not url: return messagebox.showwarning("Cảnh báo", "Vui lòng nhập Link khởi đầu!")
        if "-- Không tìm" in selected_shop_str: return messagebox.showwarning("Cảnh báo", "Vui lòng cấu hình file data/shops.json trước!")

        # Trích xuất thông tin shop được chọn dựa trên hàm chuẩn hóa chung
        selected_shop = None
        for shop in getattr(self, 'shops_data', []):
            if self._format_shop_name(shop) == selected_shop_str:
                selected_shop = shop
                break

        if not selected_shop: return messagebox.showwarning("Lỗi", "Không tìm thấy dữ liệu shop hợp lệ!")

        self.is_recording = True
        self.recorded_actions = []
        self.btn_start_rec.configure(state="disabled", text="⏳ Đang theo dõi...")
        self.btn_stop_rec.configure(state="normal", fg_color="#3b82f6")
        self.recorder_log.delete("1.0", "end")
        self.recorder_log.insert("end", f"[*] Đang móc nối vào Profile của shop: {selected_shop.get('ten_shop') or selected_shop.get('name')}\n")
        self.recorder_log.insert("end", "[*] Hệ thống đang lắng nghe cú click và gõ phím của bạn...\n" + "="*60 + "\n")

        threading.Thread(target=self._recording_thread, args=(url, selected_shop), daemon=True).start()

    def _recording_thread(self, start_url, shop_data):
        from playwright.sync_api import sync_playwright
        import os
        try:
            with sync_playwright() as p:
                # Cấu hình đường dẫn tới Profile của hệ thống chính
                base_dir = os.path.dirname(os.path.abspath(__file__))
                
                # Ưu tiên lấy đường dẫn profile trong file json, nếu không có thì mặc định dùng thư mục profiles/ten_shop
                if 'thu_muc_profile' in shop_data and shop_data['thu_muc_profile']:
                    profile_path = shop_data['thu_muc_profile']
                else:
                    profile_path = os.path.join(base_dir, 'profiles', shop_data.get('ten_shop', 'default').replace('/', '_'))

                # Dùng launch_persistent_context để TÁI SỬ DỤNG phiên đăng nhập
                context = p.chromium.launch_persistent_context(
                    user_data_dir=profile_path,
                    headless=False,
                    viewport={"width": 1280, "height": 720},
                    args=["--disable-blink-features=AutomationControlled"]
                )
                
                # Persistent context luôn tự động tạo 1 trang đầu tiên
                page = context.pages[0] if context.pages else context.new_page()

                def handle_action(action_type, css_selector, xpath, text_val, current_url):
                    time_str = datetime.datetime.now().strftime("%H:%M:%S")
                    text_display = text_val.replace('\n', ' ')[:50]
                    log_line = f"[{time_str}] {action_type} | Text/Value: '{text_display}'\n   📍 CSS: {css_selector}\n   📍 XPath: {xpath}\n   🌐 URL: {current_url}\n{'-'*60}\n"
                    self.recorded_actions.append(log_line)
                    self.after(0, lambda: self.recorder_log.insert("end", log_line))
                    self.after(0, lambda: self.recorder_log.see("end"))

                context.expose_function("py_log_action", handle_action)

                js_tracker = """
                    window.generateXPath = function(el) {
                        if (el.id !== '') return `id("${el.id}")`;
                        if (el === document.body) return el.tagName;
                        let ix = 0;
                        let siblings = el.parentNode ? el.parentNode.childNodes : [];
                        for (let i = 0; i < siblings.length; i++) {
                            let sibling = siblings[i];
                            if (sibling === el) return window.generateXPath(el.parentNode) + '/' + el.tagName.toLowerCase() + '[' + (ix + 1) + ']';
                            if (sibling.nodeType === 1 && sibling.tagName === el.tagName) ix++;
                        }
                        return '';
                    };
                    
                    document.addEventListener('click', e => {
                        let el = e.target;
                        let tag = el.tagName.toLowerCase();
                        let id = el.id ? '#' + el.id : '';
                        let cls = el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).join('.') : '';
                        let text = el.innerText || '';
                        let css = `${tag}${id}${cls}`;
                        let xpath = window.generateXPath(el);
                        window.py_log_action("👆 CLICK", css, xpath, text, window.location.href);
                    }, true);

                    document.addEventListener('change', e => {
                        let el = e.target;
                        let tag = el.tagName.toLowerCase();
                        let css = tag + (el.id ? '#' + el.id : '');
                        let xpath = window.generateXPath(el);
                        window.py_log_action("⌨️ NHẬP LIỆU", css, xpath, el.value, window.location.href);
                    }, true);
                """
                context.add_init_script(js_tracker)

                page.goto(start_url)

                while self.is_recording:
                    page.wait_for_timeout(1000)

                context.close()
        except Exception as e:
            self.after(0, lambda: self.recorder_log.insert("end", f"\n❌ Lỗi Trình duyệt: {e}\n(Nếu lỗi 'Target closed', bạn cứ bấm Dừng & Lưu nhé)\n"))

    def stop_recording(self):
        self.is_recording = False
        self.btn_start_rec.configure(state="normal", text="🔴 Bắt đầu Ghi")
        self.btn_stop_rec.configure(state="disabled", fg_color="#64748b")
        
        if not self.recorded_actions:
            messagebox.showinfo("Thông báo", "Chưa có thao tác nào được ghi lại!")
            return

        save_path = filedialog.asksaveasfilename(
            defaultextension=".txt",
            initialfile=f"Auto_Log_{datetime.datetime.now().strftime('%Y%m%d_%H%M')}.txt",
            filetypes=[("Text files", "*.txt")]
        )
        
        if save_path:
            try:
                with open(save_path, "w", encoding="utf-8") as f:
                    f.write("=== LOG THAO TÁC CHO AI ===\n\n")
                    f.writelines(self.recorded_actions)
                messagebox.showinfo("Thành công", f"Đã xuất file log thành công tại:\n{save_path}\n\nHãy gửi file này cho AI nhé!")
            except Exception as e:
                messagebox.showerror("Lỗi", f"Không thể lưu file: {e}")

if __name__ == "__main__":
    app = AIHelperTool()
    app.mainloop()
