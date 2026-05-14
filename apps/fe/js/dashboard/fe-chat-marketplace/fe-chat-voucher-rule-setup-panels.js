// NEO: Frontend chat sàn - nhóm voucher-rule-setup-panels. Giữ file dưới 30KB; tính năng mới tách thành file fe-chat-* riêng.
function renderChatVoucherPanel(context) {
  if (!chatState.activeConversation) return '<div class="chat-empty">Chọn hội thoại để xem voucher/khuyến mãi.</div>'
  if (!context) return '<div class="chat-empty">Đang tải voucher...</div>'
  const summary = context.voucher_summary
  const events = context.vouchers || []
  return `
    <div class="chat-context-card">
      <div class="chat-context-head">
        <div>
          <div class="chat-context-title">Tín hiệu voucher</div>
          <div class="chat-context-meta">${summary?.latest_month ? `Tháng mới nhất: ${chatEscape(summary.latest_month)}` : 'Chưa có báo cáo voucher chi tiết'}</div>
        </div>
        <span class="chat-pill ${events.length ? 'api' : 'off'}">${events.length ? `${events.length} sự kiện` : 'Chưa có'}</span>
      </div>
      <div class="chat-context-grid">
        <span>Voucher shop</span><b>${chatEscape(chatMoney(summary?.seller_voucher || 0))}</b>
        <span>Voucher đồng tài trợ</span><b>${chatEscape(chatMoney(summary?.co_funded_voucher || 0))}</b>
      </div>
    </div>
    ${events.length ? events.map(event => `
      <div class="chat-context-card compact">
        <div class="chat-context-title">${chatEscape(event.event_code || 'promotion')}</div>
        <div class="chat-context-meta">Promo: ${chatEscape(event.promotion_id || 'chưa rõ')} · Item: ${chatEscape(event.item_id || 'chưa rõ')}</div>
        <div class="chat-context-meta">${chatEscape(chatTime(event.processed_at))} · ${chatEscape(event.status || '')}</div>
      </div>
    `).join('') : '<div class="chat-empty">Chưa có snapshot voucher thật từ API/push cho shop này. Không tự bịa mã giảm giá khi trả lời khách.</div>'}
  `
}

function chatViolationText(violation) {
  if (!violation || typeof violation !== 'object') return String(violation || '')
  return [
    violation.risk_level ? `Mức ${violation.risk_level}` : '',
    violation.source ? `Nguồn ${violation.source}` : '',
    violation.detail || violation.label || violation.code || ''
  ].filter(Boolean).join(' · ')
}

function renderChatRulesPanel(data, settings, shops) {
  const setup = data.setup || {}
  const connected = shops.filter(shop => Number(shop.has_access_token)).length
  const forbiddenText = chatRuleLines(settings.ai_forbidden_patterns).join('\n')
  const reviewText = chatRuleLines(settings.ai_review_triggers).join('\n')
  const violations = chatState.ruleViolations || []
  const autoReplyPlatforms = new Set(chatRuleLines(settings.ai_auto_reply_platforms))
  const autoReplyShopsText = chatRuleLines(settings.ai_auto_reply_shops).join('\n')
  const autoReplyLogs = chatState.autoReplyLogs || []
  return `
    <div class="chat-settings-card">
      <div class="chat-settings-head">
        <div>
          <div class="chat-shop-name">AI CSKH và luật bắt buộc</div>
          <div class="chat-shop-meta">Gemini chỉ tạo bản nháp; hệ thống tự kiểm tra luật cứng trước khi đưa vào ô trả lời.</div>
        </div>
        <span class="chat-pill ${Number(settings.ai_enabled) ? 'api' : 'off'}">${Number(settings.ai_enabled) ? 'AI bật' : 'AI tắt'}</span>
      </div>
      <label class="chat-switch-row">
        <input id="chatAiEnabled" type="checkbox" ${chatChecked(settings.ai_enabled)}>
        <span>Bật nút AI gợi ý trong khung trả lời</span>
      </label>
      <label class="chat-switch-row">
        <input id="chatAiRequireReview" type="checkbox" ${chatChecked(settings.ai_require_review)}>
        <span>Luôn yêu cầu nhân viên duyệt lại bản nháp AI</span>
      </label>
      <div class="chat-settings-card compact">
        <div class="chat-settings-head">
          <div>
            <div class="chat-context-title">AI tự trả lời</div>
            <div class="chat-shop-meta">Cron chỉ tự gửi khi shop đi API, AI qua guard và không cần duyệt.</div>
          </div>
          <span class="chat-pill ${settings.ai_auto_reply_mode === 'live' ? 'api' : (settings.ai_auto_reply_mode === 'dry_run' ? 'warn' : 'off')}">${chatEscape(settings.ai_auto_reply_mode === 'live' ? 'Gửi thật' : (settings.ai_auto_reply_mode === 'dry_run' ? 'Chạy thử' : 'Đang tắt'))}</span>
        </div>
        <label class="chat-field-label" for="chatAiAutoReplyMode">Chế độ auto-reply</label>
        <select id="chatAiAutoReplyMode" class="chat-settings-input">
          <option value="off" ${chatSelected(settings.ai_auto_reply_mode, 'off')}>Tắt</option>
          <option value="dry_run" ${chatSelected(settings.ai_auto_reply_mode, 'dry_run')}>Chạy thử, chỉ ghi log</option>
          <option value="live" ${chatSelected(settings.ai_auto_reply_mode, 'live')}>Gửi thật khi đủ an toàn</option>
        </select>
        <div class="chat-settings-inline">
          <label class="chat-switch-row">
            <input id="chatAiAutoReplyShopee" type="checkbox" ${chatChecked(autoReplyPlatforms.has('shopee'))}>
            <span>Shopee API</span>
          </label>
          <label class="chat-switch-row">
            <input id="chatAiAutoReplyLazada" type="checkbox" ${chatChecked(autoReplyPlatforms.has('lazada'))}>
            <span>Lazada IM API</span>
          </label>
        </div>
        <label class="chat-field-label" for="chatAiAutoReplyShops">Shop canary được phép live</label>
        <textarea id="chatAiAutoReplyShops" class="chat-settings-textarea" rows="2" placeholder="chihuy2309">${chatEscape(autoReplyShopsText)}</textarea>
        <div class="chat-settings-note">Khi chọn Gửi thật, bắt buộc nhập shop cụ thể; để trống thì Worker không tự gửi live.</div>
        <div class="chat-settings-inline">
          <label class="chat-field-label" for="chatAiAutoReplyLimit">Số hội thoại mỗi lượt</label>
          <input id="chatAiAutoReplyLimit" class="chat-settings-input" type="number" min="1" max="10" step="1" value="${chatEscape(settings.ai_auto_reply_limit || 3)}">
          <label class="chat-field-label" for="chatAiAutoReplyHoldSeconds">Chờ khách nhắn xong</label>
          <input id="chatAiAutoReplyHoldSeconds" class="chat-settings-input" type="number" min="0" max="600" step="5" value="${chatEscape(settings.ai_auto_reply_hold_seconds || 20)}">
          <label class="chat-field-label" for="chatAiAutoReplyMaxAgeHours">Chỉ xử lý tin mới tối đa (giờ)</label>
          <input id="chatAiAutoReplyMaxAgeHours" class="chat-settings-input" type="number" min="1" max="168" step="1" value="${chatEscape(settings.ai_auto_reply_max_age_hours || 2)}">
        </div>
        <label class="chat-switch-row">
          <input id="chatAiAutoReplyHandoff" type="checkbox" ${chatChecked(settings.ai_auto_reply_handoff_enabled)}>
          <span>Gửi câu giữ nhịp khi AI cần nhân viên duyệt</span>
        </label>
        <div class="chat-notify-actions">
          <button class="chat-settings-save secondary" type="button" onclick="runChatAutoReplyDryRun()">Chạy thử ngay</button>
          <button class="chat-settings-save secondary" type="button" onclick="loadChatAutoReplyLogs()">Tải log auto</button>
        </div>
        <div id="chatAutoReplyStatus" class="chat-settings-note"></div>
      </div>
      <label class="chat-field-label" for="chatAiGuardMode">Chế độ ép luật</label>
      <select id="chatAiGuardMode" class="chat-settings-input">
        <option value="strict" ${chatSelected(settings.ai_guard_mode, 'strict')}>Chặn cứng khi vi phạm</option>
        <option value="review" ${chatSelected(settings.ai_guard_mode, 'review')}>Cho nháp nhưng bắt duyệt</option>
        <option value="off" ${chatSelected(settings.ai_guard_mode, 'off')}>Tắt guard nâng cao</option>
      </select>
      <label class="chat-field-label" for="chatAiProvider">Nhà cung cấp AI</label>
      <select id="chatAiProvider" class="chat-settings-input">
        <option value="gemini" ${chatSelected(settings.ai_provider, 'gemini')}>Gemini API</option>
      </select>
      <label class="chat-field-label" for="chatAiModel">Model AI</label>
      <input id="chatAiModel" class="chat-settings-input" value="${chatEscape(settings.ai_model || 'gemini-2.5-flash')}">
      <label class="chat-field-label" for="chatAiTone">Giọng trả lời</label>
      <input id="chatAiTone" class="chat-settings-input" value="${chatEscape(settings.ai_tone || '')}">
      <label class="chat-field-label" for="chatAiRules">Nguyên tắc chi tiết cho AI</label>
      <textarea id="chatAiRules" class="chat-settings-textarea tall" rows="12">${chatEscape(settings.ai_rules || '')}</textarea>
      <div class="chat-settings-note">Nếu khách xin địa chỉ, Zalo hoặc số điện thoại của shop thì hệ thống sẽ tự ép đúng một câu từ chối theo chính sách sàn.</div>
      <label class="chat-field-label" for="chatAiForbiddenPatterns">Luật chặn cứng, mỗi dòng một cụm từ hoặc regex:...</label>
      <textarea id="chatAiForbiddenPatterns" class="chat-settings-textarea" rows="7">${chatEscape(forbiddenText)}</textarea>
      <div class="chat-settings-note">Hệ thống luôn tự thay tên sàn cụ thể thành chữ "sàn" và chặn thương hiệu nội bộ nếu người dùng lỡ xóa khỏi ô cấu hình.</div>
      <label class="chat-field-label" for="chatAiReviewTriggers">Chủ đề bắt buộc nhân viên duyệt lại</label>
      <textarea id="chatAiReviewTriggers" class="chat-settings-textarea" rows="5">${chatEscape(reviewText)}</textarea>
      <button class="chat-settings-save" id="chatSettingsSaveBtn" type="button" onclick="saveChatSettings()">Lưu luật AI</button>
      <div id="chatSettingsSaveStatus" class="chat-settings-note"></div>
    </div>

    <div class="chat-settings-card">
      <div class="chat-settings-head">
        <div>
          <div class="chat-shop-name">Log AI vi phạm / auto-reply</div>
          <div class="chat-shop-meta">Bản nháp bị chặn và lượt auto-reply đều lưu lại để rà soát.</div>
        </div>
        <button class="chat-settings-save secondary" type="button" onclick="loadChatRuleViolations(); loadChatAutoReplyLogs()">Tải log</button>
      </div>
      ${autoReplyLogs.length ? autoReplyLogs.slice(0, 8).map(item => `
        <div class="chat-violation-row">
          <div class="chat-context-name">${chatEscape(item.action || 'auto-reply')} · ${chatEscape(item.status || '')}</div>
          <div class="chat-context-meta">${chatEscape(chatTime(item.created_at))} · ${chatEscape(item.platform || '')} ${chatEscape(item.shop || '')}</div>
          <div class="chat-context-muted">${chatEscape(chatShortText(item.error || item.reply || '', 180))}</div>
        </div>
      `).join('') : ''}
      ${violations.length ? violations.slice(0, 8).map(item => `
        <div class="chat-violation-row">
          <div class="chat-context-name">${chatEscape(item.provider || item.source || 'AI')}</div>
          <div class="chat-context-meta">${chatEscape(chatTime(item.created_at))} · ${chatEscape(item.platform || '')} ${chatEscape(item.shop || '')}</div>
          <div class="chat-context-muted">${chatEscape((item.violations || []).map(chatViolationText).join(' | '))}</div>
        </div>
      `).join('') : '<div class="chat-empty">Chưa có bản nháp AI nào bị chặn.</div>'}
    </div>

    <div class="chat-settings-card">
      <div class="chat-settings-head">
        <div>
          <div class="chat-shop-name">Thông báo & kết nối</div>
          <div class="chat-shop-meta">${connected}/${shops.length} shop có API. Chat API thật chỉ dùng token ở server.</div>
        </div>
        <span id="chatNotifyPermissionState" class="chat-pill off">Chưa bật</span>
      </div>
      <label class="chat-switch-row">
        <input id="chatNotifyEnabled" type="checkbox" ${chatChecked(settings.notify_enabled)}>
        <span>Bật theo dõi tin nhắn mới trên thiết bị này</span>
      </label>
      <label class="chat-switch-row">
        <input id="chatNotifyPreviewEnabled" type="checkbox" ${chatChecked(settings.notify_preview_enabled)}>
        <span>Hiển thị tên khách và nội dung tin nhắn trong thông báo</span>
      </label>
      <label class="chat-switch-row">
        <input id="chatNotifySoundEnabled" type="checkbox" ${chatChecked(settings.notify_sound_enabled)}>
        <span>Bật âm báo khi có tin nhắn mới</span>
      </label>
      <label class="chat-field-label" for="chatNotifyPollSeconds">Tần suất kiểm tra khi dashboard/PWA đang mở</label>
      <input id="chatNotifyPollSeconds" class="chat-settings-input" type="number" min="5" max="60" step="1" value="${chatEscape(settings.notify_poll_seconds || 8)}">
      <div class="chat-notify-actions">
        <button class="chat-settings-save secondary" type="button" onclick="enableChatIphoneNotifications()">Bật thông báo iPhone</button>
        <button class="chat-settings-save secondary" type="button" onclick="testChatNoticeSound()">Thử âm báo</button>
      </div>
      ${renderChatApiShopStatusRows(shops)}
      ${renderChatAutomationGuide(setup)}
      <div id="chatNotifyStatus" class="chat-settings-note">Trên iPhone: mở bằng Safari, thêm OMS vào Màn hình chính, mở từ icon rồi bấm bật thông báo.</div>
      <div class="chat-callback">Shopee: ${chatEscape(setup.shopee_callback || '')}</div>
      <div class="chat-callback">Lazada: ${chatEscape(setup.lazada_callback || '')}</div>
    </div>
  `
}

function renderChatKeywordsPanel(settings) {
  const keywordText = (settings.blocked_keywords || []).join('\n')
  const query = chatState.keywordQuery.trim().toLowerCase()
  const rows = (settings.blocked_keywords || [])
    .map((keyword, index) => ({ keyword, index }))
    .filter(item => !query || String(item.keyword).toLowerCase().includes(query))
  return `
    <div class="chat-settings-card">
      <div class="chat-settings-head">
        <div>
          <div class="chat-shop-name">Cài đặt từ nhạy cảm</div>
          <div class="chat-shop-meta">Từ khóa bị chặn sẽ được kiểm tra cả khi nhân viên tự gửi và khi AI tạo bản nháp.</div>
        </div>
        <span class="chat-pill ${Number(settings.moderation_enabled) ? 'api' : 'off'}">${Number(settings.moderation_enabled) ? 'Đang bật' : 'Đang tắt'}</span>
      </div>
      <label class="chat-switch-row">
        <input id="chatModerationEnabled" type="checkbox" ${chatChecked(settings.moderation_enabled)}>
        <span>Bật kiểm duyệt từ khóa trước khi gửi</span>
      </label>

      <textarea id="chatBlockedKeywords" class="chat-hidden-field">${chatEscape(keywordText)}</textarea>
      <div class="chat-keyword-tools">
        <input id="chatKeywordSearch" class="chat-settings-input" placeholder="Tìm kiếm từ nhạy cảm" value="${chatEscape(chatState.keywordQuery)}" oninput="filterChatKeywordTable(this.value)">
        <input id="chatNewKeyword" class="chat-settings-input" placeholder="Thêm từ nhạy cảm" onkeydown="if(event.key==='Enter') addChatBlockedKeyword()">
        <button class="chat-settings-save" type="button" onclick="addChatBlockedKeyword()">Thêm</button>
      </div>
      <div class="chat-keyword-table">
        <div class="chat-keyword-row head">
          <span>Từ nhạy cảm</span><span>Người thực hiện</span><span>Thời gian</span><span>Thao tác</span>
        </div>
        ${rows.map(item => `
          <div class="chat-keyword-row">
            <span>${chatEscape(item.keyword)}</span>
            <span>OMS</span>
            <span>${chatEscape(chatTime(settings.updated_at) || '-')}</span>
            <span><button type="button" onclick="removeChatBlockedKeyword(${item.index})">Xóa</button></span>
          </div>
        `).join('') || '<div class="chat-empty">Không có từ khóa phù hợp.</div>'}
      </div>
      <button class="chat-settings-save" id="chatSettingsSaveBtn" type="button" onclick="saveChatSettings()">Lưu bộ lọc từ khóa</button>
      <div id="chatSettingsSaveStatus" class="chat-settings-note"></div>
    </div>
  `
}

function renderChatSetup(data = {}) {
  const mergedShops = Array.isArray(data.shops) && data.shops.length
    ? data.shops
    : (Array.isArray(chatState.shops) ? chatState.shops : [])
  const mergedSetup = data.setup || chatState.setupData?.setup || {}
  chatState.setupData = {
    ...(chatState.setupData || {}),
    ...data,
    shops: mergedShops,
    setup: mergedSetup
  }
  chatState.shops = mergedShops
  const status = chatEl('chatSetupStatus')
  const list = chatEl('chatSetupList')
  if (!list) return

  const shops = mergedShops
  const connected = shops.filter(shop => Number(shop.has_access_token)).length
  const settings = currentChatSettings()
  const keywordCount = (settings.blocked_keywords || []).length
  const context = chatState.context
  const orderCount = Number(context?.order_context?.hard_count || 0) + Number(context?.order_context?.soft_count || 0)
  const productCount = context?.product_catalog_summary?.total_products || context?.product_catalog?.length || context?.products?.length || 0
  const productSource = context?.product_catalog_summary?.loaded_from_api ? 'sản phẩm API' : 'sản phẩm'
  const setupStatusNote = chatState.setupLoading
    ? (chatState.setupLoaded ? 'Đang làm mới shop chat...' : 'Đang tải shop chat...')
    : (chatState.setupError || '')
  if (status) {
    status.textContent = [
      `${orderCount} đơn · ${Number(productCount || 0).toLocaleString('vi-VN')} ${productSource} · ${keywordCount} từ khóa`,
      setupStatusNote
    ].filter(Boolean).join(' · ')
  }

  const safeContextTab = chatNormalizeContextTab(chatState.activeSideTab)
  chatState.activeSideTab = safeContextTab
  const panelHtml = {
    orders: renderChatOrdersPanel(context),
    products: renderChatProductsPanel(context),
    vouchers: renderChatVoucherPanel(context)
  }[safeContextTab] || renderChatOrdersPanel(context)

  list.innerHTML = `
    ${chatContextTabs()}
    <div class="chat-side-content">
      ${panelHtml}
    </div>
  `
  renderChatAutomationSettingsModal()
  if (chatEl('chatNotifyStatus')) {
    updateChatNotifyStatus(
      typeof Notification !== 'undefined' && Notification.permission === 'granted'
        ? 'Thiết bị này đã cấp quyền thông báo cho OMS.'
        : 'Trên iPhone: mở bằng Safari, thêm OMS vào Màn hình chính, mở từ icon rồi bấm bật thông báo.',
      typeof Notification !== 'undefined' && Notification.permission === 'granted' ? 'ok' : 'muted'
    )
  }
}
