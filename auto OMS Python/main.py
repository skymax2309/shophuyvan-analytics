import os
import sys

# Đảm bảo Python nhận diện được thư mục gốc để import các module (engines, parsers, ui...)
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Gọi file giao diện từ thư mục ui
from ui.main_window import HuyVanApp

if __name__ == "__main__":
    app = HuyVanApp()
    app.mainloop()
