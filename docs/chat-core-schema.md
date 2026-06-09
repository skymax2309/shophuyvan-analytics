# Chat Core Schema

Ngày lập: 2026-05-18

## Read-state invariant 2026-05-27

- `unread_count` là trạng thái vận hành của Chat Core. Message khách chỉ tăng unread khi được tạo mới trong Core; polling/webhook/browser readback trùng không được cộng lại.
- Khi nhân viên mở hội thoại, `POST /api/chat/conversations/:id/read` đặt `unread_count=0`. Sync sau đó phải giữ `0` cho đến khi có message khách mới thật sự.
- `last_message_text` và `last_message_at` chỉ được cập nhật bởi message có thời điểm bằng hoặc mới hơn tin cuối hiện lưu; lịch sử đồng bộ lại không được làm lùi danh sách hội thoại.

## Nguyên tắc

Chat/CSKH dùng một schema chung cho Shopee, Lazada, TikTok, Facebook, Zalo và internal. Frontend không tự cộng/trộn message riêng theo từng sàn; mọi route đọc/ghi qua Chat Core.

## Message chuẩn

```json
{
  "id": "",
  "channel": "shopee",
  "shop_id": "",
  "conversation_id": "",
  "customer_id": "",
  "sender_type": "customer",
  "sender_name": "",
  "text": "",
  "attachments": [],
  "status": "synced",
  "platform_message_id": "",
  "client_temp_id": "",
  "reply_to_message_id": "",
  "order_id": "",
  "product_ids": [],
  "created_at": "",
  "updated_at": "",
  "source": "",
  "raw_payload_ref": ""
}
```

### Field bắt buộc

| Field | Quy tắc |
|---|---|
| `id` | ID nội bộ của Chat Core, không phụ thuộc ID sàn |
| `channel` | `shopee`, `lazada`, `tiktok`, `facebook`, `zalo`, `internal` |
| `shop_id` | Khóa shop trong hệ thống ShopHuyVan, không mượn shop khác |
| `conversation_id` | ID hội thoại chuẩn trong Chat Core |
| `customer_id` | ID khách chuẩn hóa, có thể là platform buyer/user id |
| `sender_type` | `customer`, `shop`, `ai`, `system` |
| `sender_name` | Tên hiển thị đã lọc an toàn |
| `text` | Nội dung text sau normalize, không lưu payload lớn |
| `attachments` | Mảng metadata/link R2, không lưu file trực tiếp trong D1 |
| `status` | `sending`, `sent`, `failed`, `synced`, `deleted`, `manual_pending`, `queued_for_browser_helper` |
| `platform_message_id` | ID message từ sàn/API, dùng chống trùng chính |
| `client_temp_id` | ID frontend tạo trước khi gửi, dùng merge optimistic |
| `reply_to_message_id` | ID message được trả lời nếu có |
| `order_id` | ID đơn liên quan nếu đã link |
| `product_ids` | Danh sách sản phẩm liên quan |
| `created_at` | ISO datetime |
| `updated_at` | ISO datetime |
| `source` | `api`, `webhook`, `manual`, `automation`, `ai_suggestion`, `internal` |
| `raw_payload_ref` | Key R2 hoặc raw log id nếu payload lớn |

## Conversation chuẩn

```json
{
  "id": "",
  "channel": "shopee",
  "shop_id": "",
  "customer_id": "",
  "platform_conversation_id": "",
  "last_message_text": "",
  "last_message_at": "",
  "unread_count": 0,
  "assigned_to": "",
  "tags": [],
  "status": "open",
  "shop_chat_mode": "api",
  "send_capability": "bridge",
  "sync_capability": "polling_api",
  "updated_at": ""
}
```

### Capability theo shop/kênh

Chat Core vẫn là một hệ thống chung, nhưng mỗi conversation phải mang capability theo `channel + shop_id`:

| Field | Giá trị hợp lệ | Nghĩa vận hành |
|---|---|---|
| `shop_chat_mode` | `api`, `browser_helper`, `manual`, `disabled` | Shop/kênh đang chạy bằng API, trình duyệt hỗ trợ, gửi tay hay chưa bật |
| `send_capability` | `official_api`, `bridge`, `manual_only`, `none` | Cách backend được phép gửi outbound |
| `sync_capability` | `webhook`, `polling_api`, `browser_helper`, `manual_import`, `none` | Cách backend được phép lấy inbound/sync |

Quy tắc mặc định:

- Shop có API: ưu tiên `shop_chat_mode=api`, `send_capability=official_api` hoặc `bridge`, `sync_capability=webhook` hoặc `polling_api`.
- Shop không API: chỉ dùng `browser_helper`, `manual` hoặc `disabled`; không được gắn nhãn API.
- Nếu chưa gửi được lên sàn, outbound message phải chuyển `failed`, `manual_pending` hoặc `queued_for_browser_helper`, không ghi `sent`.
- UI phải render badge từ capability backend trả về: `API chính thức`, `Bridge`, `Browser helper`, `Gửi tay`, `Chưa cấu hình`.

## Dedupe và merge

1. Nếu có `platform_message_id`, merge theo `channel + shop_id + platform_message_id`.
2. Nếu chưa có `platform_message_id`, merge theo `channel + shop_id + client_temp_id`.
3. Nếu message optimistic đã có `client_temp_id`, khi sync trả về `platform_message_id` thì cập nhật chính message đó, không tạo message mới.
4. Nếu message thiếu cả 2 khóa trên, Chat Core mới được dùng `id` nội bộ làm fallback.
5. Khi message mới cập nhật conversation, `last_message_text`, `last_message_at`, `updated_at` phải được tính ở core.

## Attachment

```json
{
  "id": "",
  "type": "image",
  "name": "",
  "mime_type": "",
  "size": 0,
  "r2_key": "",
  "url": "",
  "thumbnail_url": "",
  "source": ""
}
```

- D1 chỉ lưu metadata attachment.
- File ảnh/video/audio/file lưu R2 `shophuyvan-chat-files`.
- Payload raw lớn lưu R2 hoặc bảng raw log, message chỉ giữ `raw_payload_ref`.

## AI suggestion

```json
{
  "id": "",
  "conversation_id": "",
  "message_id": "",
  "suggested_text": "",
  "prompt_context": {},
  "policy_status": "needs_review",
  "user_feedback": "",
  "final_state": "draft",
  "final_message_sent": "",
  "created_at": "",
  "updated_at": ""
}
```

Giai đoạn đầu AI chỉ gợi ý. Không tự gửi lên sàn nếu chưa có rule an toàn bật live theo shop/kênh. Auto-send chỉ được phép xét khi `send_capability` là `official_api` hoặc `bridge`.

## Trạng thái kênh phase đầu

| Kênh | Trạng thái |
|---|---|
| Shopee | Có adapter mới, chỉ gửi live khi cấu hình endpoint cầu nối chính thức rõ ràng; nếu thiếu trả `adapter_not_configured` và message thành `failed` |
| Lazada | Skeleton `adapter_not_implemented` |
| TikTok | Skeleton `adapter_not_implemented` |
| Facebook | Skeleton `adapter_not_implemented` |
| Zalo | Skeleton `adapter_not_implemented` |
| Internal | Dùng cho test local và ghi chú nội bộ, không giả lập gửi ra sàn |
