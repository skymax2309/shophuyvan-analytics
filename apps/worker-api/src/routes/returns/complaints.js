export function createReturnComplaintHandlers(ctx) {
  const {
    ensureReturnReceiveSchema,
    cleanText,
    compactJson,
    isConfirmedMarketplaceAction,
    returnLike,
    returnOrderPayload,
    findReturnOrderByScan,
    uploadShopeeReturnProof,
    queryShopeeReturnProof,
    fetchShopeeReturnDetail
  } = ctx;

  async function ensureReturnComplaintSchema(env) {
    await ensureReturnReceiveSchema(env)
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS return_complaint_cases (
        case_key TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        platform TEXT DEFAULT '',
        shop TEXT DEFAULT '',
        return_sn TEXT DEFAULT '',
        reverse_id TEXT DEFAULT '',
        complaint_status TEXT DEFAULT 'draft',
        marketplace_status TEXT DEFAULT '',
        evidence_video_url TEXT DEFAULT '',
        label_storage_key TEXT DEFAULT '',
        sent_to_marketplace INTEGER DEFAULT 0,
        request_id TEXT DEFAULT '',
        marketplace_response_json TEXT DEFAULT '{}',
        error TEXT DEFAULT '',
        note TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now', '+7 hours')),
        updated_at TEXT DEFAULT (datetime('now', '+7 hours')),
        last_checked_at TEXT DEFAULT ''
      )
    `).run()
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_return_complaint_cases_order ON return_complaint_cases(order_id)`).run()
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_return_complaint_cases_status ON return_complaint_cases(complaint_status, updated_at)`).run()
  }

  async function loadReturnComplaintEvidence(env, options = {}) {
    await ensureReturnReceiveSchema(env)
    const row = await findReturnOrderByScan(env, options.code || options.order_id || options.tracking_number)
    if (!row) return { status: 'error', error: 'Không tìm thấy đơn hoàn/trả theo mã vừa quét.', not_found: true }
    if (!returnLike(row)) {
      return {
        status: 'blocked',
        error: 'Đơn này chưa nằm trong luồng hoàn/trả nên chưa tạo bộ bằng chứng khiếu nại.',
        order: returnOrderPayload(row)
      }
    }
    const [videosResult, labelRow, scansResult] = await Promise.all([
      env.DB.prepare(`
        SELECT order_id, video_url, created_at
        FROM packing_videos
        WHERE order_id = ?
        ORDER BY datetime(created_at) DESC, id DESC
        LIMIT 5
      `).bind(row.order_id).all(),
      env.DB.prepare(`SELECT order_id, storage_key, content_type, source, size_bytes, refreshed_at, last_checked_at, error FROM order_labels WHERE order_id = ? LIMIT 1`).bind(row.order_id).first(),
      env.DB.prepare(`
        SELECT scan_code, operator, note, result_status, created_at
        FROM return_receive_scans
        WHERE order_id = ?
        ORDER BY datetime(created_at) DESC, id DESC
        LIMIT 5
      `).bind(row.order_id).all()
    ])
    const videos = (videosResult.results || []).map(video => ({
      order_id: cleanText(video.order_id),
      video_url: cleanText(video.video_url),
      download_url: `/api/file/${encodeURIComponent(cleanText(video.video_url))}`,
      created_at: cleanText(video.created_at)
    }))
    const label = labelRow ? {
      order_id: cleanText(labelRow.order_id),
      storage_key: cleanText(labelRow.storage_key),
      content_type: cleanText(labelRow.content_type),
      source: cleanText(labelRow.source),
      size_bytes: Number(labelRow.size_bytes || 0),
      refreshed_at: cleanText(labelRow.refreshed_at),
      last_checked_at: cleanText(labelRow.last_checked_at),
      error: cleanText(labelRow.error)
    } : null
    const missing = []
    if (!videos.length) missing.push('Chưa có video đóng gói để tải lên khiếu nại.')
    if (!label?.storage_key || label?.error) missing.push('Chưa có tem hợp lệ được ghi nhận; cần bấm Kiểm tra tem để đọc file thật trong R2.')
    return {
      status: 'ok',
      order: returnOrderPayload(row),
      videos,
      latest_video: videos[0] || null,
      label,
      receive_scans: (scansResult.results || []).map(scan => ({
        scan_code: cleanText(scan.scan_code),
        operator: cleanText(scan.operator),
        note: cleanText(scan.note),
        result_status: cleanText(scan.result_status),
        created_at: cleanText(scan.created_at)
      })),
      evidence: {
        video_ready: videos.length > 0,
        label_recorded: !!label?.storage_key && !label?.error,
        complaint_ready: videos.length > 0,
        complete_evidence: videos.length > 0 && !!label?.storage_key && !label?.error,
        missing
      }
    }
  }
  
  function complaintCaseKey(row = {}, reference = {}) {
    const platform = cleanText(row.platform).toLowerCase() || 'unknown'
    const orderId = cleanText(row.order_id)
    const reverseId = cleanText(reference.return_sn || reference.reverse_id || 'manual')
    return `${platform}:${orderId}:${reverseId}`
  }
  
  function publicUrl(origin, path) {
    const value = cleanText(path)
    if (!value) return ''
    if (/^https?:\/\//i.test(value)) return value
    const base = cleanText(origin).replace(/\/+$/, '')
    const suffix = value.startsWith('/') ? value : `/${value}`
    return `${base}${suffix}`
  }
  
  async function findReturnReference(env, row = {}) {
    const platform = cleanText(row.platform).toLowerCase()
    const orderId = cleanText(row.order_id)
    if (!platform || !orderId) return null
    if (platform === 'shopee') {
      try {
        const ret = await env.DB.prepare(`
          SELECT return_sn, status, negotiation_status, seller_proof_status,
                 seller_compensation_status, return_solution, return_refund_request_type,
                 reason, text_reason, update_time_at
          FROM marketplace_returns
          WHERE order_sn = ?
            AND (? = '' OR LOWER(TRIM(COALESCE(shop, ''))) = LOWER(TRIM(?)))
          ORDER BY COALESCE(update_time, 0) DESC, update_time_at DESC
          LIMIT 1
        `).bind(orderId, cleanText(row.shop), cleanText(row.shop)).first()
        if (ret?.return_sn) {
          return {
            platform,
            return_sn: cleanText(ret.return_sn),
            marketplace_status: cleanText(ret.negotiation_status || ret.status || ret.seller_proof_status),
            raw: ret
          }
        }
      } catch {}
    }
  
    try {
      const ledger = await env.DB.prepare(`
        SELECT reverse_id, reverse_line_id, reverse_status, line_status, normalized_status,
               request_type, reason_code, reason_text, seller_dispute, updated_at_bangkok
        FROM marketplace_return_reverse_ledger
        WHERE LOWER(COALESCE(platform, '')) = ?
          AND order_id = ?
        ORDER BY seller_dispute DESC,
                 datetime(COALESCE(NULLIF(updated_at_bangkok, ''), NULLIF(created_at_bangkok, ''), synced_at, '1970-01-01')) DESC
        LIMIT 1
      `).bind(platform, orderId).first()
      if (ledger?.reverse_id) {
        return {
          platform,
          reverse_id: cleanText(ledger.reverse_id),
          reverse_line_id: cleanText(ledger.reverse_line_id),
          marketplace_status: cleanText(ledger.normalized_status || ledger.reverse_status || ledger.line_status),
          raw: ledger
        }
      }
    } catch {}
    return null
  }
  
  async function upsertComplaintCase(env, row = {}, reference = {}, patch = {}) {
    await ensureReturnComplaintSchema(env)
    const caseKey = complaintCaseKey(row, reference)
    const status = cleanText(patch.complaint_status || patch.status || 'draft')
    const marketplaceStatus = cleanText(patch.marketplace_status || reference.marketplace_status)
    const videoUrl = cleanText(patch.evidence_video_url)
    const labelKey = cleanText(patch.label_storage_key)
    const responseJson = compactJson(patch.marketplace_response || patch.response || {}, '{}')
    const result = await env.DB.prepare(`
      INSERT INTO return_complaint_cases (
        case_key, order_id, platform, shop, return_sn, reverse_id,
        complaint_status, marketplace_status, evidence_video_url, label_storage_key,
        sent_to_marketplace, request_id, marketplace_response_json, error, note,
        created_at, updated_at, last_checked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+7 hours'), datetime('now', '+7 hours'), ?)
      ON CONFLICT(case_key) DO UPDATE SET
        complaint_status = excluded.complaint_status,
        marketplace_status = COALESCE(NULLIF(excluded.marketplace_status, ''), return_complaint_cases.marketplace_status),
        evidence_video_url = COALESCE(NULLIF(excluded.evidence_video_url, ''), return_complaint_cases.evidence_video_url),
        label_storage_key = COALESCE(NULLIF(excluded.label_storage_key, ''), return_complaint_cases.label_storage_key),
        sent_to_marketplace = CASE WHEN excluded.sent_to_marketplace = 1 THEN 1 ELSE return_complaint_cases.sent_to_marketplace END,
        request_id = COALESCE(NULLIF(excluded.request_id, ''), return_complaint_cases.request_id),
        marketplace_response_json = excluded.marketplace_response_json,
        error = excluded.error,
        note = COALESCE(NULLIF(excluded.note, ''), return_complaint_cases.note),
        updated_at = datetime('now', '+7 hours'),
        last_checked_at = COALESCE(NULLIF(excluded.last_checked_at, ''), return_complaint_cases.last_checked_at)
    `).bind(
      caseKey,
      cleanText(row.order_id),
      cleanText(row.platform).toLowerCase(),
      cleanText(row.shop),
      cleanText(reference.return_sn),
      cleanText(reference.reverse_id),
      status,
      marketplaceStatus,
      videoUrl,
      labelKey,
      patch.sent_to_marketplace ? 1 : 0,
      cleanText(patch.request_id),
      responseJson,
      cleanText(patch.error),
      cleanText(patch.note),
      cleanText(patch.last_checked_at)
    ).run()
    await env.DB.prepare(`
      UPDATE orders_v2
      SET return_complaint_status = ?,
          return_complaint_note = ?,
          return_complaint_updated_at = datetime('now', '+7 hours')
      WHERE order_id = ?
    `).bind(status, cleanText(patch.note || marketplaceStatus), cleanText(row.order_id)).run().catch(() => null)
    return { case_key: caseKey, changed: result.meta?.changes || 0 }
  }
  
  function complaintStatusLabel(status) {
    const key = cleanText(status).toLowerCase()
    if (key === 'needs_evidence') return 'Thiếu video'
    if (key === 'ready_to_send') return 'Sẵn sàng gửi'
    if (key === 'marketplace_processing') return 'Sàn đang xử lý'
    if (key === 'manual_required') return 'Cần thao tác tay'
    if (key === 'marketplace_replied') return 'Sàn đã phản hồi'
    if (key === 'error') return 'Lỗi khiếu nại'
    return 'Đang khiếu nại'
  }
  
  async function listReturnComplaintCases(env, options = {}) {
    await ensureReturnComplaintSchema(env)
    const status = cleanText(options.status)
    const search = cleanText(options.code || options.search)
    const limit = Math.max(1, Math.min(Number(options.limit || 80) || 80, 200))
    const conds = ['1=1']
    const params = []
    if (status && status !== 'all') {
      conds.push('LOWER(c.complaint_status) = LOWER(?)')
      params.push(status)
    }
    if (search) {
      conds.push('(c.order_id LIKE ? OR c.return_sn LIKE ? OR c.reverse_id LIKE ? OR o.tracking_number LIKE ?)')
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`)
    }
    const where = conds.join(' AND ')
    const [summary, rows] = await Promise.all([
      env.DB.prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN complaint_status = 'needs_evidence' THEN 1 ELSE 0 END) AS needs_evidence,
          SUM(CASE WHEN complaint_status = 'ready_to_send' THEN 1 ELSE 0 END) AS ready_to_send,
          SUM(CASE WHEN complaint_status = 'marketplace_processing' THEN 1 ELSE 0 END) AS processing,
          SUM(CASE WHEN complaint_status = 'manual_required' THEN 1 ELSE 0 END) AS manual_required,
          SUM(CASE WHEN complaint_status = 'error' THEN 1 ELSE 0 END) AS error_count
        FROM return_complaint_cases
      `).first(),
      env.DB.prepare(`
        SELECT c.*, o.shipping_status, o.oms_status, o.tracking_number, o.shipping_carrier
        FROM return_complaint_cases c
        LEFT JOIN orders_v2 o ON o.order_id = c.order_id
        WHERE ${where}
        ORDER BY datetime(c.updated_at) DESC, c.order_id DESC
        LIMIT ?
      `).bind(...params, limit).all()
    ])
    return {
      status: 'ok',
      summary: {
        total: Number(summary?.total || 0),
        needs_evidence: Number(summary?.needs_evidence || 0),
        ready_to_send: Number(summary?.ready_to_send || 0),
        processing: Number(summary?.processing || 0),
        manual_required: Number(summary?.manual_required || 0),
        error_count: Number(summary?.error_count || 0)
      },
      rows: (rows.results || []).map(row => ({
        case_key: cleanText(row.case_key),
        order_id: cleanText(row.order_id),
        platform: cleanText(row.platform),
        shop: cleanText(row.shop),
        return_sn: cleanText(row.return_sn),
        reverse_id: cleanText(row.reverse_id),
        complaint_status: cleanText(row.complaint_status),
        complaint_status_label: complaintStatusLabel(row.complaint_status),
        marketplace_status: cleanText(row.marketplace_status),
        evidence_video_url: cleanText(row.evidence_video_url),
        label_storage_key: cleanText(row.label_storage_key),
        sent_to_marketplace: Number(row.sent_to_marketplace || 0) === 1,
        request_id: cleanText(row.request_id),
        error: cleanText(row.error),
        note: cleanText(row.note),
        updated_at: cleanText(row.updated_at),
        last_checked_at: cleanText(row.last_checked_at),
        shipping_status: cleanText(row.shipping_status),
        tracking_number: cleanText(row.tracking_number)
      }))
    }
  }
  
  async function startReturnComplaint(env, options = {}, origin = '') {
    await ensureReturnComplaintSchema(env)
    const row = await findReturnOrderByScan(env, options.code || options.order_id || options.order_sn || options.tracking_number)
    if (!row) return { status: 'error', error: 'Không tìm thấy đơn hoàn/trả theo mã vừa quét.', not_found: true }
    if (!returnLike(row)) {
      return { status: 'blocked', error: 'Đơn này chưa nằm trong luồng hoàn/trả nên không tạo khiếu nại.', order: returnOrderPayload(row) }
    }
    const evidenceResult = await loadReturnComplaintEvidence(env, { code: row.order_id })
    const reference = await findReturnReference(env, row) || {}
    const latestVideo = evidenceResult.latest_video || null
    const videoUrl = latestVideo?.download_url ? publicUrl(origin, latestVideo.download_url) : ''
    const labelKey = cleanText(evidenceResult.label?.storage_key)
    const platform = cleanText(row.platform).toLowerCase()
    const note = cleanText(options.note) || 'Khiếu nại hoàn/trả: shop gửi video đóng gói làm bằng chứng đối chiếu.'
    if (!latestVideo) {
      const saved = await upsertComplaintCase(env, row, reference, {
        complaint_status: 'needs_evidence',
        evidence_video_url: '',
        label_storage_key: labelKey,
        note: 'Thiếu video đóng gói, chưa thể gửi khiếu nại tự động.'
      })
      return { status: 'blocked', ...saved, order: returnOrderPayload(row), evidence: evidenceResult, error: 'Thiếu video đóng gói để tải lên khiếu nại.', complaint_status: 'needs_evidence', sent_to_marketplace: false }
    }
  
    if (platform !== 'shopee') {
      const saved = await upsertComplaintCase(env, row, reference, {
        complaint_status: 'manual_required',
        marketplace_status: reference.marketplace_status,
        evidence_video_url: videoUrl,
        label_storage_key: labelKey,
        note: 'Sàn này chưa nối endpoint upload chứng cứ khiếu nại tự động; dùng link video để thao tác tay.'
      })
      return { status: 'blocked', ...saved, order: returnOrderPayload(row), evidence: evidenceResult, reference, complaint_status: 'manual_required', sent_to_marketplace: false, message: 'Đã tạo hồ sơ khiếu nại nội bộ và link video. Lazada/shop không API cần thao tác tay cho tới khi nối endpoint upload chứng cứ chính thức.' }
    }
  
    if (!reference.return_sn) {
      const saved = await upsertComplaintCase(env, row, reference, {
        complaint_status: 'manual_required',
        evidence_video_url: videoUrl,
        label_storage_key: labelKey,
        note: 'Thiếu return_sn Shopee; cần đồng bộ Returns trước khi gửi chứng cứ.'
      })
      return { status: 'blocked', ...saved, order: returnOrderPayload(row), evidence: evidenceResult, complaint_status: 'manual_required', sent_to_marketplace: false, message: 'Đã có video nhưng chưa có return_sn Shopee. Hãy đồng bộ Returns rồi bấm lại Khiếu nại.' }
    }
  
    if (!isConfirmedMarketplaceAction(options)) {
      const saved = await upsertComplaintCase(env, row, reference, {
        complaint_status: 'ready_to_send',
        marketplace_status: reference.marketplace_status,
        evidence_video_url: videoUrl,
        label_storage_key: labelKey,
        note
      })
      return { status: 'ok', ...saved, order: returnOrderPayload(row), evidence: evidenceResult, reference, complaint_status: 'ready_to_send', dry_run: true, sent_to_marketplace: false, message: 'Đã gom đủ video. Gửi confirm_action=true để upload chứng cứ lên Shopee.' }
    }
  
    const uploadResult = await uploadShopeeReturnProof(env, {
      ...options,
      shop: row.shop,
      return_sn: reference.return_sn,
      photo: [{ url: videoUrl, thumbnail: videoUrl }],
      description: note,
      confirm_action: true
    })
    const uploadOk = uploadResult.status === 'ok' && !uploadResult.error
    const saved = await upsertComplaintCase(env, row, reference, {
      complaint_status: uploadOk ? 'marketplace_processing' : 'error',
      marketplace_status: uploadOk ? 'proof_uploaded_waiting_marketplace' : reference.marketplace_status,
      evidence_video_url: videoUrl,
      label_storage_key: labelKey,
      sent_to_marketplace: uploadOk,
      request_id: uploadResult.request_id,
      marketplace_response: uploadResult,
      error: uploadOk ? '' : (uploadResult.message || uploadResult.error || 'upload_proof_failed'),
      note: uploadOk ? 'Đã upload video đóng gói lên chứng cứ khiếu nại Shopee, chờ sàn xử lý/phản hồi.' : 'Upload chứng cứ Shopee lỗi, cần kiểm tra quyền Returns hoặc thời hạn proof.'
    })
    return {
      status: uploadOk ? 'ok' : 'error',
      ...saved,
      order: returnOrderPayload(row),
      evidence: evidenceResult,
      reference,
      complaint_status: uploadOk ? 'marketplace_processing' : 'error',
      sent_to_marketplace: uploadOk,
      upload_result: uploadResult,
      message: uploadOk ? 'Đã upload video đóng gói lên Shopee, trạng thái chuyển sang Sàn đang xử lý.' : 'Không upload được video lên Shopee.'
    }
  }
  
  async function refreshReturnComplaint(env, options = {}) {
    await ensureReturnComplaintSchema(env)
    const row = await findReturnOrderByScan(env, options.code || options.order_id || options.order_sn || options.tracking_number)
    if (!row) return { status: 'error', error: 'Không tìm thấy đơn để cập nhật khiếu nại.', not_found: true }
    const reference = await findReturnReference(env, row) || {}
    const platform = cleanText(row.platform).toLowerCase()
    if (platform === 'shopee' && reference.return_sn) {
      const proof = await queryShopeeReturnProof(env, { shop: row.shop, return_sn: reference.return_sn })
      const detail = await fetchShopeeReturnDetail(env, { shop: row.shop, return_sn: reference.return_sn })
      const proofHasVideo = Array.isArray(proof?.proof?.video || proof?.response?.video) && (proof.proof?.video || proof.response?.video).length > 0
      const marketplaceStatus = cleanText(detail?.detail?.negotiation_status || detail?.detail?.seller_proof_status || detail?.detail?.status || reference.marketplace_status)
      const saved = await upsertComplaintCase(env, row, reference, {
        complaint_status: marketplaceStatus.toLowerCase().includes('close') ? 'marketplace_replied' : 'marketplace_processing',
        marketplace_status: marketplaceStatus || 'proof_checked',
        marketplace_response: { proof, detail },
        request_id: proof?.request_id || detail?.request_id,
        last_checked_at: new Date().toISOString(),
        note: proofHasVideo ? 'Shopee đã trả dữ liệu proof có video.' : 'Đã kiểm tra phản hồi khiếu nại từ Shopee.'
      })
      return { status: 'ok', ...saved, order: returnOrderPayload(row), reference, proof, detail, message: 'Đã cập nhật trạng thái khiếu nại từ Shopee.' }
    }
    const saved = await upsertComplaintCase(env, row, reference, {
      complaint_status: 'manual_required',
      marketplace_status: reference.marketplace_status,
      marketplace_response: reference.raw || {},
      last_checked_at: new Date().toISOString(),
      note: 'Chưa có endpoint tự động kiểm phản hồi cho sàn/shop này; cần đối chiếu tay.'
    })
    return { status: 'blocked', ...saved, order: returnOrderPayload(row), reference, message: 'Đã cập nhật hồ sơ nội bộ; sàn này cần kiểm phản hồi tay.' }
  }

  return {
    loadReturnComplaintEvidence,
    listReturnComplaintCases,
    startReturnComplaint,
    refreshReturnComplaint
  };
}
