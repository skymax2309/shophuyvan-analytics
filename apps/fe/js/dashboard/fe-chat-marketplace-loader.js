// NEO: Loader frontend chat sàn nạp các file fe-chat-* theo thứ tự, không đặt trùng tên backend.
(function loadSplitChatDashboard() {
  var current = document.currentScript
  var base = current && current.src ? current.src.replace(/fe-chat-marketplace-loader\.js(?:\?.*)?$/, 'fe-chat-marketplace/') : '../js/dashboard/fe-chat-marketplace/'
  var version = 'fe-chat-marketplace-20260513g'
  var parts = [
    'fe-chat-foundation-state-utils.js',
    'fe-chat-shop-capability-settings.js',
    'fe-chat-settings-quick-replies.js',
    'fe-chat-product-catalog-modal.js',
    'fe-chat-knowledge-order-sync-base.js',
    'fe-chat-message-media-fetch-automation-send.js',
    'fe-chat-filters-automation-settings.js',
    'fe-chat-context-tab-product-advisory-status.js',
    'fe-chat-ai-shop-controls.js',
    'fe-chat-settings-api-knowledge-panels.js',
    'fe-chat-order-product-context-panels.js',
    'fe-chat-voucher-rule-setup-panels.js',
    'fe-chat-conversation-thread-render.js',
    'fe-chat-notification-settings-data.js',
    'fe-chat-product-advisory-editor.js',
    'fe-chat-order-product-actions.js',
    'fe-chat-context-media-guard-send.js',
    'fe-chat-conversations-sync-actions.js',
    'fe-chat-realtime-bootstrap.js'
  ]

  Promise.all(parts.map(function (name) {
    return fetch(base + name + '?v=' + version).then(function (response) {
      if (!response.ok) throw new Error('Không tải được mảnh chat ' + name)
      return response.text()
    })
  })).then(function (sources) {
    var script = document.createElement('script')
    script.text = sources.join('\n')
    document.head.appendChild(script)
    window.dispatchEvent(new CustomEvent('shv-chat-ready'))
    if (document.readyState !== 'loading' && typeof window.loadChat === 'function' && !window.__shvChatAutoLoaded) {
      window.__shvChatAutoLoaded = true
      window.loadChat().catch(function () {})
    }
  }).catch(function (error) {
    console.error('[CHAT_SPLIT]', error)
    var box = document.getElementById('chatSetupStatus') || document.getElementById('chatStatus')
    if (box) box.textContent = 'Không tải được module chat đã tách nhỏ: ' + (error && error.message ? error.message : error)
  })
})()
