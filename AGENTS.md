# Hướng Dẫn Cho Codex / Agent

> UTF-8. PowerShell: chạy `chcp 65001` trước khi làm việc với file tiếng Việt.

---

## 0A. Luật file AGENTS

`AGENTS.md` chỉ giữ: luật gốc, quy tắc an toàn, profile, deploy, nguyên tắc bắt buộc.

**Không nhồi** workflow dài, checklist chi tiết, template báo cáo hoặc kiến trúc vào đây.

Quy tắc phân loại:
1. Luật an toàn tối quan trọng → giữ trong `AGENTS.md`.
2. Workflow nhiều bước dùng lại → tạo hoặc cập nhật Skill.
3. Trạng thái dự án, mapping, endpoint progress → để trong `docs/`.
4. Kiểm tra tự động → viết script/test.
5. Nội dung dài hơn 30 dòng mà không phải luật gốc → tách Skill hoặc docs.
6. **File không được vượt 30KB.**

Khi phát hiện quy trình dùng lại từ 2 lần trở lên → tạo hoặc cập nhật Skill, thêm một dòng tham chiếu ở đây.

---

## 0B. Luật nền móng — Routing Skill

Câu luật gốc: **"Thiếu gì thì nhập vào Nhà Kho trước. Màn hình chỉ lấy từ Nhà Kho. Không vá màn hình, không tạo nguồn dữ liệu thứ hai."**

Luồng bắt buộc:
```
Sàn / API / import / browser helper / nhập tay
→ Warehouse Core / Nhà Kho Chuẩn
→ Chat / OMS / Product / Dashboard / Profit / Export / CRM chỉ đọc lại từ Warehouse
```

| Khi làm... | Dùng Skill |
|---|---|
| Warehouse / Nhà Kho / bất kỳ Core nào | `shophuyvan-warehouse-core-guard` |
| OMS / Core-first / read-model | `shophuyvan-core-first-guard` |
| Python automation / Radar / runner / Seller Center | `shophuyvan-automation-guard` |
| Label / tem / PDF / tracking / timeline | `shophuyvan-label-tracking-core-guard` |
| Chat / CSKH / conversation / AI trả lời / gửi-sync tin sàn | `shophuyvan-chat-core-guard` |
| Finance / phí / settlement / cost setting | `shophuyvan-finance-core-guard` |
| Order / status / bucket / date scan | `shophuyvan-order-core-guard` |
| Product Master / SKU / combo / variation / giá / tồn | `shophuyvan-product-core-guard` |
| ADS / quảng cáo / campaign / adgroup / bid / budget | `shophuyvan-ads-core-guard` |
| Sửa giao diện bất kỳ | `shophuyvan-ui-design-system-guard` |
| UI / UX / layout / responsive / settings panel | `shophuyvan-ui-master-prompt` |
| Giao diện vận hành / ADS UI / mobile-first | `shophuyvan-ui-end-user-guard` + `shophuyvan-ui-ux-master-skill` |
| Dọn worktree / xóa file / cleanup legacy / audit code thừa | `shophuyvan-cleanup-guard` |

Routing Core bắt buộc:
- Product/SKU/vốn/combo/purchase cost → Product/Warehouse Core.
- Order/status/bucket → Order/Status Core.
- Finance/phí/doanh thu/settlement → Finance Core.
- Tem/PDF/chứng từ → Label Core.
- Tracking/mã vận đơn/timeline → Tracking Core.
- Chat/conversation → Chat Core.
- Python runner/profile → Automation Guard.

UI chỉ render read-model từ Core, **không tự tính nghiệp vụ**. Số `0` là dữ liệu thật; `null` là thiếu dữ liệu. Không ép `null` → `0`.

---

## 0C. Marketplace Endpoint Rule — BẮT BUỘC

**Shop có API thì phải dùng API. Không được báo "thiếu endpoint" rồi dừng.**

Shops API hiện tại:
- Shopee: `chihuy1984`, `chihuy2309`, `phambich2312`
- Lazada: `kinhdoanhonlinegiasoc@gmail.com`

**Luật không được vi phạm:**
1. Thiếu endpoint → **mở Shopee/Lazada Open Platform tìm và nối vào**, không báo thiếu mà dừng.
2. Endpoint tồn tại → thêm allowlist, adapter, preview, live-write, readback, log, Core writeback.
3. Endpoint có nhưng thiếu quyền/token → ghi `api_permission_missing` hoặc `token_scope_missing`.
4. Sau khi kiểm docs mà thật sự không có endpoint → mới ghi `endpoint_not_available`.
5. Không dùng Seller Center fallback khi chưa chứng minh endpoint không tồn tại.

Profile kiểm Open Platform: `E:\codex-chrome-profiles\shophuyvan-test`

Báo cáo cuối bắt buộc ghi: endpoint đã kiểm | đã dùng | thiếu quyền | không có | lý do fallback nếu có.

---

## 0D. Project Current State Rule

Trước khi sửa code, phải đọc theo thứ tự:
1. `AGENTS.md` (file này)
2. Skill tương ứng với task (xem bảng 0B)
3. `docs/PROJECT-CURRENT-STATE.md` — bộ nhớ điều phối chính, **không làm lại phần đã chốt**
4. `docs/SHOPHUYVAN-PROJECT-SNAPSHOT.md` — bản đồ tổng thể kiến trúc, shop map, Core map

Sau mỗi lượt sửa phải cập nhật `PROJECT-CURRENT-STATE.md`: phần đã xong | phần còn mở | route/file chuẩn | deploy version | test pass/fail | lỗi còn lại | tài nguyên đã xóa | legacy cần audit | cấm kỵ mới.

Sau mỗi lượt cleanup/dọn worktree: ghi thêm docs nào đã archive, nhánh nào đã xóa, `.gitignore` đã cập nhật chưa.

---

## 0E. Automation Browser Safety

- Mọi profile automation chỉ nằm trong `E:\shophuyvan-python-automation\profiles\browser`.
- **Chrome automation phải chạy visible/headful — không `--headless`, không minimized.** Log phải ghi `headless=false`.
- **Kiểm automation thao tác phải log vào Codex browser extension. Nếu lỗi thì fix đến khi hết lỗi mới báo xong.**
- Profile automation theo sàn:
  - TikTok: `E:\shophuyvan-python-automation\profiles\browser\shophuyvan-runner-tiktok`
  - Shopee no-API: `E:\shophuyvan-python-automation\profiles\browser\HuyVan_Bot_Data_khogiadungcona`
  - Lazada manual: `E:\shophuyvan-python-automation\profiles\browser\HuyVan_Bot_Data_lazada_kinhdoanhonlinegiasoc`
- Không dùng `E:\codex-chrome-profiles\shophuyvan-test` cho automation.
- **Không `taskkill chrome.exe` toàn cục.** Chỉ đóng đúng PID do runner tạo, PID phải nằm trong lock file.
- Runner phải có: lock/PID/heartbeat/pause/stop/cooldown/retry limit/backoff/`next_retry_at`.
- TikTok không loop liên tục; chạy theo lịch nếu an toàn.
- Tách riêng: `pull_orders`, `refresh_status`, `sync_detail`, `sync_finance`, `retry_label`.
- Shop API không chạy Seller Center fallback; phải đi Open Platform/Worker API trước.

---

## 0F. Code Hygiene

Trước khi sửa: `git status`, phân biệt file đã bẩn từ trước và file sẽ sửa trong lượt này.

Không revert/xóa thay đổi cũ nếu không được yêu cầu. Không xóa file chưa rõ owner/caller.

Code cũ không chạy song song với Core mới. Sau khi sửa phải dọn file thừa liên quan trực tiếp.

Chỉ xóa file khi đã kiểm: không còn import, route registration, HTML/script load, service binding, scheduled/local helper gọi, test phụ thuộc, và `rg` toàn repo không còn caller.

**Worktree policy:** Khi bắt đầu task, nếu `git status` có file ngoài scope → stage và commit file đã hoàn chỉnh theo nhóm logic, stash file dở dang không liên quan, chỉ sau khi worktree sạch mới bắt đầu làm việc.

---

## 0G. Cloudflare Resource Cleanup

Tài nguyên production — **không được đụng nếu không có yêu cầu rõ**:
- D1: `huyvan-analytics-db`
- Worker: `huyvan-worker-api`
- Worker/static: `shophuyvan-analytics`
- Chat Worker: `shophuyvan-chat-api`
- R2: `huyvan-storage`

Nếu phát hiện tài nguyên tạo nhầm: ghi tên → chỉ xóa khi user xác nhận → list lại sau xóa → `rg` repo xóa reference → cập nhật `docs/PROJECT-CURRENT-STATE.md`.

---

## 1. Nguyên Tắc Hoàn Thành — KHÔNG ĐƯỢC VI PHẠM

**Không được báo đã xong nếu chưa kiểm tra thật.**

| Loại việc | Điều kiện "xong" |
|---|---|
| Sửa code/logic | Deploy + mở đúng màn hình + bấm đúng nút/flow vừa sửa + không còn lỗi |
| Sửa UI | Mở giao diện thật + kiểm mobile/tablet/PC + tất cả pass |
| Fix lỗi do user báo | Vào đúng chỗ báo lỗi + bấm chạy + thấy chạy được mọi tính năng + không còn lỗi |
| Automation | Log Codex extension hiện đúng từng thao tác + không còn lỗi |
| ADS live-write | Readback từ sàn khớp + ghi `ads_action_logs` + OMS production hiện đúng |
| Deploy | `wrangler whoami` khớp profile + kiểm production thật |

**Khi sửa UI:** phải mở giao diện thật, kiểm mobile first → tablet → PC. Không pass nếu bất kỳ thiết bị nào còn lỗi layout/tràn ngang/khó bấm.

---

## 2. Chrome Profile

Không dùng profile mặc định. Không dùng lẫn profile giữa các project.

| Profile | Path | Dùng cho |
|---|---|---|
| ShopHuyVan chính | `E:\codex-chrome-profiles\shophuyvan-test` | OMS, admin web, ShipXanh, GitHub SHV, Cloudflare SHV, Shopee/Lazada Open Platform |
| Facebook CRM | `E:\codex-chrome-profiles\fbshv-meta` | Facebook CRM, Meta tools, GitHub FBSHV, Cloudflare FBSHV |

Nếu profile chưa đăng nhập → dừng, yêu cầu user đăng nhập thủ công.

---

## 2A. Auth Profile — Đa Dự Án

Secret local: `profiles.local.json` — chỉ trên máy local, không commit, không log token.

| Profile name | GitHub | Repo | Project path | CF account |
|---|---|---|---|---|
| DuAn_shophuyvan-analytics | `skymax2309` | `skymax2309/shophuyvan-analytics` | `E:\shophuyvan-analytics` | `efe50fab1dd644088d681fb14a4838ae` |
| DuAn_FBSHV_CRM | `FacebookSHV` | `FacebookSHV/FBSHV-CRM` | `E:\FBSHV-CRM` | `3d1e8c3bd1f4f9ace7388e60dd11fbed` |
| DuAn_shophuyvan.vn | `shophuyvan` | `shophuyvan/shophuyvan` | `E:\WEB\website shop huy van\shophuyvan` | `7f99645b54f99e54fbdc5189dc6309d1` |
| shophuyvan-chat-api | `shophuyvan-chat` | `skymax2309/shophuyvan-analytics` (mono-repo) | `E:\shophuyvan-analytics\apps` | `39cf0fe9b3eda88bda53e369770cabeb` |

Trước khi deploy phải xác định profile theo thứ tự:
1. So khớp CWD với `project_path` / `wrangler_path`.
2. So khớp `git remote -v` với `git_repo`.
3. Nếu mơ hồ → dừng và hỏi user.

Token Cloudflare chỉ đọc từ `profiles.local.json`, set vào env process hiện tại. Sau đó kiểm:
```bash
npx wrangler whoami
```
Nếu lỗi auth hoặc account id không khớp → **dừng deploy**.

Trước mỗi push/deploy:
```bash
git remote -v && git branch --show-current && git config user.name && git config user.email
```

---

## 2B. Encoding UTF-8

Mọi file phải UTF-8. Nếu thấy `Ã`, `áº`, `Ä`, `â€` → file bị mojibake, dừng không commit.

PowerShell: `chcp 65001` trước khi làm việc với file tiếng Việt.

Kiểm sau khi sửa: `rg "Ã|áº|Ä" --type md --type js --type html --type py`

---

## 2C. Deploy Chat/CSKH

Chat là service riêng — Worker `shophuyvan-chat-api`, D1 `shophuyvan-chat-db`, R2 `shophuyvan-chat-files`.

Không deploy Chat bằng profile Worker chính. Không deploy Worker chính khi chỉ làm Chat.

Khi path mơ hồ: `apps/chat-worker-api`, `apps/chat-admin-ui`, `apps/fe/js/dashboard/chat`, `/api/chat/*` → profile `shophuyvan-chat-api`. Còn lại → profile `DuAn_shophuyvan-analytics`.

Sau deploy Chat phải kiểm thật: mở Chrome `shophuyvan-test` → gửi tin an toàn → không duplicate → trạng thái đúng → kiểm mobile/tablet/PC.

---

## 3. Tách Project ShopHuyVan / Facebook CRM

2 project khác nhau, **không bao giờ deploy lẫn**.

Facebook CRM chỉ đọc ShopHuyVan qua External API `https://huyvan-worker-api.nghiemchihuy.workers.dev/api/external/*`. Không tự copy Product Master, không tự quyết giá cuối, không tự trừ tồn.

---

## 4. Deploy & Kiểm Thật

Sau sửa code:
1. `node --check` / `python -m py_compile` tương ứng.
2. Deploy đúng phần bị ảnh hưởng (Pages/static hoặc Worker API).
3. **Mở web thật → bấm nút thật → xem kết quả thật.**
4. Báo: đã sửa gì | deploy phần nào | kiểm tra thực tế gì | kết quả | phần chưa kiểm và lý do.

**Không được báo ổn định nếu mới test local.**

---

## 5. UI Responsive

Mọi giao diện mới hoặc sửa phải pass **mobile → tablet → PC**.

- Mobile first. Dễ bấm, chữ rõ, nút đủ lớn, không tràn ngang.
- Mobile: card/list thay table. Tablet: table co giãn hoặc scroll ngang rõ. PC: table đầy đủ.
- Bảng số liệu phải căn phải/tabular. Badge phải nói vấn đề thật. Action phải là nút riêng.
- Không lạm dụng tooltip/icon `?`.
- Tham khảo ShipXanh bằng profile `shophuyvan-test` khi cần chuẩn UI.
- **Không báo UI pass nếu chưa kiểm đủ desktop/tablet/mobile.**

Chi tiết token/color/spacing/UX: đọc Skill `shophuyvan-ui-master-prompt` và `shophuyvan-ui-design-system-guard`.

---

## 6. ADS UI — Vận Hành Ra Quyết Định

ADS UI phải theo hướng vận hành, **không hiển thị module kỹ thuật**.

Người dùng mở màn hình phải thấy ngay: tổng chi ADS kỳ này, hiệu quả tổng (ROAS/ACOS/lãi sau ADS), SKU nào cần giảm/dừng + lý do, nút hành động rõ.

Không được render: `payload`, `endpoint`, `route`, `request_id`, `cache`, `guard`, `read-model`, `Core`, `raw response`, `JSON`.

Chi tiết ADS Core contract/live-write: đọc Skill `shophuyvan-ads-core-guard`.

---

## 7. Finance Core

Mọi luồng phải dùng cùng nguồn số liệu:
```
API sàn → Finance Core chuẩn hóa → Snapshot D1 → Dashboard/OMS/Chat/Profit/Export đọc lại
```

Giá vốn **không phải số cố định theo SKU**. Mỗi lần nhập tạo lô có `landed_cost_per_unit` riêng. Warehouse Core tính `current_cost` theo tồn còn lại.

Taxonomy bắt buộc:
- `shop_discount` không thuộc `Phí sàn`.
- `marketplace_fee_total` chỉ gồm khoản sàn thu.
- `actual_income` / settlement: không trừ lại phí đã nằm trong settlement; chỉ trừ giá vốn, ADS, PiShip, phí ngoài ví.
- Số `0` là dữ liệu thật; `null` là thiếu. Không ép missing thành `0`.
- Shop có API → dùng số liệu API. Shop chưa có API → fallback cost setting, UI phải hiện badge `Fallback`/`Estimated`.
- Nếu số liệu lệch giữa các trang → sửa Core trước, không patch riêng từng page.

Chi tiết taxonomy/fee-breakdown/TikTok settlement: đọc Skill `shophuyvan-finance-core-guard`.

---

## 8. Product Master

Product/SKU/giá/tồn/combo/ảnh/trạng thái phải đi qua Product Master.

```
API sàn / import / nhập tay → Product Master → Snapshot D1 → Dashboard/OMS/Chat/Facebook CRM đọc lại
```

Facebook CRM chỉ đọc qua `/api/external/*`, không tự quyết giá cuối, không tự trừ tồn.

Nếu SKU/giá/tồn lệch → sửa Product Master trước. Chi tiết: Skill `shophuyvan-product-core-guard`.

---

## 9. Shop API vs Shop Không API

Tách luồng ngay từ đầu — không dùng chung một luồng mơ hồ.

**Shop có API:** ưu tiên API, lưu snapshot, hiển thị source rõ. Thiếu endpoint → tra Open Platform, không báo thiếu mà dừng.

**Shop không có API:** dùng luồng riêng (import/browser helper/thao tác tay/cost setting). Không gắn nhãn "đồng bộ API" cho shop chưa có API.

Mọi màn hình phải hiện rõ shop đang ở chế độ nào.

---

## 10. Marketplace Endpoint Checklist

Sau mỗi phase Shopee/Lazada/TikTok, cập nhật bắt buộc:
- `docs/marketplace-endpoint-progress.md`

Phải ghi: trạng thái đã xong/đang làm/chưa làm/bị khóa | shop có API làm được gì | shop không API fallback thế nào | bước tiếp theo.

Không được chỉ báo trong chat mà không cập nhật repo.

---

## 11. Chat Sàn

Chat là luồng vận hành chính — không chấp nhận "loading mãi, lâu lâu mới lên".

Mỗi shop/kênh chat phải có đủ:
- `shop_chat_mode`: `api` / `browser_helper` / `manual` / `disabled`
- `send_capability`: `official_api` / `bridge` / `manual_only` / `none`
- `sync_capability`: `webhook` / `polling_api` / `browser_helper` / `manual_import` / `none`

Gửi tin phải append ngay với `status=sending`, lưu DB trước, gọi adapter sau. Chỉ ghi `sent` khi API/bridge trả thành công thật.

AI auto-send chỉ bật khi `send_capability = official_api` hoặc `bridge` và có rule an toàn đã verify production.

Chi tiết Chat Core/sync/duplicate/AI an toàn: đọc Skill `shophuyvan-chat-core-guard`.

---

## 12. Cấu Trúc Code

| Phần | Vị trí |
|---|---|
| Frontend tĩnh | `apps/fe/` — pages: `apps/fe/pages`, logic: `apps/fe/js/dashboard|modules|admin` |
| Worker API | `apps/worker-api/` — routes: `src/routes`, DB helper: `src/utils`, Core: `src/core` |
| Chat Worker | `apps/chat-worker-api/` |
| Python automation | `E:\shophuyvan-python-automation\oms_python` — không tạo Python mới trong repo chính |

Frontend chỉ hiển thị và gọi API. Backend/Core giữ nghiệp vụ và chuẩn hóa.

---

## 12A. Giới Hạn Kích Thước File — BẮT BUỘC

**Mọi file JS/TS/Python/Worker không được vượt 30KB.**

| Tình huống | Hành động bắt buộc |
|---|---|
| File đang tạo mới sắp vượt 30KB | Phải tách thành module nhỏ hơn ngay |
| File hiện có đã vượt 30KB | Phải tách trong cùng phạm vi đang sửa, không để nợ |
| Không biết tách theo hướng nào | Tách theo nhóm chức năng: core logic / UI handlers / API calls / helpers |

Kiểm sau mỗi lần tạo/sửa file lớn:
```bash
find apps -name "*.js" -size +30k -not -path "*/node_modules/*"
```

File vượt 30KB **không được commit** nếu chưa tách. Ngoại lệ: file generated tự động phải ghi `// generated, do not edit`.

---

## 12B. Tổ Chức Folder

File thuộc tính năng nào thì nằm trong folder của tính năng đó.

Luật áp dụng:
1. Nếu có ≥ 2 file cùng prefix (`sku-*`, `var-*`, `chat-*`...) → phải có folder riêng chứa chúng.
2. Khi tạo file mới, kiểm xem đã có folder tính năng tương ứng chưa. Có rồi → bỏ vào đó. Chưa → tạo folder trước.
3. Khi sửa file trong một tính năng → dọn file rác cùng tính năng còn nằm ngoài folder nếu phạm vi cho phép.
4. Không tạo "wrapper mỏng" chỉ để import rồi re-export.
5. Không để file debug/test/generated lẫn vào folder production.

---

## 13. Báo Cáo Cuối Mỗi Lần Làm

Không được chỉ nói "đã xong" chung chung. Phải ghi:

1. Đã làm được gì / đang khóa gì.
2. Shop có API chạy theo cách nào / shop không API fallback thế nào.
3. Endpoint đã kiểm | đã dùng | thiếu quyền | không có.
4. Deploy môi trường nào / version nào.
5. Đã kiểm mobile/tablet/PC thật chưa — kết quả.
6. Còn thiếu endpoint/quyền gì.
7. Bước tiếp theo.

---

## 14. Quy Tắc Dữ Liệu Bẩn

Nếu phát hiện dữ liệu bẩn/lệch/trùng → ưu tiên làm sạch trước rồi mới tiếp tục. Không để nợ kéo dài.

Khi làm sạch phải ghi: nguyên nhân | phạm vi shop/sàn | cách làm sạch | đã sửa thật gì | chờ xử lý tiếp gì.

---

## 15. Tính Năng Mới — Tư Vấn Trước

Với tính năng ảnh hưởng rộng (finance, chat, AI auto-reply, automation, kiến trúc): đưa ra nhiều phương án (ưu/nhược/request/rủi ro/maintain) và **hỏi/chốt với user trước khi làm**.

Luôn ưu tiên: một Core chuẩn hóa → một nơi đồng bộ → nhiều màn hình chỉ đọc lại.

---

## 16. Tạo Skill Mới

Tạo Skill khi: quy trình dùng lại ≥ 2 lần, nội dung dài hơn 30 dòng, không phải luật gốc.

Skill phải có: `SKILL.md`, điều kiện tự kích hoạt, checklist báo cáo cuối nếu workflow cần, test/browser verification nếu liên quan code/deploy.

Không đưa vào Skill: secret/token/cookie/session, dữ liệu tạm, trạng thái login, nội dung chưa ổn định.

Sau khi tạo Skill → thêm một dòng tham chiếu vào `AGENTS.md`, xóa nội dung chi tiết khỏi đây.

---

## 17. Mode Gọi Nhanh (Không cần nhớ tên kỹ thuật)

User chỉ cần nói theo "loại việc", Codex tự map skill + agent phù hợp.

| User nói | Codex map |
|---|---|
| "Sửa UI", "bố cục", "responsive", "mobile" | UI mode: `shophuyvan-ui-design-system-guard` + `shophuyvan-ui-master-prompt` + `shophuyvan-ui-end-user-guard` |
| "OMS/Core/read-model", "order/status/bucket" | Core mode: `shophuyvan-core-first-guard` + `shophuyvan-order-core-guard` |
| "Product/SKU/combo/giá/tồn" | Product mode: `shophuyvan-product-core-guard` + `shophuyvan-warehouse-core-guard` |
| "Finance/phí/settlement/profit" | Finance mode: `shophuyvan-finance-core-guard` + `shophuyvan-warehouse-core-guard` |
| "Chat/CSKH/conversation/sync" | Chat mode: `shophuyvan-chat-core-guard` + `shophuyvan-core-first-guard` |
| "ADS/campaign/bid/budget" | ADS mode: `shophuyvan-ads-core-guard` + `shophuyvan-ui-end-user-guard` |
| "Automation/runner/cron/browser helper" | Automation mode: `shophuyvan-automation-guard` |
| "Kiểm tra API/endpoint/docs trước" | API-doc mode: docs_researcher trước, implement sau |
| "Review trước deploy" | Review mode: security-review + verification-loop |
| "Dọn code/cleanup/worktree" | Cleanup mode: `shophuyvan-cleanup-guard` |
| "Tiếp tục việc đang dở/handoff" | Đọc `PROJECT-CURRENT-STATE.md` trước, sau đó tiếp tục |

Mẫu lệnh nhanh:
- `"UI mode + Review mode cho task này"`
- `"Core mode cho OMS, sau đó Review mode"`
- `"API mode trước, xong mới implement"`
- `"Cleanup mode, dọn worktree sạch"`

---

## 18. ECC Hook Bridge — Auto Chạy Mọi Task Sửa Code

Script:
- `C:\Users\Admin\.codex\scripts\ecc-hook-bridge\run-ecc-mode.ps1`

**Bắt buộc chạy 3 pha cho mọi task có sửa code** (không cần user nhắc):

```powershell
# 1. Trước khi sửa file
powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\Admin\.codex\scripts\ecc-hook-bridge\run-ecc-mode.ps1 -Mode before-edit -RepoPath <repo-path> -Profile standard

# 2. Sau khi sửa file
powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\Admin\.codex\scripts\ecc-hook-bridge\run-ecc-mode.ps1 -Mode after-edit -RepoPath <repo-path> -Profile standard

# 3. Trước khi báo xong/deploy
powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\Admin\.codex\scripts\ecc-hook-bridge\run-ecc-mode.ps1 -Mode before-final -RepoPath <repo-path> -Profile standard
```

Profile: `minimal` (cảnh báo nhẹ) | `standard` (chặn secret-like pattern) | `strict` (chặn thêm debugger/console.log).

Nếu `before-edit` hoặc `before-final` trả về non-zero → **dừng**, báo cáo finding, xin hướng xử lý trước khi tiếp tục.
