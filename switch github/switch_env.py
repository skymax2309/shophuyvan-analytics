import customtkinter as ctk
import json
import subprocess
import os
import winreg
import sys
import tkinter.messagebox as messagebox

CONFIG_FILE = "profiles.json"

class SwitchEnvApp(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("⚡ Switcher")
        
        # Cấu hình kích thước nhỏ gọn (Sidebar style)
        window_width = 350
        window_height = 600
        
        # Lấy thông số màn hình để tính toán vị trí bên phải
        screen_width = self.winfo_screenwidth()
        screen_height = self.winfo_screenheight()
        
        # Tọa độ x: sát mép phải (trừ đi chiều rộng tool và một chút lề 10px)
        # Tọa độ y: căn giữa theo chiều dọc
        pos_x = screen_width - window_width - 10
        pos_y = (screen_height - window_height) // 2
        
        self.geometry(f"{window_width}x{window_height}+{pos_x}+{pos_y}")
        self.configure(fg_color="#101010")
        self.attributes("-topmost", True) # Luôn hiện trên cùng để bạn dễ bấm (tùy chọn)
        
        self.current_profile_data = None

        ctk.CTkLabel(self, text="🔄 CHUYỂN ĐỔI MÔI TRƯỜNG", 
                     font=("Segoe UI", 18, "bold"), text_color="#00CED1").pack(pady=(15, 5))

        self.profiles = self.load_profiles()
        
        if not self.profiles:
            ctk.CTkLabel(self, text=f"Lỗi: Không tìm thấy hoặc sai format file {CONFIG_FILE}!", 
                         text_color="red").pack(pady=20)
            return

        # Frame chứa nút chuyển đổi
        self.switch_frame = ctk.CTkFrame(self, fg_color="transparent")
        self.switch_frame.pack(fill="x", pady=5)

        for profile_name in self.profiles.keys():
            btn = ctk.CTkButton(
                self.switch_frame, 
                text=f"▶ Chuyển sang: {profile_name}",
                font=("Segoe UI", 13, "bold"),
                height=35,
                command=lambda name=profile_name: self.switch_profile(name)
            )
            btn.pack(pady=5, padx=40, fill="x")

        # Frame Quick Actions (Chỉ hiện nút khi đã chọn Profile)
        ctk.CTkLabel(self, text="⚡ THAO TÁC NHANH (QUICK ACTIONS)", 
                     font=("Segoe UI", 14, "bold"), text_color="#FFD700").pack(pady=(15, 5))
        
        self.action_frame = ctk.CTkFrame(self, fg_color="#1E1E1E", corner_radius=10)
        self.action_frame.pack(fill="x", padx=15, pady=5)

        # Sử dụng Grid để xếp 2 cột cho gọn
        self.action_frame.columnconfigure(0, weight=1)
        self.action_frame.columnconfigure(1, weight=1)

        self.btn_git_push = ctk.CTkButton(self.action_frame, text="🚀 Push Code (Git)", state="disabled", fg_color="#444", command=self.action_git_push)
        self.btn_git_push.grid(row=0, column=0, padx=10, pady=(15,5), sticky="ew")

        self.btn_git_pull = ctk.CTkButton(self.action_frame, text="📥 Kéo Code (Pull)", state="disabled", fg_color="#444", command=self.action_git_pull)
        self.btn_git_pull.grid(row=0, column=1, padx=10, pady=(15,5), sticky="ew")

        self.btn_backup = ctk.CTkButton(self.action_frame, text="💾 Backup D1 (Full)", state="disabled", fg_color="#444", command=self.action_backup_d1)
        self.btn_backup.grid(row=1, column=0, padx=10, pady=5, sticky="ew")

        self.btn_export = ctk.CTkButton(self.action_frame, text="📊 Xuất Khung D1 (.sql)", state="disabled", fg_color="#444", command=self.action_export_d1)
        self.btn_export.grid(row=1, column=1, padx=10, pady=5, sticky="ew")

        self.btn_deploy = ctk.CTkButton(self.action_frame, text="⚡ Cập nhật Server (Deploy)", state="disabled", fg_color="#444", command=self.action_deploy)
        self.btn_deploy.grid(row=2, column=0, padx=10, pady=5, sticky="ew")

        self.btn_tail = ctk.CTkButton(self.action_frame, text="👀 Xem Live Log (Tail)", state="disabled", fg_color="#444", command=self.action_tail)
        self.btn_tail.grid(row=2, column=1, padx=10, pady=5, sticky="ew")

        self.btn_tree = ctk.CTkButton(self.action_frame, text="📂 Xuất Cấu trúc Thư mục (.txt)", state="disabled", fg_color="#444", command=self.action_tree)
        self.btn_tree.grid(row=3, column=0, columnspan=2, padx=10, pady=5, sticky="ew")

        # Checkbox khởi động cùng Win
        self.startup_var = ctk.BooleanVar(value=self.check_startup_status())
        self.chk_startup = ctk.CTkCheckBox(self.action_frame, text="Khởi động cùng Windows", 
                                            variable=self.startup_var, command=self.toggle_startup,
                                            font=("Segoe UI", 11), text_color="#AAAAAA", checkbox_width=18, checkbox_height=18)
        self.chk_startup.grid(row=4, column=0, columnspan=2, padx=10, pady=(5, 15))

        self.status_label = ctk.CTkLabel(self, text="Sẵn sàng. Hãy chọn tài khoản.", font=("Segoe UI", 12), text_color="#AAAAAA")
        self.status_label.pack(side="bottom", pady=10)

    def load_profiles(self):
        try:
            if os.path.exists(CONFIG_FILE):
                with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                    return json.load(f)
            return {}
        except Exception as e:
            print(f"Lỗi đọc file config: {e}")
            return {}

    def run_cmd(self, cmd):
        try:
            subprocess.run(cmd, check=True, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            return True
        except subprocess.CalledProcessError:
            return False

    def switch_profile(self, profile_name):
        data = self.profiles[profile_name]
        
        # 1. Chuyển Git & SSH Key
        git_name_ok = self.run_cmd(f'git config --global user.name "{data["git_name"]}"')
        git_email_ok = self.run_cmd(f'git config --global user.email "{data["git_email"]}"')
        
        # Ép Git dùng đúng file SSH Key (thêm tham số IdentitiesOnly=yes để không bị lấy nhầm key khác)
        ssh_key_path = f"~/.ssh/{data['ssh_key']}"
        git_ssh_ok = self.run_cmd(f'git config --global core.sshCommand "ssh -i {ssh_key_path} -o IdentitiesOnly=yes"')
        
        # 2. Chuyển Cloudflare (Dùng setx trên Windows)
        cf_id_ok = self.run_cmd(f'setx CLOUDFLARE_ACCOUNT_ID "{data["cf_account_id"]}"')
        cf_token_ok = self.run_cmd(f'setx CLOUDFLARE_API_TOKEN "{data["cf_api_token"]}"')

        if all([git_name_ok, git_email_ok, git_ssh_ok, cf_id_ok, cf_token_ok]):
            msg = (f"✅ Đã chuyển thành công sang: {profile_name}\n\n"
                   f"Git: {data['git_name']} ({data['git_email']})\n"
                   f"SSH Key: {data['ssh_key']}\n"
                   f"Cloudflare: Đã nạp Token.\n\n"
                   f"Nhấn OK để tự động kiểm tra cấu hình hệ thống.")
            messagebox.showinfo("Thành công", msg)
            self.status_label.configure(text=f"Đang dùng: {profile_name}", text_color="#28A745")

            # Bơm trực tiếp biến mới vào phiên làm việc hiện tại để PowerShell con nhận ngay lập tức
            os.environ["CLOUDFLARE_ACCOUNT_ID"] = data["cf_account_id"]
            os.environ["CLOUDFLARE_API_TOKEN"] = data["cf_api_token"]

            # Bật sáng các nút hành động nhanh
            self.current_profile_data = data
            self.btn_git_push.configure(state="normal", fg_color="#E67E22", hover_color="#D35400")
            self.btn_git_pull.configure(state="normal", fg_color="#D35400", hover_color="#A04000")
            self.btn_backup.configure(state="normal", fg_color="#2980B9", hover_color="#2471A3")
            self.btn_export.configure(state="normal", fg_color="#27AE60", hover_color="#1E8449")
            self.btn_deploy.configure(state="normal", fg_color="#8E44AD", hover_color="#732D91")
            self.btn_tail.configure(state="normal", fg_color="#34495E", hover_color="#2C3E50")
            self.btn_tree.configure(state="normal", fg_color="#607D8B", hover_color="#455A64")

            # Mở PowerShell mới để kiểm tra ngay lập tức
            project_path = data.get("project_path", "")
            cd_cmd = f"cd '{project_path}'; " if project_path else ""

            ps_cmd = (
                "Clear-Host; "
                "Write-Host '===========================================' -ForegroundColor Cyan; "
                "Write-Host '    KIEM TRA KET QUA CHUYEN TAI KHOAN      ' -ForegroundColor Green; "
                "Write-Host '===========================================' -ForegroundColor Cyan; "
                "Write-Host ''; Write-Host '[1] Thong tin Git:' -ForegroundColor Yellow; "
                "git config --global user.name; "
                "git config --global user.email; "
                "Write-Host ''; Write-Host '[2] SSH Command (Khoa bi mat):' -ForegroundColor Yellow; "
                "git config --global core.sshCommand; "
                "Write-Host ''; Write-Host '[3] Test ket noi GitHub (Vui long doi 2-3s...):' -ForegroundColor Yellow; "
                "ssh -T git@github.com; "
                "Write-Host ''; Write-Host '[4] Bien moi truong Cloudflare Account ID:' -ForegroundColor Yellow; "
                "Write-Host $env:CLOUDFLARE_ACCOUNT_ID; "
                "Write-Host ''; Write-Host '[5] Kiem tra Wrangler Cloudflare:' -ForegroundColor Yellow; "
                "wrangler whoami; "
                "Write-Host ''; Write-Host '===========================================' -ForegroundColor Cyan; "
                f"{cd_cmd}"
                "Write-Host 'XONG! Ban co the bat dau code tai thu muc nay.' -ForegroundColor Green;"
            )
            try:
                subprocess.Popen(["powershell", "-NoExit", "-Command", ps_cmd])
            except Exception as e:
                print(f"Lỗi mở PowerShell: {e}")
                
        else:
            messagebox.showerror("Lỗi", "Có lỗi xảy ra trong quá trình chạy lệnh hệ thống.")
            self.status_label.configure(text="Lỗi chuyển đổi!", text_color="red")

    def run_action_ps(self, commands, title, target_path=None):
        """Hàm phụ trợ mở PowerShell chạy lệnh Quick Action"""
        if not self.current_profile_data: return
        
        # Ưu tiên dùng target_path nếu có, không thì dùng project_path mặc định
        run_path = target_path if target_path else self.current_profile_data.get("project_path", "")
        if not run_path:
            messagebox.showwarning("Cảnh báo", "Bạn chưa cấu hình đường dẫn (project_path hoặc wrangler_path) cho tài khoản này!")
            return
            
        # Nạp biến môi trường cho PowerShell mới
        env_cmd = (
            f"$env:CLOUDFLARE_ACCOUNT_ID='{self.current_profile_data['cf_account_id']}'; "
            f"$env:CLOUDFLARE_API_TOKEN='{self.current_profile_data['cf_api_token']}'; "
        )
            
        full_cmd = (
            "Clear-Host; "
            f"Write-Host '=== {title} ===' -ForegroundColor Cyan; "
            f"{env_cmd}"
            f"cd '{run_path}'; "
            f"{commands}; "
            "Write-Host '-------------------------------------------' -ForegroundColor Green; "
            "Write-Host 'Da chay xong lenh!' -ForegroundColor Green;"
        )
        subprocess.Popen(["powershell", "-NoExit", "-Command", full_cmd])

    def action_git_push(self):
        # Tạo timestamp theo định dạng YYMMDDHHmm (Ví dụ: 2603231715)
        from datetime import datetime
        timestamp = datetime.now().strftime("%y%m%d%H%M")
        commit_msg = f"autoupdate {timestamp}"

        # Tự động thêm .sql và file cấu trúc vào .gitignore trước khi push
        cmd = (
            'if (!(Test-Path .gitignore)) { New-Item .gitignore }; '
            'if (!(Select-String -Path .gitignore -Pattern "*.sql" -SimpleMatch)) { Add-Content .gitignore "`n*.sql`ncau_truc_thu_muc.txt" }; '
            f'git add .gitignore; git add .; git commit -m "{commit_msg}"; git push'
        )
        self.run_action_ps(cmd, f"DANG PUSH CODE VỚI COMMENT: {commit_msg}")

    def action_backup_d1(self):
        db_name = self.current_profile_data.get("d1_db_name", "")
        if not db_name:
            messagebox.showwarning("Cảnh báo", "Bạn chưa cấu hình d1_db_name!")
            return
        
        # Tự động tạo timestamp (Ngày_Giờ) để không bị đè file cũ
        from datetime import datetime
        timestamp = datetime.now().strftime("%Y%m%d_%H%M")
        file_name = f"backup_{db_name}_{timestamp}.sql"
        
        # Lệnh export lấy toàn bộ dữ liệu + cấu trúc
        cmd = f"wrangler d1 export {db_name} --remote --output={file_name}"
        self.run_action_ps(cmd, f"DANG BACKUP DATABASE (FULL): {db_name} -> {file_name}")

    def action_export_d1(self):
        db_name = self.current_profile_data.get("d1_db_name", "")
        if not db_name:
            messagebox.showwarning("Cảnh báo", "Bạn chưa cấu hình d1_db_name!")
            return
            
        file_name = f"schema_{db_name}.sql"
        
        # Lệnh execute lấy bộ khung (Schema)
        cmd = f"wrangler d1 execute {db_name} --remote --command=\"SELECT sql FROM sqlite_master WHERE type='table';\" > {file_name}"
        self.run_action_ps(cmd, f"DANG XUAT CAU TRUC (SCHEMA): {db_name} -> {file_name}")

    def action_git_pull(self):
        cmd = 'git pull'
        self.run_action_ps(cmd, "DANG KEO CODE TU GITHUB VE MAY")

    def action_deploy(self):
        wrangler_path = self.current_profile_data.get("wrangler_path", self.current_profile_data.get("project_path", ""))
        cmd = 'wrangler deploy'
        self.run_action_ps(cmd, "DANG DAY CODE LEN SERVER CLOUDFLARE (DEPLOY)", target_path=wrangler_path)

    def action_tail(self):
        # Thêm --format json hoặc tự động tìm tên worker nếu project_path chuẩn
        wrangler_path = self.current_profile_data.get("wrangler_path", self.current_profile_data.get("project_path", ""))
        cmd = 'wrangler tail'
        self.run_action_ps(cmd, "DANG XEM LIVE LOG SERVER (AN CTRL+C DE THOAT)", target_path=wrangler_path)

    def action_tree(self):
    # Neo tìm kiếm: Xuất cấu trúc thư mục bằng Python thuần để tránh lỗi PowerShell
        if not self.current_profile_data: return
        project_path = self.current_profile_data.get("project_path", "")
        if not project_path:
            messagebox.showwarning("Cảnh báo", "Bạn chưa cấu hình project_path!")
            return

        output_file = os.path.join(project_path, "project_tree_full.txt")
        exclude_dirs = {'.git', '.wrangler', 'node_modules', '__pycache__', '.venv', 'dist', '.next'}
        exclude_files = {'*.exe', '*.dll', '*.pyc'}

        try:
            with open(output_file, "w", encoding="utf-8") as f:
                f.write(f"=== CAU TRUC DU AN: {os.path.basename(project_path)} ===\n\n")
                for root, dirs, files in os.walk(project_path):
                    # Loại bỏ thư mục rác
                    dirs[:] = [d for d in dirs if d not in exclude_dirs]

                    level = root.replace(project_path, '').count(os.sep)
                    indent = '    ' * level
                    f.write(f'{indent}├── {os.path.basename(root)}/\n')

                    sub_indent = '    ' * (level + 1)
                    for file in files:
                        # Bỏ qua các file rác nếu cần
                        if not any(file.endswith(ext.replace('*', '')) for ext in exclude_files):
                            f.write(f'{sub_indent}└── {file}\n')

            # Mở file ngay sau khi xuất xong
            os.startfile(output_file)
            self.status_label.configure(text="✅ Đã xuất cấu trúc thư mục!", text_color="#28A745")
        except Exception as e:
            messagebox.showerror("Lỗi", f"Không thể xuất thư mục: {str(e)}")
        
    def check_startup_status(self):
        """Kiểm tra xem tool đã có trong Startup chưa"""
        try:
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run", 0, winreg.KEY_READ)
            winreg.QueryValueEx(key, "CloudflareGithubSwitcher")
            winreg.CloseKey(key)
            return True
        except:
            return False

    def toggle_startup(self):
        """Bật/Tắt khởi động cùng Windows"""
        key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
        app_name = "CloudflareGithubSwitcher"
        
        # Lấy đường dẫn thực thi của python và file script hiện tại
        script_path = os.path.abspath(sys.argv[0])
        # Dùng pythonw để khi khởi động không bị hiện cửa sổ đen cmd
        pythonw_path = sys.executable.replace("python.exe", "pythonw.exe")
        cmd = f'"{pythonw_path}" "{script_path}"'

        try:
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_WRITE)
            if self.startup_var.get():
                winreg.SetValueEx(key, app_name, 0, winreg.REG_SZ, cmd)
                self.status_label.configure(text="Đã bật khởi động cùng Win.", text_color="green")
            else:
                winreg.DeleteValue(key, app_name)
                self.status_label.configure(text="Đã tắt khởi động cùng Win.", text_color="#AAAAAA")
            winreg.CloseKey(key)
        except Exception as e:
            messagebox.showerror("Lỗi", f"Không thể thiết lập Startup: {e}")

if __name__ == "__main__":
    app = SwitchEnvApp()
    app.mainloop()
