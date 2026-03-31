import customtkinter as ctk
from tkinter import ttk, filedialog
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
        top_frame = ctk.CTkFrame(self, fg_color="transparent")
        top_frame.pack(fill="x", padx=15, pady=(15,5))

        # Form thêm shop
        ctk.CTkLabel(top_frame, text="Thêm Shop Mới (Không cần nhập Tên, Bot tự quét):", font=("Segoe UI",14,"bold"), text_color="#FFD700").pack(anchor="w", pady=(0,6))
        form_frame = ctk.CTkFrame(top_frame, fg_color="#222222", corner_radius=10, border_width=1, border_color="#333333")
        form_frame.pack(fill="x", pady=(0, 10))

        # --- HÀNG 1: SÀN + TÀI KHOẢN + MẬT KHẨU ---
        ctk.CTkLabel(form_frame, text="Sàn:", font=("Segoe UI",11), text_color="#aaa").grid(row=0, column=0, padx=(10,3), pady=(12,6), sticky="e")
        self.combo_san_new = ctk.CTkComboBox(form_frame, values=["shopee","lazada","tiktok"], width=100, font=("Segoe UI",11))
        self.combo_san_new.set("shopee")
        self.combo_san_new.grid(row=0, column=1, padx=3, pady=(12,6), sticky="w")

        ctk.CTkLabel(form_frame, text="Tài khoản:", font=("Segoe UI",11), text_color="#aaa").grid(row=0, column=2, padx=(15,3), pady=(12,6), sticky="e")
        self.entry_tk_new = ctk.CTkEntry(form_frame, width=180, placeholder_text="User Name / SĐT", font=("Segoe UI",11))
        self.entry_tk_new.grid(row=0, column=3, padx=3, pady=(12,6), sticky="w")

        ctk.CTkLabel(form_frame, text="Mật khẩu:", font=("Segoe UI",11), text_color="#aaa").grid(row=0, column=4, padx=(15,3), pady=(12,6), sticky="e")
        self.entry_mk_new = ctk.CTkEntry(form_frame, width=150, placeholder_text="Mật khẩu", show="*", font=("Segoe UI",11))
        self.entry_mk_new.grid(row=0, column=5, padx=3, pady=(12,6), sticky="w")

        # --- HÀNG 2: THƯ MỤC LƯU + PROFILE DIR ---
        ctk.CTkLabel(form_frame, text="Thư mục lưu:", font=("Segoe UI",11), text_color="#aaa").grid(row=1, column=0, padx=(10,3), pady=(0,12), sticky="e")
        self.entry_dir_new = ctk.CTkEntry(form_frame, width=150, placeholder_text=r"E:\Doanh Thu\...", font=("Segoe UI",10))
        self.entry_dir_new.grid(row=1, column=1, columnspan=2, padx=3, pady=(0,12), sticky="we")
        ctk.CTkButton(form_frame, text="📁", width=40, command=self._browse_dir, fg_color="#444", hover_color="#555").grid(row=1, column=3, padx=(0,5), pady=(0,12), sticky="w")

        ctk.CTkLabel(form_frame, text="Profile dir:", font=("Segoe UI",11), text_color="#aaa").grid(row=1, column=4, padx=(10,3), pady=(0,12), sticky="e")
        self.entry_prof_new = ctk.CTkEntry(form_frame, width=150, placeholder_text=r"C:\Users\...\Bot_Data", font=("Segoe UI",10))
        self.entry_prof_new.grid(row=1, column=5, padx=3, pady=(0,12), sticky="we")
        ctk.CTkButton(form_frame, text="📁", width=40, command=self._browse_prof, fg_color="#444", hover_color="#555").grid(row=1, column=6, padx=(0,10), pady=(0,12), sticky="w")
        # --- NÚT THÊM / XÓA / ĐĂNG NHẬP ---
        btn_frame = ctk.CTkFrame(top_frame, fg_color="transparent")
        btn_frame.pack(fill="x", pady=(6,0))
        ctk.CTkButton(btn_frame, text="✚ Thêm Shop", command=self._add_shop_to_list, font=("Segoe UI",12,"bold"), fg_color="#28A745", hover_color="#218838", height=32, corner_radius=8).pack(side="left", padx=(0,8))
        ctk.CTkButton(btn_frame, text="🗑️ Xóa Shop", command=self._del_shop_from_list, font=("Segoe UI",12,"bold"), fg_color="#444", hover_color="#DC3545", height=32, corner_radius=8).pack(side="left", padx=(0,8))
        
        self.btn_login_shop = ctk.CTkButton(btn_frame, text="🔑 Đăng Nhập / Quét Tên Shop", command=self.run_manual_login, font=("Segoe UI",12,"bold"), fg_color="#f59e0b", hover_color="#d97706", height=32, corner_radius=8)
        self.btn_login_shop.pack(side="right")

        # Bảng danh sách
        list_frame = ctk.CTkFrame(self, fg_color="transparent")
        list_frame.pack(fill="both", expand=True, padx=15, pady=(8,15))
        ctk.CTkLabel(list_frame, text="Danh Sách Cửa Hàng (Click [X] để bật/tắt):", font=("Segoe UI",13,"bold"), text_color="#FFD700").pack(anchor="w", pady=(0,6))

        style = ttk.Style()
        style.theme_use("default")
        style.configure("Treeview", background="#222222", foreground="white", fieldbackground="#222222", rowheight=32, font=("Segoe UI",10))
        style.map("Treeview", background=[("selected","#333333")], foreground=[("selected","#00CED1")])
        style.configure("Treeview.Heading", background="#333333", foreground="#00CED1", relief="flat", font=("Segoe UI",11,"bold"))

        cols = ("Chon","STT","NenTang","TenShop","Platform")
        self.tree = ttk.Treeview(list_frame, columns=cols, show="headings", height=6)
        for col, w, anchor, head in [("Chon",50,"center","[X]"), ("STT",40,"center","STT"), ("NenTang",100,"center","Sàn"), ("TenShop",280,"w","Tên Shop"), ("Platform",100,"center","Platform")]:
            self.tree.heading(col, text=head)
            self.tree.column(col, width=w, anchor=anchor)

        self.tree.bind("<ButtonRelease-1>", self._toggle_shop_check)
        self.tree.pack(fill="x", pady=(0,8))
        
        self._update_treeview()

        # ── KHU VỰC CẤU HÌNH CHUNG (GLOBAL SETTINGS) ──
        settings_frame = ctk.CTkFrame(self, fg_color="transparent")
        settings_frame.pack(fill="x", padx=15, pady=(0, 10))
        
        ctk.CTkSwitch(settings_frame, text="🚀 Tự khởi động cùng Windows", variable=self.app.var_autostart, command=self.app._toggle_autostart, font=("Segoe UI", 12, "bold"), text_color="white", progress_color="#28A745").pack(side="left", padx=(0, 30))
        ctk.CTkSwitch(settings_frame, text="🙈 Chạy ẩn trình duyệt (Headless)", variable=self.app.var_headless, font=("Segoe UI", 12, "bold"), text_color="white", progress_color="#00CED1").pack(side="left")

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

    def _update_treeview(self):
        for item in self.tree.get_children():
            self.tree.delete(item)
        for i, shop in enumerate(self.app.DANH_SACH_SHOP, 1):
            ten = shop.get("ten_shop", "<Chưa có tên>")
            self.tree.insert("", "end", values=("☑", i, shop["platform"].upper(), ten, shop["platform"]), tags=(i-1,))

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
        selected = self.tree.selection()
        if not selected: return
        for item in selected:
            idx = int(self.tree.item(item, "tags")[0])
            self.app.DANH_SACH_SHOP[idx] = None
            
        self.app.DANH_SACH_SHOP = [s for s in self.app.DANH_SACH_SHOP if s is not None]
        self._save_shops_to_json()
        self._update_treeview()
        self.app._refresh_auto_shop_list()

    def _toggle_shop_check(self, event):
        region = self.tree.identify("region", event.x, event.y)
        if region == "cell" and self.tree.identify_column(event.x) == "#1":
            item = self.tree.focus()
            vals = list(self.tree.item(item, "values"))
            vals[0] = "☐" if vals[0] == "☑" else "☑"
            self.tree.item(item, values=vals)

    def get_selected_shops_from_tree(self):
        selected = []
        for item in self.tree.get_children():
            vals = self.tree.item(item, "values")
            if vals[0] == "☑":
                idx = int(self.tree.item(item, "tags")[0])
                selected.append(self.app.DANH_SACH_SHOP[idx])
        return selected

    def run_manual_login(self):
        selected = self.get_selected_shops_from_tree()
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
