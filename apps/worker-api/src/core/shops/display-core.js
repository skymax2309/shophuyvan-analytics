function cleanShopText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

export function isGeneratedShopeeShopName(value) {
  return /^Shopee\s+\d+$/i.test(cleanShopText(value))
}

function displayName(row = {}) {
  return cleanShopText(row.shop_name || row.shop || row.user_name || row.api_shop_id)
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
    const cleanName = cleanShopText(shopName)
    if (!cleanPlatform || !cleanName) return
    const apiId = cleanShopText(source.api_shop_id)
    if (apiId) {
      const canonical = apiById.get(`${cleanPlatform}|${apiId}`)
      if (canonical && canonical.name !== cleanName && isGeneratedShopeeShopName(cleanName)) return
    }
    map.set(`${cleanPlatform}|${cleanName}`, { platform: cleanPlatform, shop_name: cleanName })
  }

  for (const row of shopRows || []) add(row.platform, displayName(row), row)
  for (const row of orderRows || []) add(row.platform, row.shop_name || row.shop, row)

  return [...map.values()].sort((a, b) => `${a.platform}|${a.shop_name}`.localeCompare(`${b.platform}|${b.shop_name}`))
}
