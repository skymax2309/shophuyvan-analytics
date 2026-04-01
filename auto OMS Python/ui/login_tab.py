import customtkinter as ctk
from tkinter import filedialog
import threading
import asyncio
from playwright.async_api import async_playwright
import os
import json

class LoginTab(ctk.CTkFrame):
    def __init__(self, master, app):
        super().__init__(master, fg_color="transparent")
        self.app = app
        # Xác định đường dẫn file JSON tự động
        current_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.data_file = os.path.join(current_dir, "data", "shops.json")
        self.pack(fill="both", expand=True)
        self._build_ui()

    def _build_ui(self):
        # ── KHU VỰC CẤU HÌNH CHUNG ĐƯA LÊN TRÊN CÙNG CHO DỄ THẤY ──
        settings_frame = ctk.CTkFrame(self, fg_color="transparent")
        settings_frame.pack(fill="x", padx=15, pady=(10, 0))
        
        ctk.CTkSwitch(settings_frame, text="🚀 Tự khởi động cùng Windows", variable=self.app.var_autostart, command=self.app._toggle_autostart, font=("Segoe UI", 12, "bold"), text_color="white", progress_color="#28A745").pack(side="left", padx=(0, 30))
        ctk.CTkSwitch(settings_frame, text="🙈 Chạy ẩn trình duyệt (Headless)", variable=self.app.var_headless, font=("Segoe UI", 12, "bold"), text_color="white", progress_color="#00CED1").pack(side="left")

        top_frame = ctk.CTkFrame(self, fg_color="transparent")
        top_frame.pack(fill="x", padx=15, pady=(10,0))

        # ── FORM THÊM SHOP ĐƯỢC CHIA LẠI GRID CHO THOÁNG ──
        ctk.CTkLabel(top_frame, text="Thêm Shop Mới (Không cần nhập Tên, Bot tự quét):", font=("Segoe UI",14,"bold"), text_color="#FFD700").pack(anchor="w", pady=(0,6))
        form_frame = ctk.CTkFrame(top_frame, fg_color="#222222", corner_radius=10, border_width=1, border_color="#333333")
        form_frame.pack(fill="x", pady=(0, 10))

        form_frame.grid_columnconfigure((1, 3, 5), weight=1) # Giúp các ô nhập tự động giãn dài ra

        # --- HÀNG 1: SÀN + TÀI KHOẢN + MẬT KHẨU ---
        ctk.CTkLabel(form_frame, text="Sàn:", font=("Segoe UI",12,"bold"), text_color="#aaa").grid(row=0, column=0, padx=(15,5), pady=(12,5), sticky="e")
        self.combo_san_new = ctk.CTkComboBox(form_frame, values=["shopee","lazada","tiktok"], width=120, font=("Segoe UI",12))
        self.combo_san_new.set("shopee")
        self.combo_san_new.grid(row=0, column=1, padx=5, pady=(12,5), sticky="w")

        ctk.CTkLabel(form_frame, text="Tài khoản:", font=("Segoe UI",12,"bold"), text_color="#aaa").grid(row=0, column=2, padx=(10,5), pady=(12,5), sticky="e")
        self.entry_tk_new = ctk.CTkEntry(form_frame, placeholder_text="User Name / SĐT", font=("Segoe UI",12))
        self.entry_tk_new.grid(row=0, column=3, padx=5, pady=(12,5), sticky="we")

        ctk.CTkLabel(form_frame, text="Mật khẩu:", font=("Segoe UI",12,"bold"), text_color="#aaa").grid(row=0, column=4, padx=(10,5), pady=(12,5), sticky="e")
        self.entry_mk_new = ctk.CTkEntry(form_frame, placeholder_text="Mật khẩu", show="*", font=("Segoe UI",12))
        self.entry_mk_new.grid(row=0, column=5, padx=(5,15), pady=(12,5), sticky="we")

        # --- HÀNG 2: THƯ MỤC LƯU + PROFILE DIR ---
        ctk.CTkLabel(form_frame, text="Thư mục lưu:", font=("Segoe UI",12,"bold"), text_color="#aaa").grid(row=1, column=0, padx=(15,5), pady=(5,12), sticky="e")
        dir_frame = ctk.CTkFrame(form_frame, fg_color="transparent")
        dir_frame.grid(row=1, column=1, columnspan=3, padx=5, pady=(5,12), sticky="we")
        self.entry_dir_new = ctk.CTkEntry(dir_frame, placeholder_text=r"E:\Doanh Thu\...", font=("Segoe UI",11))
        self.entry_dir_new.pack(side="left", fill="x", expand=True)
        ctk.CTkButton(dir_frame, text="📁", width=40, command=self._browse_dir, fg_color="#444", hover_color="#555").pack(side="right", padx=(5,0))

        ctk.CTkLabel(form_frame, text="Profile dir:", font=("Segoe UI",12,"bold"), text_color="#aaa").grid(row=1, column=4, padx=(10,5), pady=(5,12), sticky="e")
        prof_frame = ctk.CTkFrame(form_frame, fg_color="transparent")
        prof_frame.grid(row=1, column=5, padx=(5,15), pady=(5,12), sticky="we")
        self.entry_prof_new = ctk.CTkEntry(prof_frame, placeholder_text=r"C:\Users\...\Bot_Data", font=("Segoe UI",11))
        self.entry_prof_new.pack(side="left", fill="x", expand=True)
        ctk.CTkButton(prof_frame, text="📁", width=40, command=self._browse_prof, fg_color="#444", hover_color="#555").pack(side="right", padx=(5,0))

        # ── NÚT ĐIỀU KHIỂN ĐƯỢC PHÂN LẬP 2 BÊN RÕ RÀNG ──
        btn_frame = ctk.CTkFrame(top_frame, fg_color="transparent")
        btn_frame.pack(fill="x", pady=(0,5))
        ctk.CTkButton(btn_frame, text="✚ Thêm Shop Mới", command=self._add_shop_to_list, font=("Segoe UI",13,"bold"), fg_color="#28A745", hover_color="#218838", height=36, corner_radius=8).pack(side="left", padx=(0,10))
        ctk.CTkButton(btn_frame, text="🗑️ Xóa Shop Đã Chọn", command=self._del_shop_from_list, font=("Segoe UI",13,"bold"), fg_color="#444", hover_color="#DC3545", height=36, corner_radius=8).pack(side="left")
        
        self.btn_login_shop = ctk.CTkButton(btn_frame, text="🔑 Đăng Nhập / Quét Tên Shop Đã Chọn", command=self.run_manual_login, font=("Segoe UI",13,"bold"), fg_color="#f59e0b", hover_color="#d97706", height=36, corner_radius=8)
        self.btn_login_shop.pack(side="right")

        # ── BẢNG DANH SÁCH ĐẸP MẮT (Dùng ScrollableFrame chống tràn) ──
        list_frame = ctk.CTkFrame(self, fg_color="transparent")
        list_frame.pack(fill="both", expand=True, padx=15, pady=(5,10))
        ctk.CTkLabel(list_frame, text="Danh Sách Cửa Hàng Đang Quản Lý:", font=("Segoe UI",14,"bold"), text_color="#00CED1").pack(anchor="w", pady=(0,5))

        self.shop_list_frame = ctk.CTkScrollableFrame(list_frame, fg_color="#222222", corner_radius=10, border_width=1, border_color="#333333")
        self.shop_list_frame.pack(fill="both", expand=True) # expand=True giúp nó TỰ CO LẠI nhường chỗ cho Trạm Log
        
        self.shop_checkboxes = {}
        self._update_shop_list()
    def _browse_dir(self):
        folder = filedialog.askdirectory(title="Chọn thư mục lưu Excel/PDF")
        if folder:
            self.entry_dir_new.delete(0, "end")
            self.entry_dir_new.insert(0, folder)

    def _browse_prof(self):
        folder = filedialog.askdirectory(title="Chọn thư mục lưu Profile/Cookie trình duyệt")
        if folder:
            self.entry_prof_new.delete(0, "end")
            self.entry_prof_new.insert(0, folder)

    def _update_shop_list(self):
        for widget in self.shop_list_frame.winfo_children():
            widget.destroy()
        self.shop_checkboxes.clear()

        # Tạo thanh Tiêu đề (Header) giả
        header = ctk.CTkFrame(self.shop_list_frame, fg_color="#333333", height=35, corner_radius=5)
        header.pack(fill="x", pady=(0, 5))
        ctk.CTkLabel(header, text="Chọn", width=50, font=("Segoe UI", 12, "bold"), text_color="#00CED1").pack(side="left", padx=5)
        ctk.CTkLabel(header, text="Sàn", width=80, anchor="w", font=("Segoe UI", 12, "bold"), text_color="#00CED1").pack(side="left", padx=5)
        ctk.CTkLabel(header, text="Tên Shop", anchor="w", font=("Segoe UI", 12, "bold"), text_color="#00CED1").pack(side="left", fill="x", expand=True, padx=5)
        ctk.CTkLabel(header, text="Tài khoản (User)", width=180, anchor="w", font=("Segoe UI", 12, "bold"), text_color="#00CED1").pack(side="left", padx=5)

        for i, shop in enumerate(self.app.DANH_SACH_SHOP):
            row = ctk.CTkFrame(self.shop_list_frame, fg_color="transparent")
            row.pack(fill="x", pady=3)
            
            # Tạo Checkbox XỊN SÒ của CustomTkinter
            var = ctk.BooleanVar(value=False)
            self.shop_checkboxes[i] = var
            cb = ctk.CTkCheckBox(row, text="", variable=var, width=50, checkbox_width=22, checkbox_height=22, fg_color="#00CED1", hover_color="#00FFFF")
            cb.pack(side="left", padx=5)
            
            plat = shop.get("platform", "shopee").upper()
            ctk.CTkLabel(row, text=plat, width=80, anchor="w", font=("Segoe UI", 12, "bold"), text_color="#aaa").pack(side="left", padx=5)
            
            ten = shop.get("ten_shop", "<Chưa có tên>")
            ctk.CTkLabel(row, text=ten, anchor="w", font=("Segoe UI", 13, "bold"), text_color="white").pack(side="left", fill="x", expand=True, padx=5)
            
            user = shop.get("user_name", shop.get("tai_khoan", ""))
            ctk.CTkLabel(row, text=user, width=180, anchor="w", font=("Segoe UI", 12), text_color="#888").pack(side="left", padx=5)

    def _save_shops_to_json(self):
        try:
            os.makedirs(os.path.dirname(self.data_file), exist_ok=True)
            with open(self.data_file, "w", encoding="utf-8") as f:
                json.dump(self.app.DANH_SACH_SHOP, f, ensure_ascii=False, indent=4)
            self.app.log("💾 Đã lưu cục bộ vào file shops.json.")
            
            # GỌI HÀM ĐỒNG BỘ LÊN SERVER BẰNG LUỒNG ẨN
            threading.Thread(target=self._sync_shops_to_server, daemon=True).start()
        except Exception as e:
            self.app.log(f"❌ Lỗi ghi file shops.json: {e}")

    def _sync_shops_to_server(self):
        import requests
        self.app.log("⏳ [DÒ MÌN] Đang đẩy danh sách Shop mới nhất lên Server Cloudflare...")
        try:
            # Lọc bỏ các shop rỗng (None) nếu có trong mảng
            valid_shops = [s for s in self.app.DANH_SACH_SHOP if s is not None]
            
            api_url = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/shops/sync"
            res = requests.post(api_url, json=valid_shops, timeout=15)
            
            if res.status_code == 200:
                data = res.json()
                self.app.log(f"✅ [SERVER] Đồng bộ danh sách Shop hoàn tất! (Thêm mới: {data.get('inserted',0)}, Cập nhật: {data.get('updated',0)})")
            else:
                self.app.log(f"❌ [SERVER] Lỗi đồng bộ DB (Code: {res.status_code}): {res.text}")
        except Exception as e:
            self.app.log(f"❌ [MẠNG] Lỗi đường truyền khi đẩy danh sách Shop lên Server: {e}")

    def _add_shop_to_list(self):
        platform = self.combo_san_new.get().strip().lower()
        email    = self.entry_tk_new.get().strip()
        matkhau  = self.entry_mk_new.get().strip()
        thu_muc  = self.entry_dir_new.get().strip()
        prof_dir = self.entry_prof_new.get().strip()
        
        if not email or not matkhau or not thu_muc or not prof_dir:
            self.app.log("⚠️ Vui lòng nhập đủ: Tài khoản, Mật khẩu và chọn 2 Thư mục!")
            return
            
        new_shop = {
            "ten_shop": f"<{email}>",
            "user_name": email,
            "mat_khau": matkhau,
            "thu_muc_luu": thu_muc,
            "profile_dir": prof_dir,
            "platform": platform
        }
        self.app.DANH_SACH_SHOP.append(new_shop)
        
        self.entry_tk_new.delete(0, "end")
        self.entry_mk_new.delete(0, "end")
        self.entry_dir_new.delete(0, "end")
        self.entry_prof_new.delete(0, "end")
        
        self._save_shops_to_json()
        self._update_treeview()
        self.app._refresh_auto_shop_list()

    def _del_shop_from_list(self):
        has_deleted = False
        for idx, var in self.shop_checkboxes.items():
            if var.get():
                self.app.DANH_SACH_SHOP[idx] = None
                has_deleted = True
        
        if has_deleted:
            self.app.DANH_SACH_SHOP = [s for s in self.app.DANH_SACH_SHOP if s is not None]
            self._save_shops_to_json()
            self._update_shop_list()
            self.app._refresh_auto_shop_list()
        else:
            self.app.log("⚠️ Vui lòng tích chọn shop cần xóa!")

    def get_selected_shops_from_list(self):
        selected = []
        for idx, var in self.shop_checkboxes.items():
            if var.get():
                selected.append(self.app.DANH_SACH_SHOP[idx])
        return selected

    def run_manual_login(self):
        selected = self.get_selected_shops_from_list()
        if not selected:
            self.app.log("⚠️ Vui lòng tích chọn 1 shop trong bảng trên để Đăng nhập!")
            return
        if len(selected) > 1:
            self.app.log("⚠️ Chỉ chọn 1 shop mỗi lần để Đăng nhập!")
            return
        shop = selected[0]
        def task():
            # Dùng self.after để an toàn cho giao diện, tránh đơ app
            self.after(0, lambda: self.btn_login_shop.configure(state="disabled", text="⏳ Đang xử lý..."))
            try:
                # Sửa lỗi treo asyncio khi chạy luồng phụ trên Windows
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                loop.run_until_complete(self.playwright_manual_login(shop))
                loop.close()
            except Exception as e:
                import traceback
                print(traceback.format_exc()) # In thẳng ra terminal để dễ dò mìn
                self.app.log(f"❌ Lỗi hệ thống: {str(e)}")
            finally:
                self.after(0, lambda: self.btn_login_shop.configure(state="normal", text="🔑 Đăng Nhập / Quét Tên Shop"))
                
        threading.Thread(target=task, daemon=True).start()

    async def playwright_manual_login(self, shop):
        self.app.log(f"🚀 Mở trình duyệt để Đăng nhập: {shop.get('user_name', 'Unknown')}")
        
        prof_dir = shop.get('profile_dir', '').strip()
        if not prof_dir:
            self.app.log("❌ Lỗi: Shop này chưa cấu hình Profile dir! Vui lòng xóa đi và Thêm lại.")
            return

        async with async_playwright() as p:
            if not os.path.exists(prof_dir):
                os.makedirs(prof_dir)
                
            browser = await p.chromium.launch_persistent_context(
                user_data_dir=prof_dir,
                channel="chrome", headless=False, viewport={"width": 1280, "height": 720},
                args=["--disable-blink-features=AutomationControlled"]
            )
            try:
                page = browser.pages[0] if browser.pages else await browser.new_page()
                platform = shop.get('platform')
                is_logged = False
                
                # 1. KIỂM TRA & ĐĂNG NHẬP
                if platform == 'shopee':
                    from engines.shopee.shopee_auth import ShopeeAuth
                    auth = ShopeeAuth(self.app.log)
                    is_logged = await auth.check_and_login(page, shop)
                elif platform == 'tiktok':
                    from engines.tiktok.tiktok_auth import TikTokAuth
                    auth = TikTokAuth(self.app.log)
                    is_logged = await auth.check_and_login(page, shop)
                elif platform == 'lazada':
                    from engines.lazada.lazada_auth import LazadaAuth
                    auth = LazadaAuth(self.app.log)
                    is_logged = await auth.check_and_login(page, shop)
                    
                # 2. SAU KHI ĐĂNG NHẬP, TỰ QUÉT TÊN SHOP & LƯU LẠI
                if is_logged:
                    self.app.log(f"✅ Đăng nhập {platform.upper()} thành công. Chờ trang tải hoàn tất để quét tên Shop...")
                    try:
                        scraped_name = ""
                        # Vòng lặp chờ tối đa 15 giây để giao diện render xong thẻ HTML chứa tên shop
                        for _ in range(15):
                            await asyncio.sleep(1)
                            shop_name_js = '''() => {
                                // Bổ sung bộ nhận diện class CSS đặc thù của Shopee, TikTok, Lazada
                                let selectors = [
                                    '.shop-name', '.account-name', '.brand-name', '.seller-name', 
                                    '[data-testid="shop-name"]', '.name-text', '.index__name--P3O1N',
                                    '.shop-name-text', '.user-name'
                                ];
                                for (let sel of selectors) {
                                    let el = document.querySelector(sel);
                                    if (el && el.innerText.trim()) return el.innerText.trim();
                                }
                                return '';
                            }'''
                            scraped_name = await page.evaluate(shop_name_js)
                            if scraped_name:
                                break # Thoát vòng lặp ngay khi tìm thấy tên
                        
                        if scraped_name:
                            shop['ten_shop'] = scraped_name
                            self.app.log(f"🎯 Đã cập nhật tên shop thực tế: {scraped_name}")
                        else:
                            shop['ten_shop'] = shop['user_name']
                            self.app.log("⚠️ Không quét được tên shop do web load chậm hoặc đổi cấu trúc, tạm lưu thành User Name.")
                            
                        # Ghi thẳng vào file JSON
                        self._save_shops_to_json()
                        self._update_treeview()
                        self.app._refresh_auto_shop_list()
                        
                    except Exception as e:
                        self.app.log(f"⚠️ Lỗi khi quét tên shop: {e}")
                else:
                    self.app.log(f"⚠️ Đăng nhập {platform.upper()} thất bại hoặc quá thời gian.")
                    
            except Exception as e:
                self.app.log(f"❌ Lỗi khi mở shop {shop.get('user_name')}: {str(e)}")
            finally:
                await browser.close()
                self.app.log(f"✅ Đã đóng trình duyệt.")
