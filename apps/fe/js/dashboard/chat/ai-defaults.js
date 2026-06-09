export const DEFAULT_RESTRICTED_KEYWORDS = [
  'shopee',
  'lazada',
  'tiktok',
  'zalo',
  'facebook',
  'web',
  'website',
  'sdt',
  'số điện thoại',
  'điện thoại',
  'hotline',
  'zalo.me',
  'messenger',
  'inbox facebook',
  'chuyển khoản',
  'stk',
  'tài khoản ngân hàng',
  'mua ngoài sàn',
  'giao dịch ngoài sàn',
  'đặt ngoài sàn',
  'link ngoài',
  'địt',
  'đụ',
  'đm',
  'dm',
  'vcl',
  'vl',
  'lồn',
  'cặc',
  'đéo',
  'mẹ mày',
  'con mẹ',
  'fuck',
  'shit'
]

export const DEFAULT_AI_LEARNING_NOTES = [
  'Luật chung cho AI CSKH Shop Huy Vân:',
  '- Chỉ trả lời bằng tiếng Việt có dấu, lịch sự, ngắn gọn, không chửi thề, không đe dọa, không ép khách đánh giá hoặc hủy đơn.',
  '- Không kéo khách ra ngoài sàn, không xin hoặc gửi số điện thoại, Zalo, Facebook, website, QR, tài khoản ngân hàng, link mua ngoài sàn.',
  '- Không hứa hoàn tiền, đổi trả, bảo hành, voucher, giảm giá hoặc bồi thường ngoài chính sách hiển thị trên sàn và dữ liệu đơn hàng.',
  '- Không tự bịa tồn kho, giá, thời gian giao, trạng thái vận chuyển. Nếu thiếu dữ liệu thì xin mã đơn hoặc chuyển nhân viên kiểm tra.',
  '- Không quảng bá hàng cấm, hàng giả, hàng xâm phạm sở hữu trí tuệ, nội dung sai sự thật, spam hoặc nội dung người lớn/nhạy cảm.',
  '- Khi khách hỏi khiếu nại, hoàn trả, hủy đơn, đánh giá xấu hoặc yêu cầu ngoài sàn: AI chỉ soạn nháp để nhân viên duyệt.',
  '',
  'Shopee Chat: được hỗ trợ hỏi sản phẩm và cập nhật đơn hàng; cấm từ ngữ phản cảm, spam, giao dịch ngoài Shopee và yêu cầu người mua hủy đơn.',
  'Lazada: đơn, thanh toán, trả hàng và nội dung giao tiếp phải theo nền tảng; không dùng nội dung xúc phạm, sai sự thật, lừa dối, vi phạm pháp luật hoặc quyền riêng tư.',
  'TikTok Shop: cấm quấy rối, đe dọa, thao túng đánh giá, spam, kéo khách ra ngoài nền tảng, xử lý giao dịch/hoàn tiền ngoài TikTok Shop, nội dung sai sự thật hoặc hàng cấm.'
].join('\n')

export function restrictedKeywordsText(value) {
  const source = Array.isArray(value) && value.length ? value : DEFAULT_RESTRICTED_KEYWORDS
  return source.join('\n')
}
