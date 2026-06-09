import {
  getOrderStatusValue,
  normalizeOrderStatusCore,
  orderStatusKind,
  orderStatusLabel,
  orderStatusParent,
  orderTypeFromStatus
} from './status-core.js'
import { buildOrderStatusAutomationMeta } from './status-automation-core.js'
import { resolveOrderDataSource } from './order-data-source-resolver.js'

function cleanOrderReadText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function lowerOrderReadText(value) {
  return cleanOrderReadText(value).toLowerCase()
}

function numberOrderRead(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function labelUrlFromStorage(orderId, storageKey = '') {
  const key = cleanOrderReadText(storageKey)
  if (!key) return ''
  const lower = key.toLowerCase()
  const ext = lower.endsWith('.html') || lower.endsWith('.htm') ? 'html' : 'pdf'
  return `/api/label/${encodeURIComponent(cleanOrderReadText(orderId))}.${ext}`
}

function isValidLabelDocument(row = {}, storageKey = '', explicitUrl = '') {
  const path = cleanOrderReadText(storageKey || explicitUrl).toLowerCase()
  const contentType = cleanOrderReadText(row.label_content_type || row.content_type || row.label_mime_type).toLowerCase()
  if (!path && !contentType) return false
  if (path.endsWith('.html') || path.endsWith('.htm') || contentType.includes('html')) return false
  if (path.endsWith('.pdf') || contentType.includes('application/pdf')) return true
  return false
}

function truthyOrderReadFlag(value) {
  return value === true || value === 1 || value === '1'
}

function deriveLabelDownloadCapability(row = {}, platform = '') {
  const explicitMode = lowerOrderReadText(row.label_download_mode)
  if (explicitMode) {
    return {
      label_download_mode: explicitMode,
      label_download_supported: truthyOrderReadFlag(row.label_download_supported),
      label_download_source: cleanOrderReadText(row.label_download_source),
      label_download_reason: cleanOrderReadText(row.label_download_reason),
      label_download_read_only: truthyOrderReadFlag(row.label_download_read_only),
      label_download_requires_manual: truthyOrderReadFlag(row.label_download_requires_manual)
    }
  }

  const refreshMode = lowerOrderReadText(row.label_refresh_mode || row.refresh_mode)
  const apiConnected = numberOrderRead(row.label_api_connected ?? row.api_connected) > 0
  if (['shopee', 'lazada'].includes(platform) && apiConnected && (refreshMode === 'api' || !refreshMode)) {
    const isLazada = platform === 'lazada'
    return {
      label_download_mode: isLazada ? 'api_print_awb_read_only' : 'api_document_generation_then_download',
      label_download_supported: true,
      label_download_source: isLazada
        ? 'lazada_fulfillment:order.package.document.get'
        : 'shopee_open_platform:logistics.create_shipping_document>get_shipping_document_result>download_shipping_document',
      label_download_reason: isLazada
        ? 'Shop có API tem read-only qua PrintAWB/package document.'
        : 'Shop có API tem qua flow chứng từ in chính thức: tạo chứng từ in, kiểm READY rồi tải PDF. Không gọi endpoint đổi trạng thái giao hàng.',
      label_download_read_only: true,
      label_download_requires_manual: false
    }
  }

  if (['shopee', 'lazada', 'tiktok'].includes(platform)) {
    return {
      label_download_mode: 'manual_required',
      label_download_supported: false,
      label_download_source: platform === 'tiktok' ? 'tiktok_no_official_label_api_in_core' : `${platform}_manual_or_browser`,
      label_download_reason: platform === 'tiktok'
        ? 'TikTok chưa có API tải tem chính thức trong Core.'
        : 'Shop chưa có capability tải tem read-only đã xác minh.',
      label_download_read_only: false,
      label_download_requires_manual: true
    }
  }

  return {
    label_download_mode: 'not_supported',
    label_download_supported: false,
    label_download_source: 'unsupported_platform',
    label_download_reason: 'Sàn/shop này chưa hỗ trợ tải tem trong OMS.',
    label_download_read_only: false,
    label_download_requires_manual: false
  }
}

function orderReadSourceBadge(source, confidence = '') {
  const src = lowerOrderReadText(source)
  const conf = lowerOrderReadText(confidence)
  if (src.includes('api') || src.includes('open_platform')) return 'API'
  if (src.includes('snapshot') || src.includes('d1') || conf === 'confirmed' || conf === 'snapshot') return 'Snapshot'
  if (src.includes('manual') || src.includes('import') || src.includes('fallback') || conf === 'fallback') return 'Fallback'
  if (src.includes('estimate') || conf === 'estimated') return 'Estimated'
  return 'Missing'
}

export function buildOrderLabelState(row = {}, statusCore = null) {
  const core = statusCore || normalizeOrderStatusCore(row)
  const orderId = cleanOrderReadText(row.order_id || row.platform_order_id)
  const storageKey = cleanOrderReadText(
    row.label_file_path ||
    row.label_storage_key ||
    row.shipping_label_path ||
    row.storage_key
  )
  const explicitUrl = cleanOrderReadText(row.shipping_label_url || row.label_url)
  const lastError = cleanOrderReadText(row.last_label_error || row.label_error || row.error)
  const lastDownloadedAt = cleanOrderReadText(row.last_label_download_at || row.label_refreshed_at || row.refreshed_at)
  const platform = lowerOrderReadText(row.platform)
  const labelCapability = deriveLabelDownloadCapability(row, platform)
  const labelDocumentValid = isValidLabelDocument(row, storageKey, explicitUrl)
  const trackingNumber = cleanOrderReadText(row.tracking_number || row.tracking_core_tracking_number || row.core_tracking_number)
  const labelValid = Boolean(labelDocumentValid && trackingNumber && !lastError)
  const supportedPlatform = ['shopee', 'lazada', 'tiktok'].includes(platform)
  const terminal = Boolean(core.terminal_status)
  const fulfillment = cleanOrderReadText(core.fulfillment_status_core).toUpperCase()
  const readyForLabel = [
    'READY_TO_SHIP',
    'PROCESSED',
    'LOGISTICS_REQUEST_CREATED',
    'LOGISTICS_PACKAGED',
    'ADVANCE_FULFILMENT',
    'SHIPPED',
    'TO_CONFIRM_RECEIVE'
  ].includes(fulfillment)

  const lowerLastError = lowerOrderReadText(lastError)
  const retryLabelState = (() => {
    if (!lowerLastError || lowerLastError === 'not_found') return null
    if (
      lowerLastError.includes('pending_document_generation') ||
      lowerLastError.includes('shopee_pdf_not_ready') ||
      lowerLastError.includes('package should print first') ||
      lowerLastError.includes('shipping document') && lowerLastError.includes('ready')
    ) {
      return {
        label_status: 'pending_document_generation',
        label_reason: 'Chưa có file tem, hệ thống đang tạo chứng từ in và sẽ thử lại.'
      }
    }
    if (
      lowerLastError.includes('pending_retry') ||
      lowerLastError.includes('lazada_batch_requeued') ||
      lowerLastError.includes('subrequest') ||
      lowerLastError.includes('too many')
    ) {
      return {
        label_status: 'pending_retry',
        label_reason: 'Batch tải tem quá lớn, hệ thống sẽ tự chia nhỏ và thử lại.'
      }
    }
    return null
  })()

  if (['manual_required', 'label_download_blocked', 'tiktok_label_not_saved_before_packed'].includes(lastError)) {
    return {
      label_eligible: false,
      label_status: 'manual_required',
      label_reason: lastError === 'tiktok_label_not_saved_before_packed' ? lastError : (labelCapability.label_download_reason || lastError),
      label_valid: false,
      shipping_label_url: explicitUrl || labelUrlFromStorage(orderId, storageKey),
      label_file_path: storageKey,
      last_label_download_at: lastDownloadedAt,
      last_label_error: lastError,
      ...labelCapability
    }
  }

  if (retryLabelState) {
    return {
      label_eligible: false,
      label_status: retryLabelState.label_status,
      label_reason: retryLabelState.label_reason,
      label_valid: false,
      shipping_label_url: explicitUrl || labelUrlFromStorage(orderId, storageKey),
      label_file_path: storageKey,
      last_label_download_at: lastDownloadedAt,
      last_label_error: lastError,
      ...labelCapability
    }
  }

  if (lastError && lastError !== 'not_found' && !labelDocumentValid && (terminal || !readyForLabel)) {
    return {
      label_eligible: false,
      label_status: 'not_ready',
      label_reason: terminal ? 'Đơn đã ở trạng thái kết thúc.' : 'Đơn chưa tới bước có thể tải tem.',
      label_valid: false,
      shipping_label_url: '',
      label_file_path: storageKey,
      label_content_type: cleanOrderReadText(row.label_content_type || row.content_type || row.label_mime_type),
      last_label_download_at: lastDownloadedAt,
      last_label_error: lastError,
      ...labelCapability
    }
  }

  if (lastError && lastError !== 'not_found') {
    return {
      label_eligible: false,
      label_status: 'error',
      label_reason: lastError,
      label_valid: false,
      shipping_label_url: explicitUrl || labelUrlFromStorage(orderId, storageKey),
      label_file_path: storageKey,
      last_label_download_at: lastDownloadedAt,
      last_label_error: lastError,
      ...labelCapability
    }
  }

  if (storageKey || explicitUrl) {
    if (!labelValid) {
      const reason = !trackingNumber
        ? 'Chưa có tracking thật nên file tem chưa được coi là hợp lệ.'
        : (!labelDocumentValid ? 'File tem không phải PDF hợp lệ, cần tải lại tem.' : 'Tem chưa hợp lệ.')
      return {
        label_eligible: Boolean(trackingNumber && labelCapability.label_download_supported),
        label_status: trackingNumber ? 'missing_file' : 'missing',
        label_reason: reason,
        label_valid: false,
        shipping_label_url: '',
        label_file_path: storageKey,
        label_content_type: cleanOrderReadText(row.label_content_type || row.content_type || row.label_mime_type),
        last_label_download_at: lastDownloadedAt,
        last_label_error: !trackingNumber ? 'tracking_number_missing' : 'invalid_label_file',
        ...labelCapability
      }
    }
    return {
      label_eligible: true,
      label_status: 'downloaded',
      label_reason: 'Đã có tem trong kho.',
      label_valid: true,
      shipping_label_url: explicitUrl || labelUrlFromStorage(orderId, storageKey),
      label_file_path: storageKey,
      label_content_type: cleanOrderReadText(row.label_content_type || row.content_type || row.label_mime_type),
      last_label_download_at: lastDownloadedAt,
      last_label_error: '',
      ...labelCapability
    }
  }

  if (!supportedPlatform) {
    return {
      label_eligible: false,
      label_status: 'not_supported',
      label_reason: 'Sàn này chưa hỗ trợ tem trong OMS.',
      label_valid: false,
      shipping_label_url: '',
      label_file_path: '',
      last_label_download_at: lastDownloadedAt,
      last_label_error: lastError === 'not_found' ? '' : lastError,
      ...labelCapability
    }
  }

  if (core.order_status_core === 'UNKNOWN') {
    return {
      label_eligible: false,
      label_status: 'not_ready',
      label_reason: 'Trạng thái đơn chưa được Order Status Core nhận diện.',
      label_valid: false,
      shipping_label_url: '',
      label_file_path: '',
      last_label_download_at: lastDownloadedAt,
      last_label_error: lastError === 'not_found' ? '' : lastError,
      ...labelCapability
    }
  }

  if (terminal || !readyForLabel) {
    return {
      label_eligible: false,
      label_status: 'not_ready',
      label_reason: terminal ? 'Đơn đã ở trạng thái kết thúc.' : 'Đơn chưa tới bước có thể tải tem.',
      label_valid: false,
      shipping_label_url: '',
      label_file_path: '',
      last_label_download_at: lastDownloadedAt,
      last_label_error: lastError === 'not_found' ? '' : lastError,
      ...labelCapability
    }
  }

  if (!labelCapability.label_download_supported || !labelCapability.label_download_read_only || labelCapability.label_download_requires_manual) {
    return {
      label_eligible: false,
      label_status: labelCapability.label_download_mode === 'not_supported' ? 'not_supported' : 'manual_required',
      label_reason: labelCapability.label_download_reason || 'Shop/sàn chưa có capability tải tem read-only đã xác minh.',
      label_valid: false,
      shipping_label_url: '',
      label_file_path: '',
      last_label_download_at: lastDownloadedAt,
      last_label_error: lastError === 'not_found' ? '' : lastError,
      ...labelCapability
    }
  }

  return {
    label_eligible: true,
    label_status: 'eligible',
    label_reason: 'Đơn đủ điều kiện tải tem, chưa có file trong kho.',
    label_valid: false,
    shipping_label_url: '',
    label_file_path: '',
    last_label_download_at: lastDownloadedAt,
    last_label_error: lastError === 'not_found' ? '' : lastError,
    ...labelCapability
  }
}

export function orderCoreSourceMeta(row = {}, fee = {}) {
  const sourceResolution = resolveOrderDataSource(row)
  if (sourceResolution.source_priority === 'official_api_first') {
    const rawStatusSource = cleanOrderReadText(row.status_source || row.source_detail || row.source_mode)
    const statusSource = lowerOrderReadText(rawStatusSource).includes('seller_center')
      ? sourceResolution.status_source
      : (rawStatusSource || sourceResolution.status_source)
    const updatedAt = cleanOrderReadText(
      row.source_updated_at
      || row.oms_updated_at
      || fee?.updated_at
      || row.fee_synced_at
      || row.order_date
      || row.created_at
    )
    return {
      source: sourceResolution.source,
      confidence: 'confirmed',
      badge: 'API',
      updated_at: updatedAt,
      status_source: statusSource,
      source_priority: sourceResolution.source_priority,
      source_label: sourceResolution.source_label,
      seller_center_allowed: sourceResolution.seller_center_allowed,
      docs_checked: sourceResolution.docs_checked,
      api_missing_reason: sourceResolution.api_missing_reason,
      source_mismatch: sourceResolution.source_mismatch,
      raw_source: cleanOrderReadText(row.source_mode || row.source_detail || row.status_source || '')
    }
  }

  const source = cleanOrderReadText(
    row.source_mode
    || fee?.source
    || row.fee_source
    || 'orders_v2_snapshot'
  )
  const updatedAt = cleanOrderReadText(
    row.source_updated_at
    || row.oms_updated_at
    || fee?.updated_at
    || row.fee_synced_at
    || row.order_date
    || row.created_at
  )
  const confidence = lowerOrderReadText(source).includes('api')
    ? 'confirmed'
    : (source ? 'snapshot' : 'missing')
  return {
    source: source || 'missing',
    confidence,
    badge: orderReadSourceBadge(source, confidence),
    updated_at: updatedAt,
    status_source: sourceResolution.status_source || source,
    source_priority: sourceResolution.source_priority,
    source_label: sourceResolution.source_label,
    seller_center_allowed: sourceResolution.seller_center_allowed,
    docs_checked: sourceResolution.docs_checked,
    api_missing_reason: sourceResolution.api_missing_reason,
    source_mismatch: sourceResolution.source_mismatch,
    raw_source: cleanOrderReadText(row.source_mode || row.source_detail || row.status_source || '')
  }
}

function orderSyncResult(status, label, reason = '', tone = 'info') {
  return { status, label, reason, tone }
}

function parseTrackingEventsCount(row = {}) {
  const direct = Number(row.tracking_events_count)
  if (Number.isFinite(direct) && direct > 0) return direct
  try {
    const events = JSON.parse(row.tracking_events_json || row.tracking_events || '[]')
    return Array.isArray(events) ? events.length : 0
  } catch {
    return 0
  }
}

function trackingNumberFromCore(row = {}) {
  return cleanOrderReadText(
    row.tracking_number
    || row.tracking_core_tracking_number
    || row.core_tracking_number
  )
}

function hasRealTrackingNumber(row = {}) {
  return Boolean(trackingNumberFromCore(row))
}

function hasTrackingSignal(row = {}) {
  return Boolean(
    trackingNumberFromCore(row)
    || parseTrackingEventsCount(row) > 0
    || cleanOrderReadText(row.tracking_core_source || row.tracking_source)
  )
}

function hasProcessedLabel(label = {}) {
  if (label.label_valid !== true) return false
  const status = lowerOrderReadText(label.label_status)
  const path = cleanOrderReadText(label.label_file_path || label.shipping_label_url)
  if ([
    'creating_document',
    'pending_document_generation',
    'pending_retry',
    'shopee_pdf_not_ready',
    'not_ready',
    'manual_required',
    'eligible',
    'missing_file',
    'error',
    'missing',
    'not_supported'
  ].includes(status)) return false
  return ['downloaded', 'ready', 'printed'].includes(status) || Boolean(path)
}

function labelNeedsProcessing(label = {}) {
  const status = lowerOrderReadText(label.label_status)
  return !hasProcessedLabel(label) || [
    'creating_document',
    'pending_document_generation',
    'pending_retry',
    'shopee_pdf_not_ready',
    'not_ready',
    'manual_required',
    'eligible',
    'missing_file',
    'error',
    'missing'
  ].includes(status)
}

export function buildOmsProcessingState(row = {}, labelState = null, statusCore = null) {
  const label = labelState || buildOrderLabelState(row, statusCore)
  const core = statusCore || normalizeOrderStatusCore(row)
  const hasLabel = hasProcessedLabel(label)
  const hasTracking = hasRealTrackingNumber(row)
  const terminal = Boolean(core.terminal_status)
  const pendingCore = core.order_status_core !== 'UNKNOWN' && !terminal
  const processedReady = hasLabel && hasTracking
  const reason = processedReady
    ? 'label_and_tracking_ready'
    : (!hasLabel
      ? (label.label_status === 'pending_document_generation' ? 'pending_label_document' : 'missing_label')
      : 'missing_tracking')

  // Tem không hợp lệ vẫn phải vào luồng Chờ Tem In dù đơn đã ở trạng thái kết thúc.
  if (hasTracking && !hasLabel) {
    return {
      oms_processing_bucket: 'waiting_label',
      left_nav_group: 'Chờ Xử Lý',
      left_nav_subgroup: label.label_status === 'error' || label.label_status === 'pending_retry'
        ? 'Lỗi Tem'
        : 'Chờ Tem In',
      processing_bucket_reason: reason
    }
  }

  if (pendingCore && !hasTracking) {
    return {
      oms_processing_bucket: 'unprocessed',
      left_nav_group: 'Chờ Xử Lý',
      left_nav_subgroup: 'Chưa Xử Lý',
      processing_bucket_reason: reason
    }
  }

  if (processedReady && pendingCore) {
    return {
      oms_processing_bucket: 'processed',
      left_nav_group: 'Chờ Xử Lý',
      left_nav_subgroup: 'Đã Xử Lý',
      processing_bucket_reason: reason
    }
  }

  return {
    oms_processing_bucket: terminal ? 'terminal' : 'unknown',
    left_nav_group: terminal ? '' : 'Chờ Xử Lý',
    left_nav_subgroup: terminal ? '' : 'Chưa Xử Lý',
    processing_bucket_reason: reason
  }
}

function financeSourceForRead(row = {}) {
  return cleanOrderReadText(
    row.finance_source
    || row.fee_breakdown?.taxonomy?.finance_source
    || row.fee_source
    || row.actual_income_source
    || row.estimated_income_source
  )
}

function financeBadgeForRead(row = {}) {
  return cleanOrderReadText(
    row.finance_badge_source
    || row.fee_display_badge
    || row.fee_breakdown?.badge_text
    || row.fee_breakdown?.badge_tone
  )
}

function financeConfidenceForRead(row = {}) {
  return lowerOrderReadText(
    row.finance_confidence
    || row.fee_breakdown?.taxonomy?.finance_confidence
    || row.actual_income_confidence
    || row.profit_status
  )
}

function financeSettlementForRead(row = {}) {
  return lowerOrderReadText(
    row.settlement_status
    || row.fee_breakdown?.taxonomy?.settlement_status
    || row.profit_status
  )
}

function buildFinanceSyncState(row = {}) {
  const source = financeSourceForRead(row)
  const sourceLower = lowerOrderReadText(source)
  const badgeLower = lowerOrderReadText(financeBadgeForRead(row))
  const confidence = financeConfidenceForRead(row)
  const settlement = financeSettlementForRead(row)
  const actualIncomeAvailable = row.actual_income_available === false || row.actual_income_available === 0 || row.actual_income_available === '0'
    ? false
    : row.actual_income_available
  const hasActualIncome = row.actual_income !== null && row.actual_income !== undefined && row.actual_income !== ''
  const hasSettlement = row.actual_income_settlement !== null && row.actual_income_settlement !== undefined && row.actual_income_settlement !== ''
  const isTiktokFinanceTransaction = sourceLower.includes('tiktok_seller_center_finance_transaction')
  const isCostSettingFallback = sourceLower.includes('cost_setting')
    || sourceLower.includes('cost settings')
    || badgeLower.includes('cost setting')
    || confidence.includes('estimated_from_cost_setting')
  const isMissingSource = !source || sourceLower.startsWith('missing:')
  const isPendingSettlement = settlement.includes('pending_settlement')
    || settlement.includes('pending_return_settlement')
    || settlement.includes('missing_lazada_finance_api')
    || settlement.includes('estimated_no_payment_sync')
    || actualIncomeAvailable === false
  const hasConfirmedIncome = !isCostSettingFallback
    && !isMissingSource
    && actualIncomeAvailable !== false
    && (hasActualIncome || hasSettlement)
    && (
      confidence === 'confirmed'
      || confidence === 'actual'
      || settlement === 'confirmed'
      || settlement === 'settled'
      || settlement === 'completed'
    )

  let status = 'missing'
  let health = 'needs_finance_sync'
  let missingReason = 'Chưa có nguồn Finance Core đủ để xác nhận phí hoặc settlement.'
  let skipReason = ''
  if (hasConfirmedIncome) {
    status = 'complete'
    health = 'complete'
    missingReason = ''
    skipReason = 'finance_confirmed'
  } else if (isCostSettingFallback) {
    status = 'fallback_only'
    health = 'cost_setting_fallback'
    missingReason = 'Finance Core đang dùng cost setting fallback, cần đồng bộ phí từ sàn.'
  } else if (isPendingSettlement) {
    status = settlement.includes('return') ? 'pending_return_settlement' : 'pending_settlement'
    health = 'pending_settlement'
    missingReason = 'Sàn chưa trả settlement hợp lệ để chốt tài chính.'
  }

  return {
    finance_health: health,
    finance_needs_resync: status !== 'complete',
    finance_source: source || 'missing',
    finance_badge_source: isCostSettingFallback
      ? 'cost_setting_fallback'
      : (sourceLower.includes('tiktok_seller_center_finance_transaction')
        ? 'tiktok_seller_center_finance_transaction'
        : (sourceLower.includes('tiktok_seller_center')
          ? 'tiktok_seller_center'
          : (sourceLower.includes('seller_center') ? 'seller_center' : (sourceLower.includes('api') || sourceLower.includes('open_platform') ? 'api' : source || 'missing')))),
    finance_sync_status: status,
    finance_skip_reason: skipReason,
    finance_missing_reason: missingReason,
    finance_confidence: confidence || 'missing',
    last_finance_synced_at: cleanOrderReadText(row.last_finance_synced_at || row.fee_synced_at || row.source_updated_at),
    last_finance_error: cleanOrderReadText(row.last_finance_error || row.finance_error || row.last_fee_error)
  }
}

export function buildOrderModuleSyncState(row = {}, source = null, labelState = null, statusCore = null) {
  const resolvedSource = source || orderCoreSourceMeta(row)
  const label = labelState || buildOrderLabelState(row, statusCore)
  const core = statusCore || normalizeOrderStatusCore(row)
  const processing = buildOmsProcessingState(row, label, core)
  const detailUrl = cleanOrderReadText(row.seller_center_detail_url || row.source_url)
  const hasDetailSnapshot = Boolean(detailUrl || cleanOrderReadText(row.source_updated_at || row.detail_url_verified_at))
  const sourcePriority = cleanOrderReadText(resolvedSource.source_priority)
  const chatStatus = lowerOrderReadText(row.chat_sync_status || row.chat_open_status)
    || (cleanOrderReadText(row.conversation_id || row.chat_conversation_id) ? 'ready' : 'unknown')

  return {
    operation_sync_status: core.order_status_core === 'UNKNOWN'
      ? 'missing'
      : (processing.oms_processing_bucket === 'waiting_label'
        ? 'waiting_label_file'
        : (processing.oms_processing_bucket === 'unprocessed' && labelNeedsProcessing(label) ? 'pending_label' : 'complete')),
    detail_sync_status: sourcePriority === 'official_api_first'
      ? 'complete'
      : (hasDetailSnapshot ? 'complete' : (sourcePriority === 'warehouse_snapshot' ? 'manual_required' : 'missing')),
    tracking_sync_status: hasRealTrackingNumber(row) ? 'complete' : 'missing',
    label_sync_status: lowerOrderReadText(label.label_status) || 'missing',
    chat_sync_status: chatStatus,
    ...buildFinanceSyncState(row)
  }
}

export function buildOrderSyncCompleteness(row = {}, source = null, labelState = null, statusCore = null) {
  const resolvedSource = source || orderCoreSourceMeta(row)
  const label = labelState || buildOrderLabelState(row, statusCore)
  const core = statusCore || normalizeOrderStatusCore(row)
  const moduleSync = buildOrderModuleSyncState(row, resolvedSource, label, core)
  const platform = lowerOrderReadText(row.platform)
  const tracking = trackingNumberFromCore(row)
  const trackingEventsCount = parseTrackingEventsCount(row)
  const trackingSource = lowerOrderReadText(row.tracking_core_source || row.tracking_source)
  const hasApiTrackingTimeline = trackingEventsCount > 0 && (
    trackingSource.includes('api') ||
    trackingSource.includes('open_platform') ||
    trackingSource.includes('tracking_core')
  )
  const sourcePriority = cleanOrderReadText(resolvedSource.source_priority)
  const sourceMismatch = cleanOrderReadText(resolvedSource.source_mismatch || row.source_mismatch)
  const settlementStatus = lowerOrderReadText(row.settlement_status || row.finance_confidence || row.profit_status)
  const actualIncomeAvailable = row.actual_income_available === false || row.actual_income_available === 0 || row.actual_income_available === '0'
    ? false
    : row.actual_income_available
  const hasFinanceSource = Boolean(cleanOrderReadText(row.fee_source || row.actual_income_source || row.finance_source))
  const detailUrl = cleanOrderReadText(row.seller_center_detail_url || row.source_url)

  if (sourceMismatch && sourcePriority !== 'official_api_first') {
    return orderSyncResult('error', 'Nguồn dữ liệu sai', sourceMismatch, 'bad')
  }

  const labelRetryIsOldBatch = ['pending_retry', 'lazada_batch_requeued'].includes(label.label_status)
    && lowerOrderReadText(`${label.label_reason || ''} ${label.last_label_error || ''}`).includes('batch')
  if (['error', 'pending_retry', 'pending_document_generation', 'shopee_pdf_not_ready', 'lazada_batch_requeued'].includes(label.label_status) && !(hasApiTrackingTimeline && labelRetryIsOldBatch)) {
    if (label.label_status === 'pending_document_generation' || label.label_status === 'shopee_pdf_not_ready') {
      return orderSyncResult('missing_label', 'Đang tạo chứng từ in', label.label_reason || label.last_label_error || '', 'warn')
    }
    const text = label.label_status === 'error' ? 'Lỗi tải tem' : 'Chờ thử lại tải tem'
    return orderSyncResult('missing_label', text, label.label_reason || label.last_label_error || '', label.label_status === 'error' ? 'bad' : 'warn')
  }

  if (sourcePriority === 'seller_center_fallback' && !detailUrl) {
    return orderSyncResult('seller_center_detail_missing', 'Cần đồng bộ Seller Center', 'Thiếu link chi tiết Seller Center đã xác minh.', 'warn')
  }

  if (moduleSync.finance_sync_status === 'fallback_only') {
    return orderSyncResult('missing_finance', 'Đủ vận hành, thiếu tài chính', moduleSync.finance_missing_reason, 'warn')
  }

  if (sourcePriority === 'tiktok_seller_center_or_manual') {
    if (settlementStatus === 'pending_settlement' || actualIncomeAvailable === false || moduleSync.finance_sync_status === 'pending_settlement') {
      return orderSyncResult('pending_settlement', 'Chờ ví TikTok', 'Đơn TikTok chưa có settlement xác nhận.', 'warn')
    }
    if (!detailUrl && !cleanOrderReadText(row.source_updated_at)) {
      return orderSyncResult('seller_center_detail_missing', 'Cần đồng bộ Seller Center', 'Thiếu dữ liệu detail TikTok.', 'warn')
    }
  }

  if (sourcePriority === 'official_api_first') {
    if (core.order_status_core === 'UNKNOWN') {
      return orderSyncResult('needs_sync', 'Thiếu trạng thái', 'Order Status Core chưa nhận diện được trạng thái API.', 'warn')
    }
    if (!core.terminal_status && !hasRealTrackingNumber(row)) {
      return orderSyncResult('missing_tracking', 'Thiếu tracking', 'Chưa có mã vận đơn hoặc timeline vận chuyển.', 'warn')
    }
    if (labelNeedsProcessing(label)) {
      return orderSyncResult('missing_label', label.label_status === 'eligible' ? 'Thiếu tem' : 'Cần thao tác tem', label.label_reason || '', 'warn')
    }
    if (platform === 'lazada' && (!hasFinanceSource || settlementStatus === 'estimated_no_payment_sync' || actualIncomeAvailable === false)) {
      return orderSyncResult(
        'missing_finance',
        'Thiếu dữ liệu tài chính',
        'Doanh thu lấy từ Order API; phí/settlement cần Finance API Lazada hoặc quyền tương ứng.',
        'warn'
      )
    }
    if (!hasFinanceSource || settlementStatus === 'estimated_no_payment_sync' || actualIncomeAvailable === false) {
      return orderSyncResult('missing_finance', 'Thiếu dữ liệu tài chính', 'Đơn đủ dữ liệu đóng gói nhưng thiếu settlement/finance xác nhận.', 'warn')
    }
    return orderSyncResult('synced', 'Đã đồng bộ', 'Đủ trạng thái, nguồn API, tracking và tem hợp lệ.', 'ok')
  }

  if (moduleSync.finance_sync_status === 'missing') {
    return orderSyncResult('missing_finance', 'Cần cập nhật tài chính', moduleSync.finance_missing_reason, 'warn')
  }

  if (sourcePriority === 'warehouse_snapshot') {
    return orderSyncResult('manual_required', 'Cần thao tác thủ công', 'Shop chưa có đường tự động đã xác minh.', 'warn')
  }

  return orderSyncResult('synced', 'Đủ dữ liệu', 'Đơn có dữ liệu vận hành cần thiết trong Warehouse/Core.', 'ok')
}

export function normalizeOrderReadModel(row = {}, options = {}) {
  const fee = options.fee || {}
  const platformOrderId = cleanOrderReadText(row.platform_order_id || row.order_id)
  const statusRaw = getOrderStatusValue(row, row.shipping_status || row.oms_status || row.order_type)
  const source = orderCoreSourceMeta(row, fee)
  const statusCore = normalizeOrderStatusCore(row, statusRaw)
  const normalizedType = statusCore.order_type || orderTypeFromStatus(row, row.order_type || 'normal')
  const statusParent = statusCore.status_parent || orderStatusParent(statusRaw)
  const labelState = buildOrderLabelState(row, statusCore)
  const moduleSync = buildOrderModuleSyncState(row, source, labelState, statusCore)
  const syncCompleteness = buildOrderSyncCompleteness(row, source, labelState, statusCore)
  const processingState = buildOmsProcessingState(row, labelState, statusCore)
  const trackingNumber = trackingNumberFromCore(row)
  const trackingEventsCount = parseTrackingEventsCount(row)
  const paymentMethod = cleanOrderReadText(row.payment_method || row.payment_channel)
  const paymentTime = cleanOrderReadText(row.payment_time || row.pay_time || row.paid_at)
  const financeFields = row.fee_breakdown?.taxonomy?.fields || row.fields || {}
  const productOriginalValue = row.product_original_amount ?? row.original_product_amount ?? null
  const productOriginalMeta = financeFields.product_original_amount || {}
  const statusAutomation = buildOrderStatusAutomationMeta(row)
  const statusAutomationForDisplay = source.source_mismatch && lowerOrderReadText(statusAutomation.last_status_sync_error).includes('seller_center')
    ? {
        ...statusAutomation,
        last_status_sync_status: 'skipped',
        last_status_sync_error: '',
        status_source: source.status_source || statusAutomation.status_source
      }
    : statusAutomation
  return {
    platform_order_id: platformOrderId,
    order_id: cleanOrderReadText(row.order_id || platformOrderId),
    shop_id: cleanOrderReadText(row.api_shop_id || row.shop_id || row.shop),
    shop: cleanOrderReadText(row.shop),
    platform: lowerOrderReadText(row.platform),
    buyer_name: cleanOrderReadText(row.customer_name || row.buyer_username || row.buyer_id),
    buyer_user_id: cleanOrderReadText(row.buyer_id || row.buyer_username || row.customer_name),
    customer_name: cleanOrderReadText(row.customer_name),
    customer_phone: cleanOrderReadText(row.customer_phone),
    order_type: normalizedType,
    raw_platform_status: statusCore.raw_platform_status,
    status_raw: statusRaw,
    display_status_vi: statusCore.display_status_vi,
    status_label_vi: statusCore.display_status_vi || orderStatusLabel(statusRaw),
    status_kind: statusCore.status_kind || orderStatusKind({ ...row, order_type: normalizedType }),
    status_parent: statusParent,
    order_status_core: statusCore.order_status_core,
    fulfillment_status_core: statusCore.fulfillment_status_core,
    terminal_status: statusCore.terminal_status,
    status_reason: statusCore.status_reason,
    order_status_detail: {
      raw_platform_status: statusCore.raw_platform_status,
      display_status_vi: statusCore.display_status_vi,
      kind: statusCore.status_kind,
      parent: statusParent,
      order_status_core: statusCore.order_status_core,
      fulfillment_status_core: statusCore.fulfillment_status_core,
      terminal_status: statusCore.terminal_status,
      order_type: normalizedType,
      reason: statusCore.status_reason,
      automation: statusAutomationForDisplay
    },
    order_sync_completeness: syncCompleteness,
    order_module_sync: moduleSync,
    ...processingState,
    sync_completeness_status: syncCompleteness.status,
    sync_completeness_label: syncCompleteness.label,
    sync_completeness_reason: syncCompleteness.reason,
    sync_completeness_tone: syncCompleteness.tone,
    ...moduleSync,
    ...statusAutomationForDisplay,
    status_source: source.status_source || statusAutomationForDisplay.status_source,
    ...labelState,
    payment_status: cleanOrderReadText(row.payment_status || paymentMethod),
    payment_method: paymentMethod,
    payment_method_display: paymentMethod || 'Chưa có dữ liệu',
    payment_method_source: cleanOrderReadText(row.payment_method_source || (paymentMethod ? 'Order Core' : 'missing')),
    payment_time: paymentTime,
    payment_time_display: paymentTime || 'Chưa có dữ liệu',
    payment_time_source: cleanOrderReadText(row.payment_time_source || (paymentTime ? 'Order Core' : 'missing')),
    original_product_amount_display: productOriginalValue === null || productOriginalValue === undefined || productOriginalValue === ''
      ? 'Chưa có dữ liệu'
      : productOriginalValue,
    product_original_amount_source: cleanOrderReadText(productOriginalMeta.source || (productOriginalValue !== null && productOriginalValue !== undefined && productOriginalValue !== '' ? 'Finance Core' : 'missing')),
    product_original_amount_confidence: cleanOrderReadText(productOriginalMeta.confidence || (productOriginalValue !== null && productOriginalValue !== undefined && productOriginalValue !== '' ? 'observed' : 'missing')),
    shipping_status: cleanOrderReadText(row.shipping_status || row.oms_status),
    tracking_number: trackingNumber,
    order_tracking_number: cleanOrderReadText(row.tracking_number),
    tracking_core_tracking_number: cleanOrderReadText(row.tracking_core_tracking_number),
    tracking_core_logistics_provider: cleanOrderReadText(row.tracking_core_logistics_provider),
    tracking_events_count: trackingEventsCount,
    tracking_source: cleanOrderReadText(row.tracking_core_source || row.tracking_source),
    tracking_status_core: cleanOrderReadText(row.tracking_status_core),
    tracking_last_sync_at: cleanOrderReadText(row.tracking_last_sync_at),
    tracking_last_error: cleanOrderReadText(row.tracking_last_error),
    source: source.source,
    confidence: source.confidence,
    badge: source.badge,
    source_priority: source.source_priority,
    source_label: source.source_label,
    seller_center_allowed: source.seller_center_allowed,
    docs_checked: source.docs_checked,
    api_missing_reason: source.api_missing_reason,
    source_mismatch: source.source_mismatch,
    updated_at: source.updated_at,
    raw_source: {
      source_mode: source.raw_source,
      order_table: options.orderTable || 'orders_v2',
      item_table: options.itemTable || '',
      fee_table: options.feeTable || ''
    }
  }
}

export function normalizeOrderListRowForCore(row = {}, options = {}) {
  const core = normalizeOrderReadModel(row, options)
  return {
    ...row,
    ...core
  }
}
