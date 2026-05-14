// NEO: Frontend chat sàn - nhóm filters-automation-settings. Giữ file dưới 30KB; tính năng mới tách thành file fe-chat-* riêng.
function currentChatFilters() {
  const platform = chatEl('chatPlatform')?.value || ''
  const shop = chatEl('chatShop')?.value || ''
  const q = chatEl('chatSearch')?.value?.trim() || ''
  const qs = new URLSearchParams()
  if (platform) qs.set('platform', platform)
  if (shop) qs.set('shop', shop)
  if (q) qs.set('q', q)
  qs.set('limit', '60')
  qs.set('warm', '0')
  return qs.toString()
}

function applyPendingOrderJumpFilters() {
  const jump = chatState.pendingOrderJump
  if (!jump) return
  const platformInput = chatEl('chatPlatform')
  const searchInput = chatEl('chatSearch')
  if (platformInput && !jump.conversation?.id && jump.platform) {
    platformInput.value = String(jump.platform || '').toLowerCase()
  }
  if (searchInput && !jump.conversation?.id && jump.search_query) {
    searchInput.value = String(jump.search_query || '')
  }
}

async function handlePendingOrderChatJump() {
  const jump = chatState.pendingOrderJump
  if (!jump || chatState.pendingOrderJumpHandled) return
  chatState.pendingOrderJumpHandled = true

  if (jump.conversation?.id) {
    await openChatConversation(jump.conversation.id, { silent: false })
    const box = chatEl('chatReplyText')
    if (box && jump.prefill) {
      box.value = String(jump.prefill || '')
      box.focus()
      window.onChatReplyInput()
    }
    const title = document.querySelector('#chatThreadHeader .chat-thread-title')
    if (title && jump.warning) {
      title.insertAdjacentHTML('beforeend', `<small class="chat-thread-note">${chatEscape(String(jump.warning || ''))}</small>`)
    }
    if (jump.warning) {
      const tone = ['soft', 'created'].includes(String(jump.match_type || '').toLowerCase()) ? 'muted' : 'ok'
      setChatGuardStatus(String(jump.warning || ''), tone)
    }
    return
  }

  if (jump.warning) setChatGuardStatus(String(jump.warning || ''), jump.match_type === 'soft' ? 'muted' : 'blocked')
  const box = chatEl('chatMessages')
  if (box && !chatState.activeConversation) {
    box.innerHTML = `<div class="chat-empty">${chatEscape(jump.warning || 'Chưa tìm thấy hội thoại đã lưu cho đơn hàng này.')}</div>`
  }
}

function populateChatShopOptions() {
  const select = chatEl('chatShop')
  if (!select) return
  const selected = select.value
  const platform = chatEl('chatPlatform')?.value || ''
  const shops = chatState.shops.filter(shop => !platform || shop.platform === platform)
  select.innerHTML = '<option value="">Tất cả shop</option>' + shops.map(shop => {
    const name = shop.display_name || shop.shop_name || shop.user_name || shop.api_shop_id || ''
    const value = shop.api_shop_id || name
    const apiLabel = Number(shop.has_access_token)
      ? (String(shop.platform || '').toLowerCase() === 'lazada' ? ' (API · kiểm tra IM)' : ' (API)')
      : ''
    const label = `${chatPlatformLabel(shop.platform)} - ${name}${apiLabel}`
    return `<option value="${chatEscape(value)}">${chatEscape(label)}</option>`
  }).join('')
  if ([...select.options].some(opt => opt.value === selected)) select.value = selected
}

function chatAutomationPlan(options = {}) {
  const platformFilter = String(options.platform ?? chatEl('chatPlatform')?.value ?? '').toLowerCase()
  const shopFilter = String(options.shop ?? chatEl('chatShop')?.value ?? '').trim()

  const active = options.active === false ? null : chatState.activeConversation

  const targetFromShop = (shop, fallbackPlatform = platformFilter, fallbackShop = shopFilter) => {
    const platform = String(shop?.platform || fallbackPlatform || '').toLowerCase()
    const value = shop ? chatAutomationShopValue(shop) : fallbackShop
    if (platform === 'lazada') {
      return { useApi: true, platform, shop: value, reason: 'Lazada đã bỏ automation local. Chỉ đồng bộ bằng IM API chính thức hoặc xem dữ liệu đã lưu.' }
    }
    if (shop && !chatShopNeedsAutomation(shop)) {
      return { useApi: true, platform, shop: value, reason: `${chatPlatformLabel(platform)} ${value} đã có API, không mở Chrome automation.` }
    }
    if (platform === 'shopee' && !shop) {
      return { useApi: true, platform, shop: value, reason: 'Shop Shopee này chưa xác định là shop fallback nên ưu tiên API để tránh mở nhầm Chrome.' }
    }
    return {
      targets: [{
        platform,
        shop: value,
        max_shops: value ? 1 : 5,
        scan_mode: shop?.scan_mode || shop?.scan_policy?.mode || 'browser_inbox_summary',
        exclude_shops: chatAutomationApiReadyShopeeAliases()
      }],
      reason: `${chatPlatformLabel(platform)} ${value || 'fallback'} dùng automation local.`
    }
  }

  if (shopFilter) {
    return targetFromShop(chatFindShop(platformFilter, shopFilter), platformFilter, shopFilter)
  }

  if (!platformFilter && active?.platform) {
    const activePlatform = String(active.platform || '').toLowerCase()
    const activeShopValue = active.shop_id || active.shop || ''
    const activeShop = chatFindShop(activePlatform, activeShopValue)
    if (!activeShop && activePlatform === 'shopee' && String(active.conversation_id || '').startsWith('automation-')) {
      return {
        targets: [{ platform: activePlatform, shop: activeShopValue, max_shops: 1, scan_mode: 'browser_thread_detail', exclude_shops: chatAutomationApiReadyShopeeAliases() }],
        reason: 'Hội thoại Shopee này đến từ automation fallback, mở sâu để xác minh đúng khách.'
      }
    }
    return targetFromShop(activeShop, activePlatform, activeShopValue)
  }

  if (platformFilter) {
    const platformShops = (chatState.shops || []).filter(shop => String(shop.platform || '').toLowerCase() === platformFilter)
    const fallbackShops = platformShops.filter(chatShopNeedsAutomation)
    if (fallbackShops.length) {
      return {
        targets: fallbackShops.map(shop => ({
          platform: platformFilter,
          shop: chatAutomationShopValue(shop),
          max_shops: 1,
          scan_mode: shop.scan_mode || shop.scan_policy?.mode || 'browser_inbox_summary',
          exclude_shops: chatAutomationApiReadyShopeeAliases()
        })),
        reason: `Chỉ chạy automation cho ${fallbackShops.length.toLocaleString('vi-VN')} shop ${chatPlatformLabel(platformFilter)} cần fallback.`
      }
    }
    if (platformFilter === 'lazada') {
      return { useApi: true, platform: platformFilter, shop: '', reason: 'Lazada đã bỏ automation local. Chỉ dùng IM API chính thức.' }
    }
    return { useApi: true, platform: platformFilter, shop: '', reason: `${chatPlatformLabel(platformFilter)} đang có API, không mở Chrome automation.` }
  }

  const fallbackShops = (chatState.shops || []).filter(chatShopNeedsAutomation)
  if (!fallbackShops.length) {
    return { useApi: true, platform: '', shop: '', reason: 'Tất cả shop chat hiện có đang ưu tiên API, không mở Chrome tự động.' }
  }
  const blockedAliases = chatAutomationApiReadyShopeeAliases()
  return {
    targets: fallbackShops.map(shop => ({
      platform: String(shop.platform || '').toLowerCase(),
      shop: chatAutomationShopValue(shop),
      max_shops: 1,
      scan_mode: shop.scan_mode || shop.scan_policy?.mode || 'browser_inbox_summary',
      exclude_shops: blockedAliases
    })),
    reason: `Chỉ chạy Chrome cho ${fallbackShops.length.toLocaleString('vi-VN')} shop Shopee/TikTok còn browser_required; Lazada đã bỏ automation local.`
  }

}

window.toggleChatAutoAutomationSync = function() {
  chatState.autoAutomationEnabled = !chatState.autoAutomationEnabled
  localStorage.setItem(CHAT_AUTO_AUTOMATION_KEY, chatState.autoAutomationEnabled ? '1' : '0')
  syncChatAutoAutomationButton()
  setChatGuardStatus(
    chatState.autoAutomationEnabled
      ? 'Đã bật tự động đồng bộ automation. OMS sẽ chỉ chạy cho shop fallback hoặc hội thoại đang mở, không mở Chrome Shopee API.'
      : 'Đã tắt tự động đồng bộ automation.',
    chatState.autoAutomationEnabled ? 'ok' : 'muted'
  )
}

function chatAutomationRangeLabel() {
  const min = chatClampAutomationMinute(chatState.autoAutomationMinMinutes, 5)
  const max = chatClampAutomationMinute(chatState.autoAutomationMaxMinutes, min)
  return min === max
    ? `${min.toLocaleString('vi-VN')} phút`
    : `${min.toLocaleString('vi-VN')}-${max.toLocaleString('vi-VN')} phút`
}

function chatRandomAutomationMinutes() {
  const range = chatNormalizeAutomationRange(chatState.autoAutomationMinMinutes, chatState.autoAutomationMaxMinutes)
  const min = range.min
  const max = range.max
  if (min === max) return min
  return Math.floor(min + Math.random() * (max - min + 1))
}

function chatScheduleNextAutomationRun(fromTime = Date.now()) {
  const minutes = chatRandomAutomationMinutes()
  chatState.nextAutomationSyncAt = fromTime + minutes * 60 * 1000
  return minutes
}

function readChatAutomationSettingsForm(options = {}) {
  const enabled = Boolean(chatEl('chatAutoAutomationEnabled')?.checked)
  const range = chatNormalizeAutomationRange(
    chatEl('chatAutoAutomationMinMinutes')?.value || chatEl('chatAutoAutomationMinutes')?.value,
    chatEl('chatAutoAutomationMaxMinutes')?.value || chatEl('chatAutoAutomationMinutes')?.value
  )
  chatState.autoAutomationEnabled = enabled
  chatState.autoAutomationMinMinutes = range.min
  chatState.autoAutomationMaxMinutes = range.max
  chatState.autoAutomationMinutes = range.min
  if (options.persist) {
    localStorage.setItem(CHAT_AUTO_AUTOMATION_KEY, enabled ? '1' : '0')
    localStorage.setItem(CHAT_AUTO_AUTOMATION_MINUTES_KEY, String(range.min))
    localStorage.setItem(CHAT_AUTO_AUTOMATION_MIN_MINUTES_KEY, String(range.min))
    localStorage.setItem(CHAT_AUTO_AUTOMATION_MAX_MINUTES_KEY, String(range.max))
  }
  return { enabled, ...range }
}

function syncChatAutoAutomationButton() {
  const btn = chatEl('chatAutoAutomationBtn')
  if (btn) {
    btn.textContent = chatState.autoAutomationEnabled ? 'Tự động automation: Bật' : 'Tự động automation: Tắt'
    btn.classList.toggle('active', Boolean(chatState.autoAutomationEnabled))
  }
  const settingsBtn = chatEl('chatAutomationSettingsBtn')
  if (settingsBtn) {
    settingsBtn.textContent = chatState.autoAutomationEnabled
      ? `Cài đặt chat · tự động ${chatAutomationRangeLabel()}`
      : 'Cài đặt chat'
    settingsBtn.classList.toggle('active', Boolean(chatState.autoAutomationEnabled))
  }
}

function ensureChatAutomationSettingsModal() {
  let modal = chatEl('chatAutomationSettingsModal')
  if (modal) return modal
  modal = document.createElement('div')
  modal.id = 'chatAutomationSettingsModal'
  modal.className = 'chat-quick-modal chat-automation-modal chat-settings-modal'
  modal.hidden = true
  modal.innerHTML = `
    <div class="chat-quick-backdrop" onclick="closeChatAutomationSettings()"></div>
    <section class="chat-quick-dialog" role="dialog" aria-modal="true" aria-labelledby="chatAutomationSettingsTitle">
      <div class="chat-quick-head">
        <div>
          <strong id="chatAutomationSettingsTitle">Cài đặt chat sàn</strong>
          <small>Tách riêng phần cài đặt chat thành tab con để đổi luật, kiểm tra transport và chạy automation dễ hơn.</small>
        </div>
        <button type="button" class="chat-quick-close" onclick="closeChatAutomationSettings()" aria-label="Đóng">×</button>
      </div>
      <div class="chat-quick-body chat-settings-modal-body" id="chatAutomationSettingsBody"></div>
    </section>
  `
  document.body.appendChild(modal)
  return modal
}

function renderChatAutomationSettingsStatus() {
  const status = chatEl('chatAutomationSettingsStatus')
  if (!status) return
  const fallbackCount = (chatState.shops || []).filter(chatShopNeedsAutomation).length
  const apiAliasCount = chatAutomationApiReadyShopeeAliases().length
  const runtime = chatReadAutomationRuntimeSettings()
  const next = chatState.nextAutomationSyncAt && chatState.autoAutomationEnabled
    ? ` Lần tự chạy tiếp theo dự kiến sau ${Math.max(0, Math.ceil((chatState.nextAutomationSyncAt - Date.now()) / 60000)).toLocaleString('vi-VN')} phút.`
    : ''
  status.textContent = `Đang nhận diện ${fallbackCount.toLocaleString('vi-VN')} shop cần Chrome. Đã loại shop API khỏi automation: ${apiAliasCount.toLocaleString('vi-VN')} alias. Chrome ${runtime.browser_width}x${runtime.browser_height}px. Chu kỳ ngẫu nhiên: ${chatAutomationRangeLabel()}.${next}`
}

window.openChatAutomationSettings = async function(tab = 'automation') {
  chatState.activeSettingsTab = chatNormalizeSettingsTab(tab)
  const modal = ensureChatAutomationSettingsModal()
  renderChatAutomationSettingsModal()
  modal.hidden = false
  document.body.classList.add('chat-quick-modal-open')
  await window.setChatSettingsTab(chatState.activeSettingsTab, { skipOpen: true })
}

window.closeChatAutomationSettings = function() {
  const modal = chatEl('chatAutomationSettingsModal')
  if (modal) modal.hidden = true
  document.body.classList.remove('chat-quick-modal-open')
}

window.saveChatAutomationSettings = function() {
  const { enabled } = readChatAutomationSettingsForm({ persist: true })
  chatWriteAutomationRuntimeSettings({
    browser_width: chatEl('chatAutomationBrowserWidth')?.value,
    browser_height: chatEl('chatAutomationBrowserHeight')?.value,
    browser_left: chatEl('chatAutomationBrowserLeft')?.value,
    browser_top: chatEl('chatAutomationBrowserTop')?.value,
    browser_minimized: Boolean(chatEl('chatAutomationBrowserMinimized')?.checked),
    expand_browser_viewport: Boolean(chatEl('chatAutomationExpandViewport')?.checked)
  })
  const nextMinutes = enabled ? chatScheduleNextAutomationRun(Date.now()) : 0
  syncChatAutoAutomationButton()
  renderChatAutomationSettingsStatus()
  setChatGuardStatus(
    enabled
      ? `Đã bật automation cho shop fallback, chạy ngẫu nhiên mỗi ${chatAutomationRangeLabel()}. Hệ thống sẽ chạy thử ngay và lần sau dự kiến sau ${nextMinutes.toLocaleString('vi-VN')} phút.`
      : 'Đã tắt automation tự động cho shop fallback.',
    enabled ? 'ok' : 'muted'
  )
  if (enabled) {
    setTimeout(() => window.runChatAutomationNowFromSettings({ fromSave: true }).catch(() => null), 300)
  }
  renderChatAutomationSettingsModal()
  window.closeChatAutomationSettings()
}

window.runChatAutomationNowFromSettings = async function(options = {}) {
  const btn = chatEl('chatAutomationSyncBtn')
  const status = chatEl('chatAutomationSettingsStatus')
  const oldText = btn?.textContent || ''
  readChatAutomationSettingsForm({ persist: true })
  chatWriteAutomationRuntimeSettings({
    browser_width: chatEl('chatAutomationBrowserWidth')?.value,
    browser_height: chatEl('chatAutomationBrowserHeight')?.value,
    browser_left: chatEl('chatAutomationBrowserLeft')?.value,
    browser_top: chatEl('chatAutomationBrowserTop')?.value,
    browser_minimized: Boolean(chatEl('chatAutomationBrowserMinimized')?.checked),
    expand_browser_viewport: Boolean(chatEl('chatAutomationExpandViewport')?.checked)
  })
  syncChatAutoAutomationButton()
  if (status) status.textContent = 'Đang gọi helper local để chạy automation ngay...'
  if (btn) {
    btn.disabled = true
    btn.textContent = 'Đang chạy...'
  }
  try {
    const result = await window.syncChatAutomationContent({
      active: false,
      force: true,
      quiet: false,
      skipButton: true,
      limit: 5
    })
    if (result?.error) {
      throw new Error(chatErrorMessage(result, 'Helper local trả lỗi.'))
    }
    if (result?.skipped) {
      const reason = result.reason === 'missing_admin_token'
        ? 'Bạn cần đăng nhập OMS trước khi chạy automation để helper có quyền nhập tin vào core.'
        : result.reason === 'syncing'
          ? 'Automation đang chạy lượt khác, vui lòng chờ lượt hiện tại xong.'
          : 'Không có shop fallback nào cần chạy automation ở bộ lọc hiện tại.'
      if (status) status.textContent = reason
      setChatGuardStatus(reason, result.reason === 'missing_admin_token' ? 'blocked' : 'muted')
      return result
    }
    if (Object.prototype.hasOwnProperty.call(result || {}, 'pulled_messages')) {
      const pulled = Number(result?.pulled_messages || 0)
      const nextMinutes = chatScheduleNextAutomationRun(Date.now())
      if (status) {
        status.textContent = pulled
          ? `Shop đang có API chính thức: đã kéo ${pulled.toLocaleString('vi-VN')} tin mới bằng API. Lần kiểm tra fallback sau random khoảng ${nextMinutes.toLocaleString('vi-VN')} phút.`
          : `Shop đang có API chính thức: API đã kiểm tra, chưa có tin mới. Lần kiểm tra fallback sau random khoảng ${nextMinutes.toLocaleString('vi-VN')} phút.`
      }
      return result
    }
    const saved = Number(result?.saved_messages || 0)
    const checked = Number(result?.shops_checked || 0)
    const accepted = Number(result?.accepted_messages || 0)
    const nextMinutes = chatScheduleNextAutomationRun(Date.now())
    renderChatAutomationSettingsStatus()
    if (status) {
      status.textContent = saved
        ? `Đã chạy xong: nhập ${saved.toLocaleString('vi-VN')} tin mới. Lần tự chạy sau random khoảng ${nextMinutes.toLocaleString('vi-VN')} phút.`
        : `Đã chạy xong: kiểm tra ${checked.toLocaleString('vi-VN')} shop, đọc ${accepted.toLocaleString('vi-VN')} tin, chưa có tin mới. Lần tự chạy sau random khoảng ${nextMinutes.toLocaleString('vi-VN')} phút.`
    }
    return result
  } catch (error) {
    if (status) status.textContent = `Không chạy được automation: ${chatErrorMessage(error)}`
    throw error
  } finally {
    if (btn) {
      btn.disabled = false
      btn.textContent = oldText || 'Chạy automation ngay'
    }
  }
}
