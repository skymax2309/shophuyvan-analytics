# Git Workflow - ShopHuyVan

## Branch

- `main`: production, chỉ nhận thay đổi đã kiểm tra.
- `codex/<ten-viec>`: nhánh mặc định cho bug, tính năng hoặc refactor có phạm vi rõ.
- Không force-push `main`.

## Trước Khi Sửa

```powershell
git status --short
git remote -v
git branch --show-current
git config user.name
git config user.email
```

Nếu worktree có thay đổi ngoài phạm vi, ghi nhận owner và không revert, stage hoặc stash khi chưa được xác nhận.

## Stage Và Commit

Ưu tiên stage đúng file thuộc một nhóm logic:

```powershell
git add path/to/file-1 path/to/file-2
git diff --cached --stat
git diff --cached --check
git commit -m "fix: mo ta ngan"
```

Chỉ dùng `git add -A` cho checkpoint toàn bộ worktree khi user yêu cầu rõ và đã xác nhận file secret/local được `.gitignore` bảo vệ.

Prefix commit:

| Prefix | Dùng khi |
|---|---|
| `feat:` | Thêm tính năng |
| `fix:` | Sửa lỗi |
| `refactor:` | Đổi cấu trúc, không đổi hành vi |
| `chore:` | Cleanup, dependency, tooling |
| `docs:` | Tài liệu |
| `deploy:` | Ghi nhận version đã deploy và verify |

## Secret Và Runtime

Không commit:

- `.env*`, `.dev.vars`, `profiles.local.json`, `wrangler.local.toml`
- `node_modules/`, `.wrangler/`, `__pycache__/`
- `artifacts/`, `.playwright-mcp/`, `tmp-*`, log và screenshot debug
- Backup/schema SQL local

SQL migration chuẩn phải nằm trong:

- `apps/worker-api/migrations/`
- `docs/migrations/`
- `docs/audits/`

Runtime artifact cần giữ tạm phải chuyển sang `E:\shophuyvan-runtime`, không để trong repo.

## Trước Khi Push

```powershell
git diff --cached --check
git status --short
git log -1 --oneline
git push origin <branch>
```

Với thay đổi code, phải chạy ECC Hook Bridge, test/syntax check liên quan và cập nhật `docs/PROJECT-CURRENT-STATE.md`.
