# Bản đồ refactor file theo tính năng

Ngày cập nhật: 2026-05-14.

## Phạm vi

- Dọn 4 thư mục root: `apps/worker-api/src/routes`, `apps/worker-api/src/core`, `apps/fe/js`, `apps/fe/css`.
- Public API route: không đổi. Chỉ đổi vị trí source/import nội bộ.
- Frontend URL/page: không đổi. Chỉ cập nhật `script src` và `link rel=stylesheet` sang thư mục tính năng mới.
- Các file cũ ở root 4 thư mục trên đã được move/xóa khỏi root; root hiện chỉ còn thư mục con, không còn file `.js`/`.css` lộn xộn.

## Worker routes

| File cũ | File mới | Lý do | Public route |
|---|---|---|---|
| `apps/worker-api/src/routes/admin-auth.js` | `apps/worker-api/src/routes/admin/index.js` | Gom route đăng nhập/admin vào feature `admin`. | không đổi |
| `apps/worker-api/src/routes/ads.js` | `apps/worker-api/src/routes/ads/index.js` | Gom ADS, guard, TopPicks entry theo feature ADS. | không đổi |
| `apps/worker-api/src/routes/api-sync.js` | `apps/worker-api/src/routes/api/index.js` | Entry API sync/advanced API đưa vào feature `api`. | không đổi |
| `apps/worker-api/src/routes/api-modules.js` | `apps/worker-api/src/routes/api/modules.js` | Module API center thuộc feature `api`. | không đổi |
| `apps/worker-api/src/routes/api-features.js` | `apps/worker-api/src/routes/api/features.js` | Feature metadata của API center thuộc feature `api`. | không đổi |
| `apps/worker-api/src/routes/bot-settings.js` | `apps/worker-api/src/routes/bot/index.js` | Cấu hình bot đưa vào feature `bot`. | không đổi |
| `apps/worker-api/src/routes/customer-risk.js` | `apps/worker-api/src/routes/customer/index.js` | Risk khách hàng đưa vào feature `customer`. | không đổi |
| `apps/worker-api/src/routes/dashboard.js` | `apps/worker-api/src/routes/dashboard/index.js` | Dashboard API theo feature `dashboard`. | không đổi |
| `apps/worker-api/src/routes/dashboard-aux.js` | `apps/worker-api/src/routes/dashboard/dashboard-aux.js` | Helper dashboard giữ cùng feature dashboard. | không đổi |
| `apps/worker-api/src/routes/discounts.js` | `apps/worker-api/src/routes/discounts/index.js` | Promotion/discount API theo feature `discounts`. | không đổi |
| `apps/worker-api/src/routes/income.js` | `apps/worker-api/src/routes/finance/income.js` | Doanh thu/lãi thuộc feature tài chính. | không đổi |
| `apps/worker-api/src/routes/invoices.js` | `apps/worker-api/src/routes/finance/invoices.js` | Hóa đơn thuộc feature tài chính. | không đổi |
| `apps/worker-api/src/routes/jobs.js` | `apps/worker-api/src/routes/jobs/index.js` | Job queue/runtime theo feature `jobs`. | không đổi |
| `apps/worker-api/src/routes/labels.js` | `apps/worker-api/src/routes/labels/index.js` | Tem/label theo feature `labels`. | không đổi |
| `apps/worker-api/src/routes/logistics-watch.js` | `apps/worker-api/src/routes/logistics/index.js` | Theo dõi vận chuyển theo feature logistics. | không đổi |
| `apps/worker-api/src/routes/marketplace-webhooks.js` | `apps/worker-api/src/routes/marketplace/index.js` | Webhook sàn nằm trong feature marketplace. | không đổi |
| `apps/worker-api/src/routes/operations.js` | `apps/worker-api/src/routes/operations/index.js` | Vận hành OMS theo feature operations. | không đổi |
| `apps/worker-api/src/routes/order-analytics.js` | `apps/worker-api/src/routes/order-analytics/index.js` | Phân tích đơn theo feature riêng. | không đổi |
| `apps/worker-api/src/routes/orders.js` | `apps/worker-api/src/routes/orders/index.js` | Order API theo feature `orders`. | không đổi |
| `apps/worker-api/src/routes/products.js` | `apps/worker-api/src/routes/products/index.js` | Product API theo feature `products`. | không đổi |
| `apps/worker-api/src/routes/purchase.js` | `apps/worker-api/src/routes/purchase/index.js` | Mua hàng nội bộ theo feature purchase. | không đổi |
| `apps/worker-api/src/routes/reports.js` | `apps/worker-api/src/routes/reports/index.js` | Báo cáo/import report theo feature reports. | không đổi |
| `apps/worker-api/src/routes/returns.js` | `apps/worker-api/src/routes/returns/index.js` | Hoàn/trả theo feature returns. | không đổi |
| `apps/worker-api/src/routes/reviews.js` | `apps/worker-api/src/routes/reviews/index.js` | Đánh giá theo feature reviews. | không đổi |
| `apps/worker-api/src/routes/shops.js` | `apps/worker-api/src/routes/shops/index.js` | Shop/API config theo feature shops. | không đổi |
| `apps/worker-api/src/routes/top-picks.js` | `apps/worker-api/src/routes/top-picks/index.js` | TopPicks theo feature riêng, vẫn được ADS gọi lại. | không đổi |
| `apps/worker-api/src/routes/video.js` | `apps/worker-api/src/routes/video/index.js` | Video API theo feature video. | không đổi |
| `apps/worker-api/src/routes/worker-chat-marketplace-route.js` | `apps/worker-api/src/routes/marketplace-chat/index.js` | Chat sàn entry theo feature marketplace-chat. | không đổi |

## Worker core

| File cũ | File mới | Lý do | Public route |
|---|---|---|---|
| `apps/worker-api/src/core/ads-campaign-guard-core.js` | `apps/worker-api/src/core/ads/campaign-guard-core.js` | Guard thao tác ADS thuộc core ADS. | không đổi |
| `apps/worker-api/src/core/chat-ai-support-policy-core.js` | `apps/worker-api/src/core/chat/ai-support-policy-core.js` | Policy AI chat thuộc core chat. | không đổi |
| `apps/worker-api/src/core/chat-identity-core.js` | `apps/worker-api/src/core/chat/identity-core.js` | Định danh hội thoại thuộc core chat. | không đổi |
| `apps/worker-api/src/core/chat-order-context-core.js` | `apps/worker-api/src/core/chat/order-context-core.js` | Ngữ cảnh đơn hàng cho chat thuộc core chat. | không đổi |
| `apps/worker-api/src/core/chat-order-resolver-core.js` | `apps/worker-api/src/core/chat/order-resolver-core.js` | Resolver đơn hàng trong chat thuộc core chat. | không đổi |
| `apps/worker-api/src/core/chat-scan-policy-core.js` | `apps/worker-api/src/core/chat/scan-policy-core.js` | Policy quét chat thuộc core chat. | không đổi |
| `apps/worker-api/src/core/chat-transport-core.js` | `apps/worker-api/src/core/chat/transport-core.js` | API/browser transport chat thuộc core chat. | không đổi |
| `apps/worker-api/src/core/customer-risk-core.js` | `apps/worker-api/src/core/customer/risk-core.js` | Risk khách hàng thuộc core customer. | không đổi |
| `apps/worker-api/src/core/dashboard-summary-core.js` | `apps/worker-api/src/core/dashboard/summary-core.js` | Tổng hợp dashboard thuộc core dashboard. | không đổi |
| `apps/worker-api/src/core/inventory-stock-core.js` | `apps/worker-api/src/core/inventory/stock-core.js` | Tồn kho thuộc core inventory. | không đổi |
| `apps/worker-api/src/core/logistics-watch-core.js` | `apps/worker-api/src/core/logistics/watch-core.js` | Watch vận chuyển thuộc core logistics. | không đổi |
| `apps/worker-api/src/core/marketplace-push-core.js` | `apps/worker-api/src/core/marketplace/push-core.js` | Push marketplace thuộc core marketplace. | không đổi |
| `apps/worker-api/src/core/marketplace-push-subscriptions-core.js` | `apps/worker-api/src/core/marketplace/push-subscriptions-core.js` | Subscription push marketplace cùng core marketplace. | không đổi |
| `apps/worker-api/src/core/marketplace-shop-capability-core.js` | `apps/worker-api/src/core/marketplace/shop-capability-core.js` | Capability shop theo sàn thuộc core marketplace. | không đổi |
| `apps/worker-api/src/core/operation-cost-core.js` | `apps/worker-api/src/core/operations/cost-core.js` | Chi phí vận hành thuộc core operations. | không đổi |
| `apps/worker-api/src/core/order-analytics-finance-core.js` | `apps/worker-api/src/core/orders/analytics-finance-core.js` | Finance analytics của đơn thuộc core orders. | không đổi |
| `apps/worker-api/src/core/order-analytics-shared-core.js` | `apps/worker-api/src/core/orders/analytics-shared-core.js` | Shared analytics của đơn thuộc core orders. | không đổi |
| `apps/worker-api/src/core/order-fee-phase1-core.js` | `apps/worker-api/src/core/orders/fee-phase1-core.js` | Fee phase 1 thuộc core orders. | không đổi |
| `apps/worker-api/src/core/order-finance-core.js` | `apps/worker-api/src/core/orders/finance-core.js` | Tài chính đơn hàng thuộc core orders. | không đổi |
| `apps/worker-api/src/core/order-return-inference-core.js` | `apps/worker-api/src/core/orders/return-inference-core.js` | Suy luận hoàn/trả theo đơn thuộc core orders. | không đổi |
| `apps/worker-api/src/core/order-status-core.js` | `apps/worker-api/src/core/orders/status-core.js` | Chuẩn hóa trạng thái đơn thuộc core orders. | không đổi |
| `apps/worker-api/src/core/order-time-core.js` | `apps/worker-api/src/core/orders/time-core.js` | Chuẩn hóa thời gian đơn thuộc core orders. | không đổi |
| `apps/worker-api/src/core/order-transport-core.js` | `apps/worker-api/src/core/orders/transport-core.js` | Transport order sync thuộc core orders. | không đổi |
| `apps/worker-api/src/core/product-catalog-audit-core.js` | `apps/worker-api/src/core/products/catalog-audit-core.js` | Audit catalog thuộc core products. | không đổi |
| `apps/worker-api/src/core/product-catalog-core.js` | `apps/worker-api/src/core/products/catalog-core.js` | Catalog sản phẩm thuộc core products. | không đổi |
| `apps/worker-api/src/core/sku-identity-core.js` | `apps/worker-api/src/core/products/sku-identity-core.js` | Định danh SKU thuộc core products. | không đổi |
| `apps/worker-api/src/core/promotion-stock-price-rule-core.js` | `apps/worker-api/src/core/promotions/stock-price-rule-core.js` | Rule giá theo tồn kho thuộc core promotions. | không đổi |
| `apps/worker-api/src/core/promotion-tool-core.js` | `apps/worker-api/src/core/promotions/tool-core.js` | Core khuyến mãi/discount thuộc promotions. | không đổi |
| `apps/worker-api/src/core/return-reverse-core.js` | `apps/worker-api/src/core/returns/reverse-core.js` | Reverse return thuộc core returns. | không đổi |
| `apps/worker-api/src/core/review-core.js` | `apps/worker-api/src/core/reviews/core.js` | Review core thuộc reviews. | không đổi |
| `apps/worker-api/src/core/review-reply-actions-core.js` | `apps/worker-api/src/core/reviews/reply-actions-core.js` | Reply action review thuộc reviews. | không đổi |
| `apps/worker-api/src/core/review-workspace-core.js` | `apps/worker-api/src/core/reviews/workspace-core.js` | Workspace review thuộc reviews. | không đổi |
| `apps/worker-api/src/core/shop-display-core.js` | `apps/worker-api/src/core/shops/display-core.js` | Hiển thị shop thuộc core shops. | không đổi |
| `apps/worker-api/src/core/shopee-shop-profile-core.js` | `apps/worker-api/src/core/shops/shopee-profile-core.js` | Hồ sơ Shopee shop thuộc core shops. | không đổi |
| `apps/worker-api/src/core/shopee-video-auth-core.js` | `apps/worker-api/src/core/shops/shopee-video-auth-core.js` | Auth Shopee video gắn với shop. | không đổi |
| `apps/worker-api/src/core/video-analytics-core.js` | `apps/worker-api/src/core/video/analytics-core.js` | Analytics video thuộc core video. | không đổi |

## Frontend JS

| File cũ | File mới | Lý do | Public route |
|---|---|---|---|
| `apps/fe/js/admin-users.js` | `apps/fe/js/admin/admin-users.js` | JS quản trị user thuộc feature admin. | không đổi |
| `apps/fe/js/auth-guard.js` | `apps/fe/js/auth/auth-guard.js` | Guard đăng nhập thuộc feature auth. | không đổi |
| `apps/fe/js/login.js` | `apps/fe/js/auth/login.js` | Trang login thuộc feature auth. | không đổi |
| `apps/fe/js/import-orders.js` | `apps/fe/js/orders/import-orders.js` | Import đơn thuộc feature orders. | không đổi |
| `apps/fe/js/oms-api.js` | `apps/fe/js/oms-dashboard/oms-api.js` | API client OMS thuộc OMS dashboard. | không đổi |
| `apps/fe/js/oms-main.js` | `apps/fe/js/oms-dashboard/oms-main.js` | Entry OMS dashboard thuộc feature OMS. | không đổi |
| `apps/fe/js/parser.js` | `apps/fe/js/parser/index.js` | Parser import đưa vào feature parser. | không đổi |
| `apps/fe/js/report-bot.js` | `apps/fe/js/reports/report-bot.js` | Report bot thuộc feature reports. | không đổi |
| `apps/fe/js/report-history.js` | `apps/fe/js/reports/report-history.js` | Lịch sử report thuộc feature reports. | không đổi |
| `apps/fe/js/report-upload.js` | `apps/fe/js/reports/report-upload.js` | Upload report thuộc feature reports. | không đổi |
| `apps/fe/js/reviews.js` | `apps/fe/js/reviews/reviews.js` | Review frontend thuộc feature reviews. | không đổi |
| `apps/fe/js/shopee-review.js` | `apps/fe/js/reviews/shopee-review.js` | Shopee review thuộc feature reviews. | không đổi |
| `apps/fe/js/video-dashboard.js` | `apps/fe/js/video/video-dashboard.js` | Video dashboard thuộc feature video. | không đổi |

## Frontend CSS

| File cũ | File mới | Lý do | Public route |
|---|---|---|---|
| `apps/fe/css/admin.css` | `apps/fe/css/admin/admin.css` | CSS admin thuộc feature admin. | không đổi |
| `apps/fe/css/admin-products-page.css` | `apps/fe/css/admin/admin-products-page.css` | CSS quản lý sản phẩm thuộc admin. | không đổi |
| `apps/fe/css/admin-purchase.css` | `apps/fe/css/admin/admin-purchase.css` | CSS mua hàng admin thuộc admin. | không đổi |
| `apps/fe/css/ads-page.css` | `apps/fe/css/ads/ads-page.css` | CSS ADS thuộc feature ads. | không đổi |
| `apps/fe/css/auth.css` | `apps/fe/css/auth/auth.css` | CSS đăng nhập thuộc auth. | không đổi |
| `apps/fe/css/cctv-packing.css` | `apps/fe/css/cctv-packing/cctv-packing.css` | CSS CCTV/packing thuộc feature riêng. | không đổi |
| `apps/fe/css/dashboard.css` | `apps/fe/css/dashboard/dashboard.css` | CSS dashboard thuộc feature dashboard. | không đổi |
| `apps/fe/css/import-orders.css` | `apps/fe/css/orders/import-orders.css` | CSS import đơn thuộc orders. | không đổi |
| `apps/fe/css/oms-dashboard.css` | `apps/fe/css/oms-dashboard/oms-dashboard.css` | CSS OMS dashboard thuộc OMS. | không đổi |
| `apps/fe/css/oms-dashboard-inline-a.css` | `apps/fe/css/oms-dashboard/oms-dashboard-inline-a.css` | CSS tách từ OMS dashboard, giữ cùng feature. | không đổi |
| `apps/fe/css/oms-dashboard-inline-b.css` | `apps/fe/css/oms-dashboard/oms-dashboard-inline-b.css` | CSS tách từ OMS dashboard, giữ cùng feature. | không đổi |
| `apps/fe/css/product-detail.css` | `apps/fe/css/products/product-detail.css` | CSS chi tiết sản phẩm thuộc products. | không đổi |
| `apps/fe/css/report-upload.css` | `apps/fe/css/reports/report-upload.css` | CSS upload report thuộc reports. | không đổi |
| `apps/fe/css/shopee-review.css` | `apps/fe/css/reviews/shopee-review.css` | CSS Shopee review thuộc reviews. | không đổi |
| `apps/fe/css/sku.css` | `apps/fe/css/sku/sku.css` | CSS SKU page thuộc feature SKU. | không đổi |
| `apps/fe/css/video-dashboard.css` | `apps/fe/css/video/video-dashboard.css` | CSS video dashboard thuộc video. | không đổi |
| `apps/fe/css/video-dashboard/base-shell.css` | `apps/fe/css/video/video-dashboard/base-shell.css` | CSS chunk của video dashboard đi cùng feature video. | không đổi |
| `apps/fe/css/video-dashboard/cards-search.css` | `apps/fe/css/video/video-dashboard/cards-search.css` | CSS chunk của video dashboard đi cùng feature video. | không đổi |
| `apps/fe/css/video-dashboard/library-management.css` | `apps/fe/css/video/video-dashboard/library-management.css` | CSS chunk của video dashboard đi cùng feature video. | không đổi |
| `apps/fe/css/video-dashboard/analysis-upload.css` | `apps/fe/css/video/video-dashboard/analysis-upload.css` | CSS chunk của video dashboard đi cùng feature video. | không đổi |

## File giữ nguyên vì là entrypoint/aggregator

- Không giữ file `.js`/`.css` trực tiếp ở root của `routes`, `core`, `apps/fe/js`, `apps/fe/css`.
- Các aggregator còn lại nằm trong folder tính năng, ví dụ `routes/api/index.js`, `routes/ads/index.js`, `routes/orders/index.js`, `routes/products/index.js`, `routes/discounts/index.js`, `routes/marketplace-chat/index.js`. Lý do: router production đang import entry theo feature, giữ URL cũ nhưng source dễ grep.
- `apps/worker-api/src/index.js` và `apps/worker-api/src/worker-router/primary-routes.js` giữ nguyên ngoài `routes` vì là Worker entry/router tổng.

## TODO phase 2: file sát 28-30KB

Các file dưới đây đã dưới 30KB sau refactor nhưng cần tách tiếp trước khi thêm logic mới:

- `apps/fe/js/modules/oms-api-advanced.js` 29.9KB.
- `apps/worker-api/src/routes/api-sync/shopee/returns/actions.js` 29.9KB.
- `apps/fe/js/admin/purchase-manager.js` 29.8KB.
- `apps/worker-api/src/routes/api-sync/ads/shopee/campaign-actions.js` 29.7KB.
- `apps/worker-api/src/routes/marketplace/index.js` 29.3KB.
- `apps/fe/js/oms-dashboard/oms-main.js` 29.2KB.
- `apps/worker-api/src/index.js` 29.1KB.
- `apps/fe/js/modules/oms-render.js` 29.1KB.
- `apps/worker-api/src/core/ads/campaign-guard-core.js` 29.3KB.
- `apps/worker-api/src/core/products/catalog-core.js` 28.9KB.
- `apps/fe/js/modules/oms-actions.js` 28.6KB.
- `apps/worker-api/src/routes/products/cost-variations-handler.js` 28.3KB.
- `apps/worker-api/src/routes/labels/index.js` 28.0KB.

## Needs review

- Không có file root nào còn cần phân loại thủ công trong 4 thư mục mục tiêu.
- Các thư mục con cũ như `routes/api-sync`, `routes/api-modules`, `routes/worker-chat-marketplace`, `apps/fe/js/modules`, `apps/fe/js/dashboard` vẫn được giữ vì đã là cấu trúc module con đang chạy production, không xóa thư mục con hiện có.
