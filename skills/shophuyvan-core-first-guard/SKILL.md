---
name: shophuyvan-core-first-guard
description: Guard chung cho ShopHuyVan Core-first work. Dùng trước mọi task OMS/Core/read-model liên quan đến Product/SKU/vốn/combo, Order/status/bucket, Finance/phí/settlement/cost setting, Label/PDF, Tracking/timeline, Chat/conversation, ADS/Promotion, hoặc Python runner/action routing để đảm bảo business logic nằm trong Core và UI chỉ render read-model fields.
---

# Shophuyvan Core First Guard

## Đọc bắt buộc trước khi sửa

Đọc theo thứ tự — không bỏ qua:

1. `AGENTS.md`
2. Skill tương ứng với domain đang sửa (xem bảng Domain Routing bên dưới)
3. `docs/PROJECT-CURRENT-STATE.md`
4. `docs/warehouse-core-map.md`, `docs/core-data-map.md`
5. Nếu task liên quan endpoint sàn → đọc thêm `docs/marketplace-endpoint-master-checklist.md`, `docs/marketplace-endpoint-progress.md`
6. Feature docs/checklist của domain đang được động vào

---

## Domain routing

| Domain | Thuộc Core | Skill đọc thêm |
|---|---|---|
| Product / SKU / vốn / combo map / purchase cost / mapping | Product Core / Warehouse Core | `shophuyvan-product-core-guard`, `shophuyvan-warehouse-core-guard` |
| Order / status / bucket / OMS processing | Order Core / Status Core | `shophuyvan-order-core-guard` |
| Finance / phí / doanh thu / settlement / cost setting | Finance Core | `shophuyvan-finance-core-guard` |
| Tem / PDF / chứng từ in | Label Core | `shophuyvan-label-tracking-core-guard` |
| Tracking / mã vận đơn / timeline | Tracking Core | `shophuyvan-label-tracking-core-guard` |
| Chat / conversation / send target | Chat Core | `shophuyvan-label-tracking-core-guard` |
| ADS / campaign / budget / ROAS / automation ADS | ADS Core | `shophuyvan-ads-core-guard` |
| Khuyến mãi / Discount / Voucher / Flash Sale / Bundle / Add-On | Promotion Core | `shophuyvan-ads-core-guard` |
| Python / local runner / profile / action routing | — | `shophuyvan-automation-guard` |
| Sửa giao diện bất kỳ | — | `shophuyvan-ui-design-system-guard`, `shophuyvan-ui-end-user-guard`, `shophuyvan-ui-ux-master-skill` |

---

## UI chỉ được render read-model

UI chỉ render field từ Core read-model và gọi read endpoint. UI không được tự tính:

- business status, OMS bucket
- finance, cost/mapping
- label status, tracking status
- chat target
- ADS classification, promotion status

Nếu UI cần một field mới → thêm vào đúng Core/read-model trước, rồi mới render.

---

## Marketplace endpoint rule

**Shop có API phải dùng API. Không được báo "thiếu endpoint" rồi dừng.**

| Tình huống | Hành động bắt buộc |
|---|---|
| Thiếu endpoint | Mở Shopee/Lazada Open Platform tìm và nối vào — không báo thiếu mà không làm |
| Endpoint tồn tại | Thêm allowlist → adapter → preview → live-write → readback → log → Core writeback |
| Endpoint có nhưng thiếu quyền | Ghi `api_permission_missing` hoặc `token_scope_missing` |
| Kiểm docs xong, thật sự không có | Ghi `endpoint_not_available` |
| Chưa chứng minh endpoint không tồn tại | Không được dùng Seller Center fallback |

Báo cáo cuối bắt buộc ghi: endpoint đã kiểm | đã dùng | thiếu quyền | không có | lý do fallback nếu có.

---

## Shop API vs shop không có API

Tách luồng ngay từ đầu — không dùng chung một luồng mơ hồ.

**Shop có API:** ưu tiên API, lưu snapshot, hiển thị source rõ. Thiếu endpoint → tra Open Platform, không báo thiếu mà dừng.

**Shop không có API:** dùng luồng riêng (import / browser helper / thao tác tay / cost setting). Không gắn nhãn "đồng bộ API" cho shop chưa có API. UI phải hiện rõ badge `Fallback` / `Estimated`.

Mọi màn hình phải hiện rõ shop đang ở chế độ nào.

---

## Thứ tự ưu tiên nguồn dữ liệu

API/Seller Center/parser/import là nguồn gốc — phải ghi vào Core.

Cost setting chỉ là fallback khi Core readback trả rõ **cả ba điều kiện**:
- `finance_source=cost_setting_fallback`
- `finance_confidence=estimated`
- `finance_needs_resync=true` và `finance_sync_status` là fallback/estimated

Cost setting **không được ghi đè** dữ liệu API/Seller Center.

---

## Quy tắc zero / null

- `0` là dữ liệu thật khi nguồn trả về `0` — giữ nguyên source/confidence là "observed zero".
- `null` nghĩa là thiếu dữ liệu — không được che bằng `|| 0`.
- Không dùng `value || 0`, `Number(value || 0)`, hoặc copy field khác để ẩn missing trong finance/cost read-model.

---

## Quy tắc marketplace status

Không diễn giải sai trạng thái API. Giữ nguyên trạng thái sàn trả về trong `marketplace_status` hoặc raw platform status. Sửa diễn giải sai ở các bucket/field của OMS:

- `oms_processing_bucket`
- `label_sync_status`
- `tracking_sync_status`
- `finance_sync_status`

---

## Giới hạn file size — bắt buộc

**Mọi file JS/TS/Python/Worker không được vượt 30KB.**

| Tình huống | Hành động |
|---|---|
| File đang tạo mới sắp vượt 30KB | Tách thành module nhỏ hơn ngay, không tạo file to trước rồi tách sau |
| File hiện có đã vượt 30KB | Tách trong cùng phạm vi đang sửa, không để nợ |
| Không biết tách theo hướng nào | Tách theo nhóm chức năng: core logic / UI handlers / API calls / helpers |

Kiểm sau mỗi lần tạo/sửa file lớn:
```bash
find apps -name "*.js" -size +30k -not -path "*/node_modules/*"
```

File vượt 30KB không được merge/commit nếu chưa tách. Ngoại lệ duy nhất: file generated tự động — ghi chú rõ `// generated, do not edit`.

---

## Quy tắc dọn code thừa

Code thừa, file thừa, route thừa, helper thừa và fallback thừa phải xóa sau khi đã `rg` production/test/docs/job/action caller.

- Caller còn active nhưng đi sai Core → sửa caller đi qua đúng Core/read-model trước, rồi xóa đường cũ.
- Không giữ legacy fallback chạy song song sau khi Core path đã verified.

---

## Quy tắc regression / readback

Mỗi Core fix phải có regression test hoặc script nêu rõ:

- field bị lỗi
- source và expected value
- trạng thái missing/fail
- readback path để xác nhận

Không dùng ngôn ngữ mơ hồ: "nếu có", "có thể", "nên kiểm" trong prompt, test hoặc báo cáo cuối.

---

## Cổng kiểm tra production

### Với OMS/Core fix

Sau khi deploy, bắt buộc:

- [ ] Mở OMS production bằng đúng Chrome profile
- [ ] Thao tác đúng màn hình/nút/flow bị lỗi
- [ ] Đọc lại Core và OMS read-model
- [ ] Production UI không còn tái hiện lỗi
- [ ] Kiểm mobile/tablet/desktop — tất cả pass

Pass code/test/build/deploy/log chưa đủ — phải pass production UI.

### Với automation/Radar/local runner/job queue

- [ ] Web/Radar tạo job
- [ ] `/api/jobs` lưu đúng payload
- [ ] Runner nhận job id và route đúng `action_type`
- [ ] Python/API/browser path chạy thật
- [ ] Script ghi log tiến trình với business summary
- [ ] Job kết thúc: `completed`, `completed_no_change`, `failed`, `runner_timeout`, hoặc `runner_requires_login`
- [ ] Core readback xác nhận đúng
- [ ] OMS production hiển thị đúng

`queued` hoặc `running` không được tính là pass.

### Với flow cần browser marketplace

- Chrome phải chạy visible/headful bằng đúng profile automation
- Không chạy headless khi đang xác nhận lỗi production
- Log phải ghi `headless=false`

---

## Quy tắc dọn code

- File/helper automation thừa, không còn caller active trong production/test/docs/job/action → xóa sau khi audit bằng `rg`.
- Caller còn active nhưng đang đi vòng qua Core → route caller ghi/đọc Core trước, rồi xóa đường cũ.

---

## Checklist báo cáo cuối

Báo cáo cuối bắt buộc nêu:

- Core nào sở hữu lỗi
- Field read-model nào thay đổi
- Regression test nào đã khóa lại
- Core/OMS readback nào đã chạy
- Endpoint đã kiểm | đã dùng | thiếu quyền | không có | lý do fallback
- File nào vượt 30KB chưa tách (nếu có)
- Production desktop/tablet/mobile đã pass chưa