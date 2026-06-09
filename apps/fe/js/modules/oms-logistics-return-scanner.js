export function createReturnScanner(ctx) {
  const {
    API,
    state,
    el,
    escapeHtml,
    labelProblemText,
    setDetailResult
  } = ctx;

  function isReturnScanToken(value) {
    const token = String(value || '').trim().replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9._-]+$/g, '')
    if (!token || token.length < 6 || token.length > 60) return false
    if (!/[0-9]/.test(token)) return false
    return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(token)
  }
  
  function addReturnScanCandidate(list, seen, value) {
    const token = String(value || '').trim().replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9._-]+$/g, '')
    if (!isReturnScanToken(token)) return
    const key = token.toUpperCase()
    if (seen.has(key)) return
    seen.add(key)
    list.push(token)
  }
  
  function addReturnScanJsonValues(list, seen, value, depth = 0) {
    if (depth > 3 || value == null) return
    if (typeof value === 'string' || typeof value === 'number') {
      addReturnScanCandidate(list, seen, value)
      return
    }
    if (Array.isArray(value)) {
      value.slice(0, 20).forEach(item => addReturnScanJsonValues(list, seen, item, depth + 1))
      return
    }
    if (typeof value !== 'object') return
    const fields = new Set(['orderid', 'ordersn', 'orderno', 'ordernumber', 'trackingnumber', 'trackingno', 'waybill', 'waybillno', 'logisticsno', 'shippingcode', 'packageno', 'packagenumber', 'returnsn'])
    Object.entries(value).forEach(([key, child]) => {
      const normalizedKey = String(key || '').replace(/[^a-z0-9]/gi, '').toLowerCase()
      if (fields.has(normalizedKey)) addReturnScanJsonValues(list, seen, child, depth + 1)
    })
  }
  
  function addReturnScanParams(list, seen, params) {
    const fields = new Set(['order_id', 'order_sn', 'order_no', 'orderid', 'ordersn', 'tracking_number', 'tracking_no', 'trackingnumber', 'waybill', 'waybill_no', 'logistics_no', 'package_no', 'return_sn'])
    for (const [key, value] of params.entries()) {
      const normalizedKey = String(key || '').replace(/[^a-z0-9_]/gi, '').toLowerCase()
      if (fields.has(normalizedKey)) addReturnScanCandidate(list, seen, value)
    }
  }
  
  function normalizeReturnScan(rawText) {
    const raw = String(rawText || '').trim()
    const seen = new Set()
    const candidates = []
    const decoded = (() => {
      try { return decodeURIComponent(raw) } catch { return raw }
    })()
    ;[raw, decoded].filter((item, index, arr) => item && arr.indexOf(item) === index).forEach(text => {
      try {
        const parsedUrl = /^https?:\/\//i.test(text) ? new URL(text) : null
        if (parsedUrl) {
          addReturnScanParams(candidates, seen, parsedUrl.searchParams)
          parsedUrl.pathname.split(/[\/\s]+/).forEach(part => addReturnScanCandidate(candidates, seen, part))
        }
      } catch {}
      try {
        const params = new URLSearchParams(text.replace(/^[?#]/, ''))
        if ([...params.keys()].length) addReturnScanParams(candidates, seen, params)
      } catch {}
      if (/^[\[{]/.test(text)) {
        try { addReturnScanJsonValues(candidates, seen, JSON.parse(text)) } catch {}
      }
      const keyedPattern = /(?:order|tracking|waybill|logistics|package|shipping|return)[_\-\s]*(?:id|sn|no|number|code)?\s*[:=]\s*["']?([A-Za-z0-9._-]{6,60})/gi
      for (const match of text.matchAll(keyedPattern)) addReturnScanCandidate(candidates, seen, match[1])
      addReturnScanCandidate(candidates, seen, text)
      for (const match of text.matchAll(/[A-Za-z0-9][A-Za-z0-9._-]{5,59}/g)) addReturnScanCandidate(candidates, seen, match[0])
    })
    // Tem hoàn/trả có thể là QR URL/JSON hoặc barcode vận đơn, nên cần rút về một mã sạch trước khi gửi API.
    return { raw, code: candidates[0] || raw, candidates }
  }
  
  function readScanCode(fallback = '') {
    return String(fallback || '').trim()
  }
  
  function speakReturnScan(text) {
    if (!text || !('speechSynthesis' in window)) return
    try {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'vi-VN'
      utterance.rate = 1.02
      window.speechSynthesis.speak(utterance)
    } catch {}
  }
  
  async function fetchPackingScan(code) {
    const response = await fetch(`${API}/api/cctv/scan-order?code=${encodeURIComponent(code)}`, { cache: 'no-store' })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || data.error) throw new Error(data.error || 'Không kiểm tra được mã.')
    return data
  }
  
  async function receiveReturnScan(scanCode) {
    const response = await fetch(`${API}/api/returns/receive-scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: scanCode, operator: 'Kho OMS' })
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || data.error) throw new Error(data.error || 'Không xác nhận được hàng hoàn.')
  
    let packingEvidence = null
    try {
      if (data.order?.order_id) packingEvidence = await fetchPackingScan(data.order.order_id)
    } catch {}
    const latestVideo = packingEvidence?.latest_video || data.evidence?.latest_video || null
    const evidence = packingEvidence?.evidence || data.evidence?.evidence || null
    return {
      tone: data.already_received ? 'warning' : 'success',
      title: data.message || 'Đã xác nhận hàng hoàn.',
      rows: [
        data.order?.order_id ? `Đơn: ${data.order.order_id}` : '',
        data.order?.platform ? `${data.order.platform} · ${data.order.shop || ''}` : '',
        data.order?.tracking_number ? `Mã vận đơn: ${data.order.tracking_number}` : '',
        data.order?.return_received_at ? `Thời gian nhận: ${data.order.return_received_at}` : '',
        latestVideo ? `Video khiếu nại: đã có lúc ${latestVideo.created_at || ''}` : 'Video khiếu nại: chưa có video đóng gói.',
        evidence?.complete_evidence ? 'Bộ bằng chứng: đủ video + tem hợp lệ.' : evidence?.video_ready ? 'Bộ bằng chứng: có video, cần kiểm tra tem nếu sàn yêu cầu.' : ''
      ].filter(Boolean),
      links: [
        latestVideo?.video_url ? { href: `${API}/api/file/${encodeURIComponent(latestVideo.video_url)}`, label: 'Tải video khiếu nại', download: true } : null,
        packingEvidence?.label?.valid && data.order?.order_id ? { href: `${API}/api/label/${encodeURIComponent(data.order.order_id)}.pdf`, label: 'Mở tem' } : null
      ].filter(Boolean),
      data
    }
  }
  
  async function checkLabel(code) {
    const scanCode = readScanCode(code)
    if (!scanCode) return setDetailResult({ tone: 'warning', title: 'Chưa có mã để kiểm tra tem.' })
    try {
      const data = await fetchPackingScan(scanCode)
      const orderId = data.order?.order_id || scanCode
      const label = data.label || {}
      const canRefreshLabel = label.label_status === 'eligible'
        && label.label_download_supported === true
        && label.label_download_read_only === true
        && label.label_download_requires_manual !== true
      setDetailResult({
        tone: label.valid ? 'success' : 'warning',
        title: label.valid ? `Tem hợp lệ cho đơn ${orderId}` : `Chưa có tem đã lưu cho đơn ${orderId}`,
        rows: [
          data.found ? `${data.order.platform || ''} · ${data.order.shop || ''}` : 'OMS chưa tìm thấy đơn theo mã này.',
          label.storage_key ? `File: ${label.storage_key}` : labelProblemText(label),
          data.evidence?.video_ready ? 'Video đóng gói: đã có để đối chiếu.' : 'Video đóng gói: chưa thấy trong kho video.',
          data.evidence?.label_required_for_packing ? 'TikTok cần có tem đã lưu trước khi chốt Đã đóng gói.' : ''
        ].filter(Boolean),
        link: label.valid ? { href: `${API}/api/label/${encodeURIComponent(orderId)}.pdf`, label: 'Mở tem' } : null,
        buttons: !label.valid && canRefreshLabel ? [{ label: 'Tải tem read-only', attr: `data-label-refresh-detail="${escapeHtml(orderId)}"` }] : [],
        data
      })
    } catch (error) {
      setDetailResult({ tone: 'danger', title: 'Không kiểm tra được tem.', rows: [error.message] })
    }
  }
  
  async function confirmReturnReceived(code, options = {}) {
    const scanCode = readScanCode(code)
    if (!scanCode) return setDetailResult({ tone: 'warning', title: 'Chưa có mã hoàn để xác nhận.' })
    if (!options.skipConfirm && !window.confirm(`Xác nhận đã nhận hàng hoàn về kho cho mã ${scanCode}?`)) return null
    try {
      const result = await receiveReturnScan(scanCode)
      if (!options.silent) setDetailResult(result)
      return result
    } catch (error) {
      const result = { tone: 'danger', title: 'Không thể xác nhận nhận hoàn.', rows: [error.message] }
      if (!options.silent) setDetailResult(result)
      return result
    }
  }
  
  function updateReturnScannerStatus(result = {}) {
    state.scanner.tone = result.tone || 'info'
    state.scanner.status = result.title || result.status || 'Sẵn sàng quét mã hoàn về.'
    state.scanner.rows = result.rows || []
    const box = el('returnScanStatus')
    if (box) {
      box.className = `return-scan-status ${escapeHtml(state.scanner.tone)}`
      box.innerHTML = `<b>${escapeHtml(state.scanner.status)}</b>${state.scanner.rows.map(row => `<span>${escapeHtml(row)}</span>`).join('')}`
    }
  }
  
  function renderScannerStatus() {
    const scanner = state.scanner
    const rows = (scanner.rows || [])
      .map(row => `<span>${escapeHtml(row)}</span>`)
      .join('')
    return `
      <div class="return-scan-status ${escapeHtml(scanner.tone || 'info')}" id="returnScanStatus">
        <b>${escapeHtml(scanner.status || 'Sẵn sàng quét mã hoàn về.')}</b>
        ${rows}
      </div>`
  }
  
  function renderReturnScanOverlay() {
    if (!state.scanner.open) return ''
    const expected = state.scanner.expectedCode ? `Đang nhận hoàn cho đơn: ${state.scanner.expectedCode}` : 'Quét mã đơn hoàn hoặc mã vận đơn.'
    return `
      <div class="return-scan-modal" role="dialog" aria-modal="true" aria-label="Quét mã đơn hoàn về shop">
        <div class="return-scan-camera">
          <video id="returnScanVideo" autoplay muted playsinline webkit-playsinline></video>
          <div class="return-scan-frame" aria-hidden="true"></div>
          <button type="button" class="return-scan-close" data-return-scan-close="1" aria-label="Đóng quét mã">×</button>
          <div class="return-scan-panel">
            <div class="return-scan-handle" aria-hidden="true"></div>
            <div class="return-scan-toolbar">
              <button type="button" class="return-scan-icon" data-return-scan-close="1" aria-label="Về danh sách">⌂</button>
              <button type="button" class="return-scan-icon danger" data-return-scan-close="1" aria-label="Dừng camera">▥</button>
              <button type="button" class="return-scan-main-btn">Quét QR code</button>
              <button type="button" class="return-scan-icon" aria-label="Cài đặt quét">☷</button>
            </div>
            <div class="return-scan-tabs" aria-label="Chế độ quét">
              <span>Đóng gói, Giao</span>
              <span>Xem</span>
              <span class="active">Hoàn</span>
            </div>
            <p class="return-scan-help">${escapeHtml(expected)} Quét thành công sẽ tự đánh dấu đơn đã hoàn về shop.</p>
            ${renderScannerStatus()}
          </div>
        </div>
      </div>`
  }
  
  function renderReturnScannerRoot() {
    let root = el('logisticsReturnScanner')
    if (!state.scanner.open) {
      root?.remove()
      return
    }
    if (!root) {
      root = document.createElement('div')
      root.id = 'logisticsReturnScanner'
      document.body.appendChild(root)
    }
    root.innerHTML = renderReturnScanOverlay()
  }
  
  function stopReturnScanCamera() {
    try {
      state.scanner.reader?.reset?.()
    } catch {}
    state.scanner.reader = null
    const video = el('returnScanVideo')
    try {
      const stream = video?.srcObject
      if (stream?.getTracks) stream.getTracks().forEach(track => track.stop())
      if (video) video.srcObject = null
    } catch {}
    state.scanner.inFlight = false
  }
  
  async function handleReturnCameraDecode(rawText) {
    const normalized = normalizeReturnScan(rawText)
    const scanCode = normalized.code
    const now = Date.now()
    if (!scanCode || state.scanner.inFlight) return
    if (scanCode === state.scanner.lastCode && now - state.scanner.lastAt < 2200) return
    state.scanner.inFlight = true
    state.scanner.lastCode = scanCode
    state.scanner.lastAt = now
    updateReturnScannerStatus({
      tone: 'warning',
      title: `Đã quét ${scanCode}. Đang xác nhận hoàn về shop...`,
      rows: normalized.raw !== scanCode ? ['QR đã được rút về mã sạch trước khi gửi API.'] : []
    })
    try {
      const result = await confirmReturnReceived(scanCode, { skipConfirm: true, silent: true })
      if (result) {
        updateReturnScannerStatus(result)
        setDetailResult(result)
      }
      const orderId = result?.data?.order?.order_id || scanCode
      speakReturnScan(result?.tone === 'success'
        ? `Đã nhận hoàn về shop cho đơn ${orderId}.`
        : `Mã ${scanCode} cần kiểm tra lại.`)
      if (navigator.vibrate) navigator.vibrate(result?.tone === 'success' ? [70, 40, 70] : [180])
    } catch (error) {
      updateReturnScannerStatus({ tone: 'danger', title: 'Không xác nhận được mã vừa quét.', rows: [error.message || String(error)] })
    } finally {
      window.setTimeout(() => {
        state.scanner.inFlight = false
        if (state.scanner.open) {
          updateReturnScannerStatus({
            tone: state.scanner.tone,
            title: state.scanner.lastCode ? `Sẵn sàng quét mã tiếp theo. Mã vừa quét: ${state.scanner.lastCode}` : 'Sẵn sàng quét mã tiếp theo.',
            rows: state.scanner.rows
          })
        }
      }, 1300)
    }
  }
  
  function buildReturnScannerHints() {
    const hints = new Map()
    if (!window.ZXing?.BarcodeFormat || !window.ZXing?.DecodeHintType) return hints
    const formats = [
      ZXing.BarcodeFormat.QR_CODE,
      ZXing.BarcodeFormat.CODE_128,
      ZXing.BarcodeFormat.CODE_39,
      ZXing.BarcodeFormat.ITF,
      ZXing.BarcodeFormat.EAN_13
    ].filter(Boolean)
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, formats)
    hints.set(ZXing.DecodeHintType.TRY_HARDER, true)
    return hints
  }
  
  async function startReturnScanCamera() {
    const video = el('returnScanVideo')
    if (!video || !state.scanner.open) return
    if (!window.ZXing?.BrowserMultiFormatReader) {
      updateReturnScannerStatus({ tone: 'danger', title: 'Trình đọc QR chưa tải xong.', rows: ['Hãy tải lại trang hoặc kiểm tra kết nối mạng.'] })
      return
    }
    stopReturnScanCamera()
    try {
      video.setAttribute('playsinline', 'true')
      video.setAttribute('webkit-playsinline', 'true')
      const reader = new ZXing.BrowserMultiFormatReader(buildReturnScannerHints(), 180)
      state.scanner.reader = reader
      // Camera này chỉ xác nhận nhận hàng hoàn nội bộ, không gửi thao tác lên sàn.
      const decodeTask = reader.decodeFromConstraints({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 24, max: 30 }
        }
      }, 'returnScanVideo', (result) => {
        if (result) handleReturnCameraDecode(result.getText())
      })
      decodeTask?.catch?.(error => {
        if (!state.scanner.open) return
        updateReturnScannerStatus({
          tone: 'danger',
          title: 'Camera quét mã bị ngắt.',
          rows: ['Hãy cho phép camera hoặc nhập mã thủ công nếu thiết bị không hỗ trợ.', error.message || String(error)]
        })
      })
      updateReturnScannerStatus({ tone: 'info', title: 'Camera đã sẵn sàng. Đưa mã đơn hoàn vào khung quét.' })
    } catch (error) {
      updateReturnScannerStatus({
        tone: 'danger',
        title: 'Không mở được camera quét mã.',
        rows: ['Trên điện thoại hãy cho phép camera, hoặc dùng xác nhận thủ công nếu thiết bị không hỗ trợ.', error.message || String(error)]
      })
    }
  }
  
  function openReturnScanCamera(code = '') {
    state.scanner.open = true
    state.scanner.expectedCode = readScanCode(code)
    state.scanner.status = 'Đưa mã đơn hoàn/mã vận đơn vào khung quét.'
    state.scanner.tone = 'info'
    state.scanner.rows = []
    renderReturnScannerRoot()
    window.requestAnimationFrame(() => startReturnScanCamera())
  }
  
  function closeReturnScanCamera() {
    stopReturnScanCamera()
    state.scanner.open = false
    renderReturnScannerRoot()
  }

  return {
    readScanCode,
    fetchPackingScan,
    checkLabel,
    confirmReturnReceived,
    openReturnScanCamera,
    closeReturnScanCamera
  };
}
