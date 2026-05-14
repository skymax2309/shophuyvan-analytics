import { cleanProductText } from './marketplace-preview.js'
import { buildPublishItems, buildPublishListings, clampPublishText, ensurePublishDraftTable, fetchDraftConfigMap, fetchProductMap, fetchPublishKnowledgeMap, fetchPublishRows, getGeminiPublishKeys, normalizePublishListingDetails, normalizePublishShopDetails, normalizePublishShopNames, parseJsonValue } from './publish-helpers.js'

export function makeContentVariantKey(listing, target) {
  return [
    cleanProductText(listing?.source_platform).toLowerCase(),
    cleanProductText(listing?.source_shop),
    cleanProductText(listing?.source_item_id || listing?.title),
    cleanProductText(target?.platform || target?.target_platform).toLowerCase(),
    cleanProductText(target?.shop || target?.target_shop)
  ].join('|')
}

export function compactPublishDescription(value, maxLength = 2800) {
  const text = String(value || '')
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n')
  return clampPublishText(text, maxLength)
}

export function getPublishVariantSkuList(listing) {
  const skus = new Set()
  for (const variant of listing?.variations || []) {
    for (const value of [variant.platform_sku, variant.internal_sku]) {
      const sku = cleanProductText(value)
      if (sku) skus.add(sku)
    }
  }
  return [...skus]
}

export function buildFallbackContentVariants(listings, targetShopDetails) {
  const suffixes = [
    'day du phan loai',
    'san co tai kho',
    'chon loc de dang',
    'mo ta ro thong so',
    'dong goi can than',
    'phu hop nhu cau gia dinh',
    'kiem tra truoc khi giao',
    'toi uu theo tung lua chon'
  ]
  const intros = [
    'San pham duoc cap nhat thong tin ro rang de nguoi mua de chon dung phan loai.',
    'Noi dung bai dang duoc viet lai gon gang, tap trung vao thong so va loi ich thuc te.',
    'Bai dang nay giu dung thong tin san pham, gia va phan loai dang duoc dong bo tu kho.',
    'Noi dung duoc sap xep ro rang de nguoi mua nam nhanh diem chinh cua san pham.'
  ]
  const variants = []
  for (const listing of listings || []) {
    const baseTitle = cleanProductText(listing?.title || 'San pham')
    const baseDescription = compactPublishDescription(listing?.description || '')
    for (const target of targetShopDetails || []) {
      const key = makeContentVariantKey(listing, target)
      const seed = Math.abs([...key].reduce((sum, ch) => sum + ch.charCodeAt(0), 0))
      const suffix = suffixes[seed % suffixes.length]
      const intro = intros[seed % intros.length]
      const title = clampPublishText(`${baseTitle} - ${suffix}`, 118)
      const description = [
        intro,
        '',
        baseDescription || baseTitle,
        '',
        'Vui long chon dung phan loai, kich thuoc hoac mau sac truoc khi dat hang.'
      ].join('\n').trim()
      variants.push({
        key,
        source_platform: cleanProductText(listing?.source_platform).toLowerCase(),
        source_shop: cleanProductText(listing?.source_shop),
        source_item_id: cleanProductText(listing?.source_item_id || ''),
        target_platform: cleanProductText(target.platform || target.target_platform).toLowerCase(),
        target_shop: cleanProductText(target.shop || target.target_shop),
        title,
        description,
        sku_policy: 'keep_sku_unchanged',
        skus: getPublishVariantSkuList(listing)
      })
    }
  }
  return variants
}

export function stripJsonFence(text) {
  return String(text || '').replace(/```json/gi, '').replace(/```/g, '').trim()
}

export function normalizeContentVariantList(value, fallback = []) {
  const raw = parseJsonValue(value, value)
  const list = Array.isArray(raw?.variants) ? raw.variants : (Array.isArray(raw) ? raw : [])
  const fallbackByKey = new Map(fallback.map(item => [item.key, item]))
  const needsFallbackKey = fallbackByKey.size > 0
  const normalized = []
  const seen = new Set()
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const key = cleanProductText(item.key)
    const base = fallbackByKey.get(key) || item
    if (!key || (needsFallbackKey && !fallbackByKey.has(key)) || seen.has(key)) continue
    const title = clampPublishText(item.title || base.title, 118)
    const description = compactPublishDescription(item.description || base.description, 5000)
    normalized.push({
      ...base,
      key,
      source_platform: cleanProductText(base.source_platform).toLowerCase(),
      source_shop: cleanProductText(base.source_shop),
      source_item_id: cleanProductText(base.source_item_id),
      target_platform: cleanProductText(base.target_platform).toLowerCase(),
      target_shop: cleanProductText(base.target_shop),
      title,
      description,
      sku_policy: 'keep_sku_unchanged'
    })
    seen.add(key)
  }
  for (const item of fallback) {
    if (!seen.has(item.key)) normalized.push(item)
  }
  return normalized
}

export async function requestGeminiContentVariants(env, listings, targetShopDetails, fallbackVariants) {
  const keys = getGeminiPublishKeys(env)
  if (!keys.length) return { provider: 'local-fallback', variants: fallbackVariants, fallback_reason: 'missing_gemini_key' }

  const compactListings = (listings || []).slice(0, 12).map(listing => ({
    key_source: `${cleanProductText(listing.source_platform)}|${cleanProductText(listing.source_shop)}|${cleanProductText(listing.source_item_id || listing.title)}`,
    source_platform: listing.source_platform,
    source_shop: listing.source_shop,
    source_item_id: listing.source_item_id,
    title: listing.title,
    description: compactPublishDescription(listing.description, 2200),
    category: listing.category,
    brand: listing.brand,
    variation_names: (listing.variations || []).map(v => v.name).filter(Boolean).slice(0, 40),
    skus: getPublishVariantSkuList(listing).slice(0, 60)
  }))
  const compactTargets = (targetShopDetails || []).slice(0, 20).map(target => ({
    platform: cleanProductText(target.platform).toLowerCase(),
    shop: cleanProductText(target.shop)
  }))
  const prompt = [
    'You write Vietnamese ecommerce marketplace product copy.',
    'Create one content variant for every source listing and target shop pair.',
    'Rules:',
    '- Return only valid JSON with shape {"variants":[{"key":"","title":"","description":""}]}',
    '- key must exactly match one of allowed_keys.',
    '- Keep all SKU values unchanged. Do not rewrite, translate, remove, or invent SKU.',
    '- Do not invent specifications, materials, sizes, warranty, origin, promotion, phone number, or banned claims.',
    '- Titles and descriptions for different target shops must not be identical.',
    '- Keep titles concise, natural, and under 118 characters.',
    '- Description should be useful, truthful, and different in structure/order per shop.',
    JSON.stringify({
      allowed_keys: fallbackVariants.map(item => item.key),
      listings: compactListings,
      target_shops: compactTargets
    })
  ].join('\n')

  let lastError = ''
  for (const key of keys) {
    try {
      const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.65
          }
        })
      })
      const aiData = await aiRes.json()
      if (aiData.error) {
        lastError = aiData.error.message || 'gemini_error'
        continue
      }
      const text = aiData.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
      const parsed = JSON.parse(stripJsonFence(text))
      return {
        provider: 'gemini',
        variants: normalizeContentVariantList(parsed, fallbackVariants)
      }
    } catch (error) {
      lastError = error.message
      continue
    }
  }

  return {
    provider: 'local-fallback',
    variants: fallbackVariants,
    fallback_reason: lastError || 'gemini_unavailable'
  }
}

export async function createPublishContentVariants(request, env, cors) {
  const body = await request.json()
  const listings = Array.isArray(body.listings) ? body.listings : []
  const targetShopDetails = normalizePublishShopDetails(body.target_shop_details || body.target_shops)
  if (!listings.length) return Response.json({ error: 'Missing source listings' }, { status: 400, headers: cors })
  if (!targetShopDetails.length) return Response.json({ error: 'Missing target shops' }, { status: 400, headers: cors })

  const fallbackVariants = buildFallbackContentVariants(listings, targetShopDetails)
  const result = await requestGeminiContentVariants(env, listings, targetShopDetails, fallbackVariants)
  return Response.json({
    status: 'ok',
    provider: result.provider,
    fallback_reason: result.fallback_reason || '',
    variants: result.variants
  }, { headers: cors })
}

export async function buildPublishDraftPayload(env, ids, targetPlatforms, options = {}) {
  const uniqueIds = [...new Set(ids)]
  const rows = await fetchPublishRows(env, uniqueIds)
  if (!rows.length) return { error: 'No variations found', status: 404 }

  const [draftMap, productMap, knowledgeMap] = await Promise.all([
    fetchDraftConfigMap(env, rows),
    fetchProductMap(env, rows),
    fetchPublishKnowledgeMap(env, rows)
  ])
  const listings = buildPublishListings(rows, draftMap, productMap, knowledgeMap, options.listing_overrides || {})
  const items = buildPublishItems(rows)
  const warningCount = listings.reduce((sum, item) => sum + (item.validation?.warnings?.length || 0), 0)
  const targetShopDetails = normalizePublishShopDetails(options.target_shop_details || options.target_shops)
  const sourceShopDetails = normalizePublishShopDetails(options.source_shop_details)
  const sourceListingDetails = normalizePublishListingDetails(options.source_listing_details)
  const contentVariants = normalizeContentVariantList(options.content_variants || options.ai_variants || [], [])
  const targetShopNames = targetShopDetails.length
    ? [...new Set(targetShopDetails.map(item => item.shop).filter(Boolean))]
    : normalizePublishShopNames(options.target_shops)

  const payload = {
    source: 'oms_multi_platform_publish',
    source_mode: 'selected_sku_to_listing_draft',
    created_at: new Date().toISOString(),
    target_platforms: targetPlatforms,
    target_shops: targetShopNames,
    target_shop_details: targetShopDetails,
    source_shop_details: sourceShopDetails,
    source_listing_details: sourceListingDetails,
    publish_action: 'draft_only',
    editor: options.listing_overrides || {},
    content_variants: contentVariants,
    content_variant_policy: contentVariants.length ? 'per_target_shop_keep_sku' : 'manual_editor_content',
    bulk_edit: options.bulk_edit || {
      title_prefix: '',
      title_suffix: '',
      price_adjustment: { type: 'none', value: 0 },
      stock_policy: 'use_current_stock'
    },
    listings,
    items,
    validation: {
      listing_count: listings.length,
      sku_count: rows.length,
      warning_count: warningCount,
      ready_to_publish: warningCount === 0
    }
  }
  return { rows, payload, listings, items }
}

export async function previewPublishDraft(request, env, cors) {
  const body = await request.json()
  const ids = Array.isArray(body.ids)
    ? body.ids.map(Number).filter(Number.isFinite)
    : []
  const targetPlatforms = Array.isArray(body.target_platforms)
    ? body.target_platforms.map(cleanProductText).filter(Boolean)
    : []

  if (!ids.length) return Response.json({ error: 'Missing variation ids' }, { status: 400, headers: cors })

  const built = await buildPublishDraftPayload(env, ids, targetPlatforms, body)
  if (built.error) return Response.json({ error: built.error }, { status: built.status || 500, headers: cors })

  return Response.json({
    status: 'ok',
    listings: built.listings,
    items: built.items.length,
    target_platforms: targetPlatforms,
    validation: built.payload.validation
  }, { headers: cors })
}

export async function createPublishDraft(request, env, cors) {
  const body = await request.json()
  const ids = Array.isArray(body.ids)
    ? body.ids.map(Number).filter(Number.isFinite)
    : []
  const targetPlatforms = Array.isArray(body.target_platforms)
    ? body.target_platforms.map(cleanProductText).filter(Boolean)
    : []

  if (!ids.length) return Response.json({ error: 'Missing variation ids' }, { status: 400, headers: cors })
  if (!targetPlatforms.length) return Response.json({ error: 'Missing target platforms' }, { status: 400, headers: cors })

  await ensurePublishDraftTable(env)
  const built = await buildPublishDraftPayload(env, ids, targetPlatforms, body)
  if (built.error) return Response.json({ error: built.error }, { status: built.status || 500, headers: cors })

  const title = body.title || `${built.listings[0]?.title || 'Product draft'} (${built.items.length} SKU)`
  const result = await env.DB.prepare(`
    INSERT INTO product_publish_drafts (title, source_variation_ids, target_platforms, status, payload)
    VALUES (?, ?, ?, 'draft', ?)
  `).bind(title, JSON.stringify(ids), JSON.stringify(targetPlatforms), JSON.stringify(built.payload)).run()

  return Response.json({
    status: 'ok',
    draft_id: result.meta?.last_row_id || null,
    items: built.items.length,
    listings: built.listings.length,
    target_platforms: targetPlatforms,
    validation: built.payload.validation
  }, { headers: cors })
}

export async function listPublishDrafts(env, cors) {
  await ensurePublishDraftTable(env)
  const { results } = await env.DB.prepare(`
    SELECT id, title, target_platforms, status, created_at, updated_at
    FROM product_publish_drafts
    ORDER BY id DESC
    LIMIT 50
  `).all()
  return Response.json({ status: 'ok', data: results || [] }, { headers: cors })
}
