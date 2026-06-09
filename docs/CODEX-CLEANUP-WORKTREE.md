# CODEX TASK — Dọn sạch Worktree ShopHuyVan

> Gửi file này cho Codex Desktop. Đọc hết trước khi chạy lệnh nào.
> Skill tham chiếu: `shophuyvan-cleanup-guard` (nếu có trong repo).

---

## Mục tiêu

Dọn sạch worktree repo `shophuyvan-analytics` để bắt đầu lại gọn gàng:
- Xóa file rác, build output, untracked không cần thiết
- Xóa nhánh cũ không dùng
- Đặt `.gitignore` đúng một lần cho hệ thống
- Chốt workflow commit chuẩn từ giờ trở đi

**Không được:** xóa code đang chạy production, xóa file config có secret, xóa docs còn dùng.

---

## Bước 0 — Đọc trạng thái, KHÔNG làm gì khác

Chạy các lệnh sau và **chỉ báo cáo**, chưa thay đổi gì:

```bash
# 1. Nhánh hiện tại và tất cả nhánh local
git branch -a

# 2. Trạng thái working tree
git status

# 3. 20 commit gần nhất
git log --oneline -20

# 4. File untracked / ignored lớn (xem trước khi xóa)
git clean -ndx
```

Từ output trên, lập danh sách:
- Nhánh nào đang có, nhánh nào là `main`/`master`
- File untracked nào quan trọng (`.env`, config local) cần giữ lại
- File untracked nào là rác (build output, cache, `node_modules`)

**Dừng lại, báo cáo danh sách này trước khi sang Bước 1.**

---

## Bước 1 — Tạo checkpoint an toàn

Trước khi dọn bất cứ thứ gì, commit tất cả file đang dở:

```bash
# Commit toàn bộ thay đổi hiện tại (kể cả WIP)
git add -A
git commit -m "chore: checkpoint before cleanup $(date +%Y%m%d)"

# Push lên remote để có backup
git push
```

Sau bước này nếu có gì sai vẫn `git reset --hard HEAD~1` về được.
**Xác nhận push thành công rồi mới sang Bước 2.**

---

## Bước 2 — Kiểm tra và cập nhật `.gitignore`

Đọc file `.gitignore` hiện tại. Đảm bảo có đủ các mục sau cho ShopHuyVan:

```gitignore
# Dependencies
node_modules/
.pnp
.pnp.js

# Build outputs
dist/
build/
.wrangler/
.output/

# Environment & secrets
.env
.env.local
.env.*.local
*.local.json
profiles.local.json
wrangler.local.toml

# Runtime / cache
.cache/
*.log
npm-debug.log*

# Python automation
__pycache__/
*.pyc
*.pyo
.venv/
venv/

# OS
.DS_Store
Thumbs.db
desktop.ini

# Editor
.vscode/settings.json
.idea/
*.swp

# Test artifacts
coverage/
*.snap

# Cloudflare local dev
.dev.vars
```

Nếu `.gitignore` thiếu mục nào trong danh sách trên thì thêm vào, commit riêng:

```bash
git add .gitignore
git commit -m "chore: update .gitignore for shophuyvan stack"
```

---

## Bước 3 — Dọn file rác

```bash
# Xem lại lần cuối những gì sẽ bị xóa
git clean -ndx

# Xác nhận danh sách ổn → xóa thật
# Lưu ý: -x xóa cả file bị .gitignore (node_modules, dist, .wrangler)
git clean -fdx
```

> **Ngoại lệ bắt buộc — KHÔNG xóa:**
> - `.env` hoặc bất kỳ file có secret/token
> - `profiles.local.json`, `wrangler.local.toml`, `browser_helper.local.json`
> - File `*.local.*` chứa config local machine
> - Thư mục `E:\shophuyvan-python-automation\` (nằm ngoài repo, không liên quan)
>
> Nếu các file trên chưa có trong `.gitignore` thì **thêm vào trước**, commit, rồi mới chạy `clean`.

---

## Bước 4 — Dọn nhánh cũ

```bash
# Xem nhánh nào đã merge vào main
git branch --merged main

# Xóa toàn bộ nhánh đã merge (trừ main/master)
git branch --merged main \
  | grep -v "^\*\|main\|master" \
  | xargs -r git branch -d

# Xem nhánh chưa merge còn lại
git branch --no-merged main
```

Với nhánh chưa merge, **không tự xóa** — liệt kê ra và hỏi:
> "Còn các nhánh chưa merge sau: [danh sách]. Bạn có muốn xóa nhánh nào không?"

Chỉ xóa nhánh được xác nhận tường minh:
```bash
git branch -D ten-nhanh-cu
```

---

## Bước 5 — Dọn remote tracking cũ

```bash
# Xóa remote tracking branch đã bị xóa trên origin
git remote prune origin

# Xác nhận remote còn lại
git remote -v
```

---

## Bước 6 — Commit cuối + verify sạch

```bash
# Kiểm tra working tree phải sạch
git status

# Phải trả về: "nothing to commit, working tree clean"

# Xem log sau cleanup
git log --oneline -10

# Push lên remote
git push
```

---

## Bước 7 — Đặt workflow chuẩn từ giờ trở đi

Tạo file `docs/GIT-WORKFLOW.md` với nội dung sau:

```markdown
# Git Workflow — ShopHuyVan

## Nhánh

- `main` — production, luôn deploy được, không commit thẳng khi đang sửa lớn
- `fix/ten-viec` — tạo khi sửa bug hoặc tính năng, xóa sau khi merge

## Commit message

Dùng prefix ngắn:

| Prefix | Khi nào |
|---|---|
| `feat:` | Thêm tính năng mới |
| `fix:` | Sửa bug |
| `chore:` | Dọn code, update deps, không ảnh hưởng tính năng |
| `deploy:` | Ghi nhận version đã deploy production |
| `docs:` | Cập nhật tài liệu |

Ví dụ:
- `feat: Chat AI Phase 4 countdown/cancel shell`
- `fix: Flash Sale timeslot default params`
- `deploy: chat-worker 681fc9c6 verified production`
- `chore: cleanup legacy chat routes`

## Thói quen hàng ngày

Cuối mỗi phiên làm việc:

```bash
git add -A
git commit -m "chore: wip [mô tả ngắn]"
git push
```

Sau khi deploy production verify xong:

```bash
git commit -m "deploy: [worker-name] [version] verified"
git push
```

## Không được

- Không commit `.env`, `*.local.json`, `profiles.local.json`
- Không commit `node_modules/`, `dist/`, `.wrangler/`
- Không force push lên `main` khi chưa có backup checkpoint
```

Commit file này:

```bash
git add docs/GIT-WORKFLOW.md
git commit -m "docs: add git workflow guide"
git push
```

---

## Báo cáo cuối — Codex phải trả về

Sau khi hoàn thành, báo cáo đủ các mục:

```
CLEANUP REPORT
==============
Checkpoint commit: [hash]
.gitignore: [đã cập nhật / đã đúng rồi]
File đã xóa: [số lượng / danh sách loại]
Nhánh đã xóa: [danh sách]
Nhánh giữ lại: [danh sách]
Remote prune: [số remote tracking đã xóa]
Working tree sau cleanup: [clean / còn gì]
Push thành công: [yes/no]
Workflow file: [đã tạo / đã có rồi]

CẢNH BÁO (nếu có):
- [file nào không xóa được và lý do]
- [nhánh nào chưa merge cần xác nhận]
```

---

## Quy tắc an toàn cho Codex

1. **Bước 0 trước tiên** — báo cáo trạng thái, không làm gì khác.
2. **Bước 1 bắt buộc** — checkpoint commit + push xong mới dọn.
3. **Không xóa file có từ** `secret`, `key`, `token`, `local`, `.env` trong tên.
4. **Không xóa nhánh chưa merge** mà không hỏi trước.
5. **Không force push**, không rebase public history trên `main`.
6. **Dừng và hỏi** nếu `git clean` trả về file lạ không nhận ra.
7. **Không sửa code** trong lượt này — chỉ dọn Git, không thêm tính năng.
