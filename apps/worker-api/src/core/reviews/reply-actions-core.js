export function createReviewReplyActions(ctx) {
  const {
    ensureReviewCoreTables,
    cleanText,
    lowerText,
    numberValue
  } = ctx;

  function reviewReplyPolicyViolations(content) {
    const text = lowerText(content)
    const violations = []
    const blockedPatterns = [
      { label: 'Không xin số điện thoại trong phản hồi công khai.', pattern: /(số điện thoại|sdt|điện thoại|phone|hotline)/i },
      { label: 'Không kéo khách ra ngoài sàn.', pattern: /(zalo|facebook|messenger|ngoài sàn|ngoai san)/i },
      { label: 'Không nhắc chuyển khoản hoặc tài khoản ngân hàng.', pattern: /(chuyển khoản|tai khoản|tài khoản|ngân hàng|stk|bank)/i },
      { label: 'Không hứa hoàn tiền ngoài quy trình sàn.', pattern: /(hoàn tiền riêng|bồi thường riêng|đền tiền|den tien)/i }
    ]
    for (const item of blockedPatterns) {
      if (item.pattern.test(text)) violations.push(item.label)
    }
    return violations
  }
  
  function clampReviewReply(content, maxLength = 450) {
    const text = cleanText(content)
    if (text.length <= maxLength) return text
    return `${text.slice(0, maxLength - 1).trim()}…`
  }
  
  function buildReviewReplySuggestion(review = {}, input = {}) {
    const productName = cleanText(review.product_name) || 'sản phẩm'
    const rating = numberValue(review.rating_overall)
    const buyer = cleanText(review.buyer_name)
    const prefix = buyer ? `Dạ ${buyer}, ` : 'Dạ, '
    const productText = productName === 'sản phẩm' ? 'sản phẩm này' : `sản phẩm ${productName}`
    if (rating > 0 && rating <= 2) {
      return clampReviewReply(`${prefix}shop rất tiếc vì trải nghiệm của anh/chị với ${productText} chưa tốt. Shop đã ghi nhận phản hồi này để kiểm tra lại chất lượng, đóng gói và hướng dẫn sử dụng. Anh/chị nhắn thêm trong khung chat của sàn để shop kiểm tra đơn và hỗ trợ đúng quy trình ạ.`)
    }
    if (rating === 3) {
      return clampReviewReply(`${prefix}shop cảm ơn anh/chị đã phản hồi về ${productText}. Shop đã ghi nhận điểm chưa hài lòng để kiểm tra lại sản phẩm và cải thiện mô tả/hướng dẫn. Nếu còn vướng mắc khi sử dụng, anh/chị nhắn trong chat của sàn để shop hỗ trợ thêm ạ.`)
    }
    if (rating >= 4) {
      return clampReviewReply(`${prefix}shop cảm ơn anh/chị đã đánh giá tốt cho ${productText}. Shop sẽ tiếp tục kiểm tra chất lượng và đóng gói cẩn thận hơn để các đơn sau phục vụ anh/chị tốt hơn ạ.`)
    }
    return clampReviewReply(`${prefix}shop cảm ơn anh/chị đã để lại đánh giá. Shop đã ghi nhận phản hồi về ${productText} và sẽ kiểm tra lại để phục vụ tốt hơn. Nếu cần hỗ trợ thêm, anh/chị nhắn trong khung chat của sàn giúp shop ạ.`)
  }
  
  async function createReviewReplySuggestion(env, input = {}) {
    await ensureReviewCoreTables(env)
    const platform = lowerText(input.platform)
    const shop = cleanText(input.shop)
    const reviewId = cleanText(input.review_id || input.reviewId)
    const review = reviewId
      ? await safeFirst(env, `
          SELECT *
          FROM marketplace_product_reviews
          WHERE platform = ?
            AND review_id = ?
            ${shop ? 'AND shop = ?' : ''}
          LIMIT 1
        `, shop ? [platform, reviewId, shop] : [platform, reviewId])
      : null
  
    if (!review) {
      return {
        status: 'error',
        errors: ['Không tìm thấy review trong core. Cần đồng bộ đánh giá trước khi tạo gợi ý.']
      }
    }
  
    const suggestion = buildReviewReplySuggestion(review, input)
    const violations = reviewReplyPolicyViolations(suggestion)
    return {
      status: violations.length ? 'blocked' : 'ok',
      mode: 'review_reply_suggestion',
      platform,
      shop: shop || cleanText(review.shop),
      review_id: reviewId,
      suggestion,
      violations,
      source: 'review_core_template_ai_guard',
      note: violations.length
        ? 'Gợi ý bị guard chặn, cần sửa nội dung trước khi lưu hàng đợi.'
        : 'Gợi ý đã qua guard nội bộ; bấm lưu nháp để đưa vào hàng đợi duyệt.'
    }
  }
  
  async function createReviewReplyPreview(env, input = {}) {
    await ensureReviewCoreTables(env)
    const platform = lowerText(input.platform)
    const shop = cleanText(input.shop)
    const reviewId = cleanText(input.review_id || input.reviewId)
    const content = cleanText(input.content || input.reply || input.message)
    const errors = []
    if (!['shopee', 'lazada'].includes(platform)) errors.push('Sàn phải là Shopee hoặc Lazada.')
    if (!reviewId) errors.push('Thiếu mã review cần trả lời.')
    if (!content) errors.push('Thiếu nội dung trả lời.')
    if (content.length > 500) errors.push('Nội dung trả lời review không được quá 500 ký tự.')
    errors.push(...reviewReplyPolicyViolations(content))
  
    const review = reviewId
      ? await safeFirst(env, `
          SELECT *
          FROM marketplace_product_reviews
          WHERE platform = ?
            AND review_id = ?
            ${shop ? 'AND shop = ?' : ''}
          LIMIT 1
        `, shop ? [platform, reviewId, shop] : [platform, reviewId])
      : null
  
    if (review && numberValue(review.has_reply)) errors.push('Review này đã có phản hồi trong core.')
    if (review && !numberValue(review.can_reply)) errors.push('Review này đang không còn ở trạng thái cho phép trả lời.')
    if (reviewId && !review) errors.push('Không tìm thấy review trong core. Cần đồng bộ review trước khi dựng preview trả lời.')
  
    const endpoint = platform === 'shopee'
      ? '/api/v2/product/reply_comment'
      : '/review/seller/reply/add'
    const previewPayload = platform === 'shopee'
      ? { comment_list: [{ comment_id: Number(reviewId) || reviewId, comment: content }] }
      : { id: Number(reviewId) || reviewId, content }
  
    const status = errors.length ? 'preview_blocked' : 'preview_locked'
    const note = errors.length
      ? 'Chưa tạo được preview hợp lệ để trả lời review.'
      : 'Đã dựng payload trả lời review nhưng khóa gửi thật lên sàn cho tới khi có quyền admin, xác nhận và log kết quả.'
  
    const result = await env.DB.prepare(`
      INSERT INTO marketplace_review_action_logs (
        platform, shop, shop_id, review_id, action_type, action_status,
        request_payload, preview_payload, result_payload, note, sent_to_platform,
        created_at, updated_at
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,0,datetime('now', '+7 hours'),datetime('now', '+7 hours'))
    `).bind(
      platform,
      shop || cleanText(review?.shop),
      cleanText(review?.shop_id || input.shop_id),
      reviewId,
      'review_reply',
      status,
      jsonText(input),
      jsonText({
        endpoint,
        method: platform === 'shopee' ? 'POST' : 'GET',
        payload: previewPayload,
        apply_locked: true,
        sent_to_platform: false
      }),
      jsonText({ errors }),
      note
    ).run()
  
    return {
      status: errors.length ? 'error' : 'ok',
      action_id: result.meta?.last_row_id || null,
      action_status: status,
      endpoint,
      preview_payload: previewPayload,
      apply_locked: true,
      sent_to_platform: false,
      errors,
      note
    }
  }
  
  async function updateReviewReplyAction(env, input = {}) {
    await ensureReviewCoreTables(env)
    const actionId = Number(input.action_id || input.actionId || input.id)
    const nextAction = cleanText(input.action || 'approve')
    const note = cleanText(input.note)
    if (!Number.isFinite(actionId) || actionId <= 0) {
      return { status: 'error', errors: ['Thiếu mã hành động review cần cập nhật.'] }
    }
    const row = await safeFirst(env, `
      SELECT *
      FROM marketplace_review_action_logs
      WHERE id = ?
      LIMIT 1
    `, [actionId])
    if (!row) return { status: 'error', errors: ['Không tìm thấy log review trong hàng đợi.'] }
  
    let actionStatus = cleanText(row.action_status || 'preview_locked')
    let sentToPlatform = numberValue(row.sent_to_platform)
    let resultPayload = parseJson(row.result_payload, {})
    let nextNote = note || cleanText(row.note)
  
    if (nextAction === 'approve') {
      actionStatus = 'approved_manual'
      nextNote = note || 'Đã duyệt nội dung. Shop có thể copy gửi thủ công hoặc mở khóa gửi thật khi endpoint/quyền đã sẵn sàng.'
    } else if (nextAction === 'cancel') {
      actionStatus = 'cancelled'
      nextNote = note || 'Đã hủy nháp phản hồi review.'
    } else if (nextAction === 'mark_manual_sent') {
      actionStatus = 'manual_sent'
      sentToPlatform = 0
      resultPayload = {
        ...resultPayload,
        manual_sent_at: new Date().toISOString(),
        manual_note: note || 'Người vận hành đánh dấu đã gửi thủ công trên Seller Center.'
      }
      nextNote = note || 'Đã đánh dấu gửi thủ công; hệ thống không tự gọi endpoint sàn.'
    } else if (nextAction === 'send_live') {
      actionStatus = 'send_locked'
      resultPayload = {
        ...resultPayload,
        blocked_reason: 'REVIEW_REPLY_LIVE_ENABLED chưa bật nên không gửi thật lên sàn.',
        requested_at: new Date().toISOString()
      }
      nextNote = 'Đã chặn gửi thật để tránh phản hồi sai khách. Cần bật khóa live và kiểm endpoint/quyền trước khi mở.'
    } else {
      return { status: 'error', errors: ['Thao tác hàng đợi review không hợp lệ.'] }
    }
  
    await env.DB.prepare(`
      UPDATE marketplace_review_action_logs
      SET action_status = ?,
          result_payload = ?,
          note = ?,
          sent_to_platform = ?,
          updated_at = datetime('now', '+7 hours')
      WHERE id = ?
    `).bind(
      actionStatus,
      jsonText(resultPayload),
      nextNote,
      sentToPlatform,
      actionId
    ).run()
  
    return {
      status: 'ok',
      action_id: actionId,
      action_status: actionStatus,
      sent_to_platform: sentToPlatform,
      note: nextNote,
      live_send_locked: nextAction === 'send_live'
    }
  }

  return {
    createReviewReplySuggestion,
    createReviewReplyPreview,
    updateReviewReplyAction
  };
}
