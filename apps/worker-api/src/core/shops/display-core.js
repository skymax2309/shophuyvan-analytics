function cleanShopText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

export function isGeneratedShopeeShopName(value) {
  return /^Shopee\s+\d+$/i.test(cleanShopText(value))
}

export function isRawShopIdentity(value, platform = '') {
  const text = cleanShopText(value)
  const cleanPlatform = cleanShopText(platform).toLowerCase()
  if (/^(shopee|lazada)\s+\d+$/i.test(text)) return true
  if (!/^\d{6,}$/.test(text)) return false
  return cleanPlatform === 'shopee' || cleanPlatform === 'lazada'
}

function displayName(row = {}) {
  const platform = cleanShopText(row.platform).toLowerCase()
  return [row.shop_display_name, row.shop_name, row.shop, row.user_name]
    .map(cleanShopText)
    .find(value => value && !isRawShopIdentity(value, platform)) || ''
}

function rawIdentityApiId(value) {
  const text = cleanShopText(value)
  const match = text.match(/^(shopee|lazada)\s+(\d+)$/i)
  if (match?.[2]) return match[2]
  return /^\d{6,}$/.test(text) ? text : ''
}

export function buildPublicShopRows(shopRows = [], orderRows = []) {
  const apiById = new Map()
  for (const row of shopRows || []) {
    const platform = cleanShopText(row.platform).toLowerCase()
    const apiId = cleanShopText(row.api_shop_id)
    const name = displayName(row)
    if (!platform || !apiId || !name) continue
    const key = `${platform}|${apiId}`
    const current = apiById.get(key)
    const generated = isGeneratedShopeeShopName(name) && /^\d+$/.test(cleanShopText(row.user_name || apiId))
    if (!current || (current.generated && !generated)) apiById.set(key, { name, generated })
  }

  const map = new Map()
  const add = (platform, shopName, source = {}) => {
    const cleanPlatform = cleanShopText(platform).toLowerCase()
    let cleanName = cleanShopText(shopName)
    if (!cleanPlatform || !cleanName) return
    const apiId = cleanShopText(source.api_shop_id) || rawIdentityApiId(cleanName)
    if (apiId) {
      const canonical = apiById.get(`${cleanPlatform}|${apiId}`)
      if (canonical?.name && isRawShopIdentity(cleanName, cleanPlatform)) cleanName = canonical.name
      if (canonical && canonical.name !== cleanName && isGeneratedShopeeShopName(cleanName)) return
    }
    // Không đưa ID kỹ thuật lên UI public; nếu chưa có tên Core thì giữ trong DB và chờ đồng bộ profile.
    if (isRawShopIdentity(cleanName, cleanPlatform)) return
    map.set(`${cleanPlatform}|${cleanName}`, { platform: cleanPlatform, shop_name: cleanName })
  }

  for (const row of shopRows || []) add(row.platform, displayName(row), row)
  for (const row of orderRows || []) add(row.platform, row.shop_name || row.shop, row)

  return [...map.values()].sort((a, b) => `${a.platform}|${a.shop_name}`.localeCompare(`${b.platform}|${b.shop_name}`))
}
