function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function lowerText(value) {
  return cleanText(value).toLowerCase()
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function numberValue(value, fallback = 0) {
  const number = numberOrNull(value)
  return number === null ? fallback : number
}

function positiveNumber(value) {
  const number = numberOrNull(value)
  return number !== null && number > 0 ? number : null
}

const SHIPPING_METHODS = new Set([
  'by_weight',
  'by_volume',
  'greater_of_weight_or_volume',
  'fixed_per_package',
  'manual'
])

function normalizeShippingMethod(value, fallback = 'by_weight') {
  const method = lowerText(value || fallback)
  return SHIPPING_METHODS.has(method) ? method : ''
}

function packageVolumeM3(lengthCm, widthCm, heightCm) {
  const length = numberValue(lengthCm, 0)
  const width = numberValue(widthCm, 0)
  const height = numberValue(heightCm, 0)
  return length > 0 && width > 0 && height > 0 ? (length * width * height) / 1000000 : 0
}

function changedFields(before = {}, after = {}) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})])
  return [...keys].filter(key => JSON.stringify(before?.[key] ?? null) !== JSON.stringify(after?.[key] ?? null))
}

function todayLocalDate() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function normalizeImportDate(value) {
  const text = cleanText(value)
  if (!text) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  const slash = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/)
  if (slash) {
    const day = slash[1].padStart(2, '0')
    const month = slash[2].padStart(2, '0')
    return `${slash[3]}-${month}-${day}`
  }
  return text
}

function rowSku(row = {}) {
  return cleanText(row.sku_id || row.internal_sku || row.ma_hang || row.sku || row.seller_sku)
}

function blockReasonForRow(row = {}, product = null) {
  const sku = rowSku(row)
  const qty = numberOrNull(row.quantity_imported ?? row.sl_nhap)
  const packageCount = numberOrNull(row.package_count ?? row.so_kien)
  const perPackage = numberOrNull(row.quantity_per_package ?? row.sl_sp_tren_kien)
  const importDate = normalizeImportDate(row.import_date || row.ngay_nhap_hang)
  const purchasePrice = numberOrNull(row.unit_purchase_price_foreign ?? row.gia_nhap_te)
  const purchasePriceVnd = numberOrNull(row.unit_purchase_price_vnd)
  const declaredTaxPrice = numberOrNull(row.declared_tax_price ?? row.gia_khai_thue)
  const method = normalizeShippingMethod(row.shipping_calculation_method || row.shipping_allocation_rule || row.cach_tinh_vc)
  const weight = numberOrNull(row.package_weight_kg)
  const length = numberOrNull(row.package_length_cm ?? row.kich_thuoc_d)
  const width = numberOrNull(row.package_width_cm ?? row.kich_thuoc_r)
  const height = numberOrNull(row.package_height_cm ?? row.kich_thuoc_c)

  if (!importDate) return 'missing_import_date'
  if (!sku) return 'missing_sku'
  if (!product) return 'sku_not_found_in_product_core'
  if (qty === null || qty <= 0) return 'invalid_quantity'
  if (packageCount === null || packageCount <= 0) return 'invalid_package_count'
  if (perPackage === null || perPackage <= 0) return 'invalid_quantity_per_package'
  if (!method) return 'invalid_shipping_calculation_method'
  if (['by_weight', 'greater_of_weight_or_volume'].includes(method) && (weight === null || weight <= 0)) return 'missing_package_weight'
  if (['by_volume', 'greater_of_weight_or_volume'].includes(method) && (!length || !width || !height)) return 'missing_package_dimensions'
  if (purchasePrice === null && purchasePriceVnd === null && declaredTaxPrice === null) return 'missing_purchase_price'
  return ''
}

export function normalizePurchaseInput(row = {}, defaults = {}) {
  const quantity = numberValue(row.quantity_imported ?? row.sl_nhap, 0)
  const perPackage = numberValue(row.quantity_per_package ?? row.sl_sp_tren_kien, 1) || 1
  const packageCount = numberValue(row.package_count ?? row.so_kien, quantity > 0 ? quantity / perPackage : 0)
  const exchangeRate = numberValue(row.exchange_rate, defaults.exchange_rate ?? defaults.ti_gia_te ?? 3650)
  const foreignPrice = numberOrNull(row.unit_purchase_price_foreign ?? row.gia_nhap_te)
  const unitPurchasePriceVnd = numberOrNull(row.unit_purchase_price_vnd)
  const declaredTaxPrice = numberOrNull(row.declared_tax_price ?? row.gia_khai_thue)
  const domesticForeign = numberValue(row.ship_noi_dia_te, 0)
  const domesticVnd = numberValue(row.domestic_shipping_cost, domesticForeign * exchangeRate)
  const international = numberValue(row.international_shipping_cost ?? row.phi_vanchuyen_thuc, 0)
  const packageLength = numberOrNull(row.package_length_cm ?? row.kich_thuoc_d)
  const packageWidth = numberOrNull(row.package_width_cm ?? row.kich_thuoc_r)
  const packageHeight = numberOrNull(row.package_height_cm ?? row.kich_thuoc_c)
  const packageWeight = numberOrNull(row.package_weight_kg ?? row.trong_luong_kg)
  const packageVolume = numberOrNull(row.package_volume_m3) ?? packageVolumeM3(packageLength, packageWidth, packageHeight)
  const shippingMethod = normalizeShippingMethod(row.shipping_calculation_method || row.shipping_allocation_rule || row.cach_tinh_vc, defaults.shipping_calculation_method || 'by_weight')

  return {
    import_date: normalizeImportDate(row.import_date || row.ngay_nhap_hang),
    import_batch_id: cleanText(row.import_batch_id || row.purchase_batch_id),
    batch_code: cleanText(row.batch_code),
    sku_id: cleanText(row.sku_id || row.internal_sku || row.ma_hang || row.sku),
    internal_sku: cleanText(row.internal_sku || row.ma_hang || row.sku_id || row.sku),
    seller_sku: cleanText(row.seller_sku || row.ma_hang || row.platform_sku),
    product_id: cleanText(row.product_id || row.platform_product_id),
    product_name: cleanText(row.product_name || row.ten_san_pham),
    variation_name: cleanText(row.variation_name),
    image_url: cleanText(row.image_url),
    shop_key: cleanText(row.shop_key || row.shop),
    platform: lowerText(row.platform),
    supplier_name: cleanText(row.supplier_name || row.nha_cung_cap),
    purchase_tracking_number: cleanText(row.purchase_tracking_number || row.ma_van_don),
    quantity_imported: quantity,
    package_count: packageCount,
    quantity_per_package: perPackage,
    quantity_remaining: numberValue(row.quantity_remaining, quantity),
    package_length_cm: packageLength,
    package_width_cm: packageWidth,
    package_height_cm: packageHeight,
    package_weight_kg: packageWeight,
    package_volume_m3: packageVolume,
    total_weight_kg: packageCount * numberValue(packageWeight, 0),
    total_volume_m3: packageCount * numberValue(packageVolume, 0),
    shipping_calculation_method: shippingMethod,
    currency: cleanText(row.currency || 'CNY'),
    exchange_rate: exchangeRate,
    unit_purchase_price_foreign: foreignPrice,
    unit_purchase_price_vnd: unitPurchasePriceVnd,
    declared_tax_price: declaredTaxPrice,
    domestic_shipping_cost: domesticVnd,
    international_shipping_cost: international,
    shipping_allocation_rule: shippingMethod,
    vat_percent: numberValue(row.vat_percent ?? row.thue_vat_percent, 10),
    other_fee: numberValue(row.other_fee, 0),
    forwarder_name: cleanText(row.forwarder_name || row.don_vi_van_chuyen),
    container_or_waybill_no: cleanText(row.container_or_waybill_no),
    customs_declaration_no: cleanText(row.customs_declaration_no),
    customs_declaration_date: normalizeImportDate(row.customs_declaration_date),
    invoice_no: cleanText(row.invoice_no),
    link_nhap_hang: cleanText(row.link_nhap_hang),
    cong_dung: cleanText(row.cong_dung),
    chat_lieu: cleanText(row.chat_lieu),
    source: cleanText(row.source || 'purchase_admin'),
    note: cleanText(row.note || row.ghi_chu),
    raw_payload: row
  }
}

export function calculatePurchaseCost(input = {}, product = {}, defaults = {}) {
  const normalized = normalizePurchaseInput(input, defaults)
  const quantity = Math.max(numberValue(normalized.quantity_imported, 0), 0)
  const unitPurchasePriceVnd = numberOrNull(normalized.unit_purchase_price_vnd) !== null
    ? numberValue(normalized.unit_purchase_price_vnd, 0)
    : positiveNumber(normalized.unit_purchase_price_foreign) !== null
    ? numberValue(normalized.unit_purchase_price_foreign) * numberValue(normalized.exchange_rate, 0)
    : numberValue(normalized.declared_tax_price, 0)
  const totalWeightKg = numberValue(normalized.package_count, 0) * numberValue(normalized.package_weight_kg, 0)
  const totalVolumeM3 = numberValue(normalized.package_count, 0) * numberValue(normalized.package_volume_m3, 0)
  const volumetricFactor = numberValue(defaults.volumetric_factor, 200)
  const volumetricWeightKg = totalVolumeM3 * volumetricFactor
  const shippingMethod = normalizeShippingMethod(normalized.shipping_calculation_method, 'by_weight')
  let shippingBasis = 0
  let estimatedInternationalShipping = numberValue(normalized.international_shipping_cost, 0)
  if (shippingMethod === 'by_weight') {
    shippingBasis = totalWeightKg
    if (!estimatedInternationalShipping) estimatedInternationalShipping = shippingBasis * numberValue(defaults.phi_vanchuyen_kg, 0)
  } else if (shippingMethod === 'by_volume') {
    shippingBasis = totalVolumeM3
    if (!estimatedInternationalShipping) estimatedInternationalShipping = shippingBasis * numberValue(defaults.phi_vanchuyen_khoi, 0)
  } else if (shippingMethod === 'greater_of_weight_or_volume') {
    shippingBasis = Math.max(totalWeightKg, volumetricWeightKg)
    if (!estimatedInternationalShipping) estimatedInternationalShipping = shippingBasis * numberValue(defaults.phi_vanchuyen_kg, 0)
  } else if (shippingMethod === 'fixed_per_package') {
    shippingBasis = numberValue(normalized.package_count, 0)
    if (!estimatedInternationalShipping) estimatedInternationalShipping = shippingBasis * numberValue(defaults.fixed_shipping_fee_per_package, 0)
  } else {
    shippingBasis = quantity
  }
  const shippingTotal = numberValue(normalized.domestic_shipping_cost, 0) + estimatedInternationalShipping
  const taxBase = numberValue(normalized.declared_tax_price, unitPurchasePriceVnd) * quantity
  const vatAmount = taxBase * (numberValue(normalized.vat_percent, 0) / 100)
  const importTaxAmount = numberValue(input.import_tax_amount, 0)
  const otherFee = numberValue(normalized.other_fee, 0)
  const allocatedShippingPerUnit = quantity > 0 ? shippingTotal / quantity : 0
  const allocatedTaxPerUnit = quantity > 0 ? (vatAmount + importTaxAmount) / quantity : 0
  const allocatedOtherFeePerUnit = quantity > 0 ? otherFee / quantity : 0
  const landedCostPerUnit = unitPurchasePriceVnd + allocatedShippingPerUnit + allocatedTaxPerUnit + allocatedOtherFeePerUnit
  const totalBatchCost = quantity * landedCostPerUnit

  const formulaSnapshot = {
    input_fields: normalized,
    product_core: product ? {
      sku_id: cleanText(product.sku_id || product.internal_sku || product.sku),
      product_id: cleanText(product.product_id || product.platform_product_id),
      product_name: cleanText(product.product_name || product.name)
    } : null,
    exchange_rate: numberValue(normalized.exchange_rate, 0),
    shipping_calculation_method: shippingMethod,
    package_count: normalized.package_count,
    package_weight_kg: normalized.package_weight_kg,
    package_volume_m3: normalized.package_volume_m3,
    total_weight_kg: totalWeightKg,
    total_volume_m3: totalVolumeM3,
    volumetric_factor: volumetricFactor,
    volumetric_weight_kg: volumetricWeightKg,
    shipping_basis: shippingBasis,
    shipping_total: shippingTotal,
    unit_purchase_price_vnd: unitPurchasePriceVnd,
    allocated_shipping_per_unit: allocatedShippingPerUnit,
    allocated_tax_per_unit: allocatedTaxPerUnit,
    allocated_other_fee_per_unit: allocatedOtherFeePerUnit,
    landed_cost_per_unit: landedCostPerUnit,
    total_batch_cost: totalBatchCost,
    applied_at: new Date().toISOString()
  }

  return {
    ...normalized,
    product_id: cleanText(product?.product_id || product?.platform_product_id || normalized.product_id),
    product_name: cleanText(product?.product_name || product?.name || normalized.product_name),
    variation_name: cleanText(product?.variation_name || normalized.variation_name),
    image_url: cleanText(product?.image_url || normalized.image_url),
    shop_key: '',
    platform: lowerText(product?.platform || normalized.platform),
    seller_sku: cleanText(product?.seller_sku || product?.platform_sku || normalized.seller_sku),
    unit_purchase_price_vnd: unitPurchasePriceVnd,
    international_shipping_cost: estimatedInternationalShipping,
    total_weight_kg: totalWeightKg,
    total_volume_m3: totalVolumeM3,
    volumetric_factor: volumetricFactor,
    volumetric_weight_kg: volumetricWeightKg,
    shipping_basis: shippingBasis,
    shipping_calculation_method: shippingMethod,
    allocated_shipping_per_unit: allocatedShippingPerUnit,
    allocated_tax_per_unit: allocatedTaxPerUnit,
    allocated_other_fee_per_unit: allocatedOtherFeePerUnit,
    vat_amount: vatAmount,
    import_tax_amount: importTaxAmount,
    total_batch_cost: totalBatchCost,
    landed_cost_per_unit: landedCostPerUnit,
    formula_snapshot: formulaSnapshot
  }
}

export function calculateWeightedAverageCurrentCost(layers = []) {
  const active = layers
    .map(layer => ({
      quantity_remaining: numberValue(layer.quantity_remaining, 0),
      landed_cost_per_unit: numberValue(layer.landed_cost_per_unit, 0)
    }))
    .filter(layer => layer.quantity_remaining > 0)
  const totalRemaining = active.reduce((sum, layer) => sum + layer.quantity_remaining, 0)
  const weightedCost = active.reduce((sum, layer) => sum + layer.quantity_remaining * layer.landed_cost_per_unit, 0)
  return {
    current_cost: totalRemaining > 0 ? weightedCost / totalRemaining : null,
    total_remaining_stock: totalRemaining,
    batch_count: active.length,
    cost_status: totalRemaining > 0 ? 'cost_ready' : 'cost_missing',
    current_cost_method: 'weighted_average_remaining_stock'
  }
}

async function tableExists(env, tableName) {
  const row = await env.DB.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1
  `).bind(tableName).first()
  return Boolean(row?.name)
}

async function addColumnIfMissing(env, tableName, column, definition) {
  const { results } = await env.DB.prepare(`PRAGMA table_info(${tableName})`).all()
  const exists = (results || []).some(row => cleanText(row.name) === column)
  if (exists) return
  await env.DB.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${column} ${definition}`).run()
}

export async function ensurePurchaseCoreTables(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS purchase_batches (
      purchase_batch_id TEXT PRIMARY KEY,
      import_batch_id TEXT DEFAULT '',
      batch_code TEXT DEFAULT '',
      import_date TEXT NOT NULL,
      supplier_name TEXT DEFAULT '',
      forwarder_name TEXT DEFAULT '',
      purchase_tracking_number TEXT DEFAULT '',
      container_or_waybill_no TEXT DEFAULT '',
      shipment_status TEXT DEFAULT 'draft',
      customs_declaration_no TEXT DEFAULT '',
      customs_declaration_date TEXT DEFAULT '',
      invoice_no TEXT DEFAULT '',
      currency TEXT DEFAULT 'CNY',
      exchange_rate REAL,
      total_package_count REAL DEFAULT 0,
      total_quantity REAL DEFAULT 0,
      total_weight_kg REAL DEFAULT 0,
      total_volume_m3 REAL DEFAULT 0,
      total_purchase_value REAL DEFAULT 0,
      total_declared_value REAL DEFAULT 0,
      total_shipping_fee REAL DEFAULT 0,
      total_tax REAL DEFAULT 0,
      total_landed_cost REAL DEFAULT 0,
      note TEXT DEFAULT '',
      source TEXT DEFAULT 'purchase_admin',
      raw_payload TEXT,
      created_at TEXT DEFAULT (datetime('now', '+7 hours')),
      updated_at TEXT DEFAULT (datetime('now', '+7 hours'))
    )
  `).run()
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS purchase_batch_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_batch_id TEXT NOT NULL,
      import_date TEXT NOT NULL,
      sku_id TEXT NOT NULL,
      internal_sku TEXT DEFAULT '',
      seller_sku TEXT DEFAULT '',
      product_id TEXT DEFAULT '',
      product_name TEXT DEFAULT '',
      shop_key TEXT DEFAULT '',
      supplier_name TEXT DEFAULT '',
      purchase_tracking_number TEXT DEFAULT '',
      quantity_imported REAL NOT NULL,
      package_count REAL DEFAULT 0,
      quantity_per_package REAL DEFAULT 1,
      quantity_remaining REAL NOT NULL,
      package_length_cm REAL,
      package_width_cm REAL,
      package_height_cm REAL,
      package_weight_kg REAL,
      package_volume_m3 REAL,
      total_weight_kg REAL DEFAULT 0,
      total_volume_m3 REAL DEFAULT 0,
      shipping_calculation_method TEXT DEFAULT 'by_weight',
      currency TEXT DEFAULT 'CNY',
      exchange_rate REAL,
      unit_purchase_price_foreign REAL,
      unit_purchase_price_vnd REAL,
      declared_tax_price REAL,
      domestic_shipping_cost REAL DEFAULT 0,
      international_shipping_cost REAL DEFAULT 0,
      shipping_allocation_rule TEXT DEFAULT 'quantity',
      vat_percent REAL DEFAULT 0,
      vat_amount REAL DEFAULT 0,
      import_tax_amount REAL DEFAULT 0,
      other_fee REAL DEFAULT 0,
      allocated_shipping_per_unit REAL DEFAULT 0,
      allocated_tax_per_unit REAL DEFAULT 0,
      allocated_other_fee_per_unit REAL DEFAULT 0,
      total_batch_cost REAL DEFAULT 0,
      landed_cost_per_unit REAL DEFAULT 0,
      line_no INTEGER DEFAULT 0,
      forwarder_name TEXT DEFAULT '',
      container_or_waybill_no TEXT DEFAULT '',
      customs_declaration_no TEXT DEFAULT '',
      customs_declaration_date TEXT DEFAULT '',
      invoice_no TEXT DEFAULT '',
      link_nhap_hang TEXT DEFAULT '',
      cong_dung TEXT DEFAULT '',
      chat_lieu TEXT DEFAULT '',
      last_edited_by TEXT DEFAULT '',
      last_edited_at TEXT DEFAULT '',
      last_edit_reason TEXT DEFAULT '',
      last_changed_fields TEXT DEFAULT '',
      source TEXT DEFAULT 'purchase_admin',
      formula_snapshot TEXT,
      raw_payload TEXT,
      note TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now', '+7 hours')),
      updated_at TEXT DEFAULT (datetime('now', '+7 hours'))
    )
  `).run()
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS inventory_cost_layers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku_id TEXT NOT NULL,
      purchase_batch_item_id INTEGER DEFAULT 0,
      purchase_batch_id TEXT NOT NULL,
      import_date TEXT NOT NULL,
      quantity_imported REAL NOT NULL,
      quantity_consumed REAL DEFAULT 0,
      quantity_remaining REAL NOT NULL,
      landed_cost_per_unit REAL NOT NULL,
      layer_status TEXT DEFAULT 'active',
      source TEXT DEFAULT 'warehouse_purchase_core',
      created_at TEXT DEFAULT (datetime('now', '+7 hours')),
      updated_at TEXT DEFAULT (datetime('now', '+7 hours'))
    )
  `).run()
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS product_logistics_profiles (
      sku_id TEXT PRIMARY KEY,
      internal_sku TEXT DEFAULT '',
      package_length_cm REAL,
      package_width_cm REAL,
      package_height_cm REAL,
      package_weight_kg REAL,
      package_volume_m3 REAL,
      default_quantity_per_package REAL DEFAULT 1,
      shipping_calculation_method TEXT DEFAULT 'by_weight',
      logistics_profile_source TEXT DEFAULT 'warehouse_purchase_core',
      logistics_profile_status TEXT DEFAULT 'missing',
      last_logistics_profile_updated_at TEXT DEFAULT (datetime('now', '+7 hours')),
      updated_by TEXT DEFAULT '',
      raw_payload TEXT
    )
  `).run()
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS purchase_batch_revisions (
      revision_id TEXT PRIMARY KEY,
      purchase_batch_id TEXT DEFAULT '',
      purchase_batch_item_id INTEGER DEFAULT 0,
      sku_id TEXT DEFAULT '',
      before_payload TEXT,
      after_payload TEXT,
      changed_fields TEXT,
      edited_by TEXT DEFAULT '',
      edited_at TEXT DEFAULT (datetime('now', '+7 hours')),
      edit_reason TEXT NOT NULL
    )
  `).run()
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS sku_current_cost_read_model (
      sku_id TEXT PRIMARY KEY,
      internal_sku TEXT DEFAULT '',
      current_cost REAL,
      current_cost_method TEXT DEFAULT 'weighted_average_remaining_stock',
      total_remaining_stock REAL DEFAULT 0,
      batch_count INTEGER DEFAULT 0,
      latest_import_date TEXT DEFAULT '',
      latest_landed_cost_per_unit REAL,
      reference_cost REAL,
      cost_status TEXT DEFAULT 'missing',
      last_cost_calculated_at TEXT DEFAULT (datetime('now', '+7 hours')),
      source TEXT DEFAULT 'warehouse_purchase_core'
    )
  `).run()
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS settings_import (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT (datetime('now', '+7 hours'))
    )
  `).run()
  for (const [key, value] of [
    ['ti_gia_te', '3650'],
    ['ti_gia_usd', '25000'],
    ['phi_vanchuyen_kg', '30000'],
    ['phi_vanchuyen_khoi', '3000000'],
    ['volumetric_factor', '200'],
    ['fixed_shipping_fee_per_package', '0']
  ]) {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO settings_import (key, value, updated_at)
      VALUES (?, ?, datetime('now', '+7 hours'))
    `).bind(key, value).run()
  }
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_purchase_batch_items_sku_date ON purchase_batch_items(sku_id, import_date DESC)`).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_inventory_cost_layers_sku ON inventory_cost_layers(sku_id, layer_status, quantity_remaining)`).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_purchase_batches_date ON purchase_batches(import_date DESC)`).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_purchase_revisions_item ON purchase_batch_revisions(purchase_batch_item_id, edited_at DESC)`).run()

  for (const [table, columns] of [
    ['purchase_batches', [
      ['import_batch_id', `TEXT DEFAULT ''`],
      ['batch_code', `TEXT DEFAULT ''`],
      ['forwarder_name', `TEXT DEFAULT ''`],
      ['container_or_waybill_no', `TEXT DEFAULT ''`],
      ['shipment_status', `TEXT DEFAULT 'draft'`],
      ['customs_declaration_no', `TEXT DEFAULT ''`],
      ['customs_declaration_date', `TEXT DEFAULT ''`],
      ['invoice_no', `TEXT DEFAULT ''`],
      ['total_package_count', `REAL DEFAULT 0`],
      ['total_quantity', `REAL DEFAULT 0`],
      ['total_weight_kg', `REAL DEFAULT 0`],
      ['total_volume_m3', `REAL DEFAULT 0`],
      ['total_purchase_value', `REAL DEFAULT 0`],
      ['total_declared_value', `REAL DEFAULT 0`],
      ['total_shipping_fee', `REAL DEFAULT 0`],
      ['total_tax', `REAL DEFAULT 0`],
      ['total_landed_cost', `REAL DEFAULT 0`],
      ['note', `TEXT DEFAULT ''`]
    ]],
    ['purchase_batch_items', [
      ['package_length_cm', `REAL`],
      ['package_width_cm', `REAL`],
      ['package_height_cm', `REAL`],
      ['package_weight_kg', `REAL`],
      ['package_volume_m3', `REAL`],
      ['total_weight_kg', `REAL DEFAULT 0`],
      ['total_volume_m3', `REAL DEFAULT 0`],
      ['shipping_calculation_method', `TEXT DEFAULT 'by_weight'`],
      ['allocated_shipping_per_unit', `REAL DEFAULT 0`],
      ['allocated_tax_per_unit', `REAL DEFAULT 0`],
      ['allocated_other_fee_per_unit', `REAL DEFAULT 0`],
      ['line_no', `INTEGER DEFAULT 0`],
      ['forwarder_name', `TEXT DEFAULT ''`],
      ['container_or_waybill_no', `TEXT DEFAULT ''`],
      ['customs_declaration_no', `TEXT DEFAULT ''`],
      ['customs_declaration_date', `TEXT DEFAULT ''`],
      ['invoice_no', `TEXT DEFAULT ''`],
      ['link_nhap_hang', `TEXT DEFAULT ''`],
      ['cong_dung', `TEXT DEFAULT ''`],
      ['chat_lieu', `TEXT DEFAULT ''`],
      ['last_edited_by', `TEXT DEFAULT ''`],
      ['last_edited_at', `TEXT DEFAULT ''`],
      ['last_edit_reason', `TEXT DEFAULT ''`],
      ['last_changed_fields', `TEXT DEFAULT ''`]
    ]],
    ['inventory_cost_layers', [
      ['purchase_batch_item_id', `INTEGER DEFAULT 0`]
    ]]
  ]) {
    if (await tableExists(env, table)) {
      for (const [column, definition] of columns) {
        await addColumnIfMissing(env, table, column, definition).catch(() => null)
      }
    }
  }

  if (await tableExists(env, 'purchase_orders')) {
    for (const [column, definition] of [
      ['ngay_nhap_hang', `TEXT DEFAULT ''`],
      ['supplier_name', `TEXT DEFAULT ''`],
      ['purchase_batch_id', `TEXT DEFAULT ''`],
      ['landed_cost_per_unit', `REAL`],
      ['current_cost', `REAL`],
      ['cost_status', `TEXT DEFAULT ''`]
    ]) {
      await addColumnIfMissing(env, 'purchase_orders', column, definition).catch(() => null)
    }
  }
}

export async function getPurchaseSettings(env) {
  await ensurePurchaseCoreTables(env)
  const fallback = {
    exchange_rate: 3650,
    ti_gia_te: 3650,
    phi_vanchuyen_kg: 30000,
    phi_vanchuyen_khoi: 3000000,
    volumetric_factor: 200,
    fixed_shipping_fee_per_package: 0
  }
  if (!await tableExists(env, 'settings_import')) return fallback
  const { results } = await env.DB.prepare(`SELECT key, value FROM settings_import`).all()
  for (const row of results || []) {
    const key = cleanText(row.key)
    const value = numberValue(row.value, fallback[key] ?? 0)
    fallback[key] = value
    if (key === 'ti_gia_te') fallback.exchange_rate = value
  }
  return fallback
}

export async function findProductCoreBySku(env, sku) {
  const cleanSku = cleanText(sku)
  if (!cleanSku) return null
  const hasProducts = await tableExists(env, 'products')
  const hasVariations = await tableExists(env, 'product_variations')
  const variation = hasVariations ? await env.DB.prepare(`
    SELECT *
    FROM product_variations
    WHERE internal_sku = ? OR platform_sku = ? OR model_id = ?
    LIMIT 1
  `).bind(cleanSku, cleanSku, cleanSku).first() : null
  const productSku = cleanText(variation?.internal_sku || cleanSku)
  const product = hasProducts ? await env.DB.prepare(`
    SELECT *
    FROM products
    WHERE sku = ?
    LIMIT 1
  `).bind(productSku).first() : null
  if (!product && !variation) return null
  return {
    sku_id: cleanText(product?.sku || variation?.internal_sku || variation?.platform_sku || cleanSku),
    internal_sku: cleanText(product?.sku || variation?.internal_sku || cleanSku),
    seller_sku: cleanText(variation?.platform_sku || cleanSku),
    product_id: cleanText(variation?.platform_item_id || product?.id || product?.sku),
    product_name: cleanText(product?.product_name || variation?.product_name),
    variation_name: cleanText(variation?.variation_name),
    image_url: cleanText(product?.image_url || variation?.image_url),
    category: cleanText(product?.category || variation?.category),
    shop_key: cleanText(variation?.shop),
    platform: lowerText(variation?.platform),
    product_status: cleanText(product?.status || variation?.status || 'active'),
    reference_cost: numberOrNull(product?.cost_real ?? product?.cost_invoice)
  }
}

function logisticsProfileStatus(profile = {}) {
  const method = normalizeShippingMethod(profile.shipping_calculation_method)
  const hasWeight = numberValue(profile.package_weight_kg, 0) > 0
  const hasDimensions = numberValue(profile.package_length_cm, 0) > 0 && numberValue(profile.package_width_cm, 0) > 0 && numberValue(profile.package_height_cm, 0) > 0
  if (!method) return 'missing'
  if (['by_weight', 'greater_of_weight_or_volume'].includes(method) && !hasWeight) return 'missing'
  if (['by_volume', 'greater_of_weight_or_volume'].includes(method) && !hasDimensions) return 'missing'
  return 'ready'
}

export async function getLogisticsProfileBySku(env, skuId) {
  const sku = cleanText(skuId)
  if (!sku) return null
  await ensurePurchaseCoreTables(env)
  return await env.DB.prepare(`
    SELECT *
    FROM product_logistics_profiles
    WHERE sku_id = ? OR internal_sku = ?
    LIMIT 1
  `).bind(sku, sku).first()
}

export async function upsertLogisticsProfile(env, skuId, payload = {}, user = {}) {
  const product = await findProductCoreBySku(env, skuId)
  if (!product) return { ok: false, error: 'sku_not_found_in_product_core' }
  const method = normalizeShippingMethod(payload.shipping_calculation_method, 'by_weight')
  if (!method) return { ok: false, error: 'invalid_shipping_calculation_method' }
  const length = numberOrNull(payload.package_length_cm)
  const width = numberOrNull(payload.package_width_cm)
  const height = numberOrNull(payload.package_height_cm)
  const weight = numberOrNull(payload.package_weight_kg)
  const volume = numberOrNull(payload.package_volume_m3) ?? packageVolumeM3(length, width, height)
  const profile = {
    sku_id: product.sku_id,
    internal_sku: product.internal_sku,
    package_length_cm: length,
    package_width_cm: width,
    package_height_cm: height,
    package_weight_kg: weight,
    package_volume_m3: volume,
    default_quantity_per_package: numberValue(payload.default_quantity_per_package ?? payload.quantity_per_package, 1),
    shipping_calculation_method: method,
    logistics_profile_source: cleanText(payload.logistics_profile_source || 'warehouse_purchase_core'),
    logistics_profile_status: 'missing',
    updated_by: cleanText(user?.email || user?.username || user?.role || '')
  }
  profile.logistics_profile_status = logisticsProfileStatus(profile)
  await ensurePurchaseCoreTables(env)
  await env.DB.prepare(`
    INSERT INTO product_logistics_profiles (
      sku_id, internal_sku, package_length_cm, package_width_cm, package_height_cm,
      package_weight_kg, package_volume_m3, default_quantity_per_package,
      shipping_calculation_method, logistics_profile_source, logistics_profile_status,
      last_logistics_profile_updated_at, updated_by, raw_payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+7 hours'), ?, ?)
    ON CONFLICT(sku_id) DO UPDATE SET
      internal_sku = excluded.internal_sku,
      package_length_cm = excluded.package_length_cm,
      package_width_cm = excluded.package_width_cm,
      package_height_cm = excluded.package_height_cm,
      package_weight_kg = excluded.package_weight_kg,
      package_volume_m3 = excluded.package_volume_m3,
      default_quantity_per_package = excluded.default_quantity_per_package,
      shipping_calculation_method = excluded.shipping_calculation_method,
      logistics_profile_source = excluded.logistics_profile_source,
      logistics_profile_status = excluded.logistics_profile_status,
      last_logistics_profile_updated_at = datetime('now', '+7 hours'),
      updated_by = excluded.updated_by,
      raw_payload = excluded.raw_payload
  `).bind(
    profile.sku_id,
    profile.internal_sku,
    profile.package_length_cm,
    profile.package_width_cm,
    profile.package_height_cm,
    profile.package_weight_kg,
    profile.package_volume_m3,
    profile.default_quantity_per_package,
    profile.shipping_calculation_method,
    profile.logistics_profile_source,
    profile.logistics_profile_status,
    profile.updated_by,
    JSON.stringify(payload || {})
  ).run()
  return { ok: true, profile: await getLogisticsProfileBySku(env, product.sku_id) }
}

function applyLogisticsProfile(raw = {}, profile = null) {
  if (!profile) return raw
  return {
    ...raw,
    package_length_cm: raw.package_length_cm ?? raw.kich_thuoc_d ?? profile.package_length_cm,
    package_width_cm: raw.package_width_cm ?? raw.kich_thuoc_r ?? profile.package_width_cm,
    package_height_cm: raw.package_height_cm ?? raw.kich_thuoc_c ?? profile.package_height_cm,
    package_weight_kg: raw.package_weight_kg ?? raw.trong_luong_kg ?? profile.package_weight_kg,
    package_volume_m3: raw.package_volume_m3 ?? profile.package_volume_m3,
    quantity_per_package: raw.quantity_per_package ?? raw.sl_sp_tren_kien ?? profile.default_quantity_per_package,
    sl_sp_tren_kien: raw.sl_sp_tren_kien ?? raw.quantity_per_package ?? profile.default_quantity_per_package,
    shipping_calculation_method: raw.shipping_calculation_method ?? raw.cach_tinh_vc ?? profile.shipping_calculation_method
  }
}

export async function previewPurchaseRows(env, rows = [], options = {}) {
  await ensurePurchaseCoreTables(env)
  const settings = { ...await getPurchaseSettings(env), ...(options.settings || {}) }
  const previewRows = []
  for (const [index, raw] of (rows || []).entries()) {
    const rawSku = rowSku(raw)
    const product = await findProductCoreBySku(env, rawSku)
    const profile = product ? await getLogisticsProfileBySku(env, product.sku_id) : null
    const normalized = normalizePurchaseInput(applyLogisticsProfile(raw, profile), settings)
    const blockReason = blockReasonForRow(normalized, product)
    const calculated = product ? calculatePurchaseCost(normalized, product, settings) : { ...normalized }
    previewRows.push({
      row_index: index + 1,
      status: blockReason ? 'blocked' : 'ready',
      block_reason: blockReason,
      purchase_batch_id: cleanText(raw.purchase_batch_id) || `preview_${index + 1}`,
      ...calculated,
      product_core: product,
      logistics_profile: profile,
      logistics_profile_status: cleanText(profile?.logistics_profile_status || 'missing'),
      raw_payload: raw
    })
  }
  return {
    ok: true,
    status: 'preview',
    ready_count: previewRows.filter(row => row.status === 'ready').length,
    blocked_count: previewRows.filter(row => row.status === 'blocked').length,
    rows: previewRows
  }
}

export async function recalculateSkuCurrentCost(env, skuId) {
  const sku = cleanText(skuId)
  if (!sku) return null
  await ensurePurchaseCoreTables(env)
  const { results } = await env.DB.prepare(`
    SELECT purchase_batch_id, import_date, quantity_remaining, landed_cost_per_unit
    FROM inventory_cost_layers
    WHERE sku_id = ? AND quantity_remaining > 0
    ORDER BY import_date DESC, id DESC
  `).bind(sku).all()
  const layers = results || []
  const weighted = calculateWeightedAverageCurrentCost(layers)
  const latest = layers[0] || {}
  const product = await findProductCoreBySku(env, sku)
  await env.DB.prepare(`
    INSERT INTO sku_current_cost_read_model (
      sku_id, internal_sku, current_cost, current_cost_method, total_remaining_stock,
      batch_count, latest_import_date, latest_landed_cost_per_unit, reference_cost,
      cost_status, last_cost_calculated_at, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+7 hours'), 'warehouse_purchase_core')
    ON CONFLICT(sku_id) DO UPDATE SET
      internal_sku = excluded.internal_sku,
      current_cost = excluded.current_cost,
      current_cost_method = excluded.current_cost_method,
      total_remaining_stock = excluded.total_remaining_stock,
      batch_count = excluded.batch_count,
      latest_import_date = excluded.latest_import_date,
      latest_landed_cost_per_unit = excluded.latest_landed_cost_per_unit,
      reference_cost = excluded.reference_cost,
      cost_status = excluded.cost_status,
      last_cost_calculated_at = datetime('now', '+7 hours'),
      source = 'warehouse_purchase_core'
  `).bind(
    sku,
    cleanText(product?.internal_sku || sku),
    weighted.current_cost,
    weighted.current_cost_method,
    weighted.total_remaining_stock,
    weighted.batch_count,
    cleanText(latest.import_date),
    numberOrNull(latest.landed_cost_per_unit),
    numberOrNull(product?.reference_cost),
    weighted.cost_status
  ).run()
  return {
    sku_id: sku,
    internal_sku: cleanText(product?.internal_sku || sku),
    latest_import_date: cleanText(latest.import_date),
    latest_landed_cost_per_unit: numberOrNull(latest.landed_cost_per_unit),
    reference_cost: numberOrNull(product?.reference_cost),
    ...weighted,
    source: 'warehouse_purchase_core'
  }
}

async function refreshPurchaseBatchTotals(env, purchaseBatchId) {
  const batchId = cleanText(purchaseBatchId)
  if (!batchId) return null
  const totals = await env.DB.prepare(`
    SELECT
      COALESCE(SUM(package_count), 0) AS total_package_count,
      COALESCE(SUM(quantity_imported), 0) AS total_quantity,
      COALESCE(SUM(total_weight_kg), 0) AS total_weight_kg,
      COALESCE(SUM(total_volume_m3), 0) AS total_volume_m3,
      COALESCE(SUM(quantity_imported * unit_purchase_price_vnd), 0) AS total_purchase_value,
      COALESCE(SUM(quantity_imported * declared_tax_price), 0) AS total_declared_value,
      COALESCE(SUM(domestic_shipping_cost + international_shipping_cost), 0) AS total_shipping_fee,
      COALESCE(SUM(vat_amount + import_tax_amount), 0) AS total_tax,
      COALESCE(SUM(total_batch_cost), 0) AS total_landed_cost
    FROM purchase_batch_items
    WHERE purchase_batch_id = ?
  `).bind(batchId).first()
  await env.DB.prepare(`
    UPDATE purchase_batches
    SET total_package_count = ?, total_quantity = ?, total_weight_kg = ?, total_volume_m3 = ?,
        total_purchase_value = ?, total_declared_value = ?, total_shipping_fee = ?,
        total_tax = ?, total_landed_cost = ?, updated_at = datetime('now', '+7 hours')
    WHERE purchase_batch_id = ?
  `).bind(
    numberValue(totals?.total_package_count, 0),
    numberValue(totals?.total_quantity, 0),
    numberValue(totals?.total_weight_kg, 0),
    numberValue(totals?.total_volume_m3, 0),
    numberValue(totals?.total_purchase_value, 0),
    numberValue(totals?.total_declared_value, 0),
    numberValue(totals?.total_shipping_fee, 0),
    numberValue(totals?.total_tax, 0),
    numberValue(totals?.total_landed_cost, 0),
    batchId
  ).run()
  return await env.DB.prepare(`SELECT * FROM purchase_batches WHERE purchase_batch_id = ?`).bind(batchId).first()
}

export async function confirmPurchaseRows(env, rows = [], options = {}) {
  const preview = await previewPurchaseRows(env, rows, options)
  const readyRows = preview.rows.filter(row => row.status === 'ready')
  const inserted = []
  const importBatch = options.import_batch || {}
  const batchId = cleanText(importBatch.import_batch_id || importBatch.purchase_batch_id || readyRows[0]?.import_batch_id) || crypto.randomUUID()
  const batchCode = cleanText(importBatch.batch_code || readyRows[0]?.batch_code) || `NH-${todayLocalDate().replace(/-/g, '')}-${batchId.slice(0, 8)}`
  const first = readyRows[0] || {}
  if (readyRows.length) {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO purchase_batches (
        purchase_batch_id, import_batch_id, batch_code, import_date, supplier_name, forwarder_name,
        purchase_tracking_number, container_or_waybill_no, shipment_status, customs_declaration_no,
        customs_declaration_date, invoice_no, currency, exchange_rate, source, raw_payload, note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      batchId,
      batchId,
      batchCode,
      first.import_date,
      cleanText(importBatch.supplier_name || first.supplier_name),
      cleanText(importBatch.forwarder_name || first.forwarder_name),
      cleanText(importBatch.purchase_tracking_number || first.purchase_tracking_number),
      cleanText(importBatch.container_or_waybill_no || first.container_or_waybill_no),
      cleanText(importBatch.shipment_status || 'confirmed'),
      cleanText(importBatch.customs_declaration_no || first.customs_declaration_no),
      cleanText(importBatch.customs_declaration_date || first.customs_declaration_date),
      cleanText(importBatch.invoice_no || first.invoice_no),
      first.currency || 'CNY',
      first.exchange_rate,
      first.source || 'purchase_admin',
      JSON.stringify({ import_batch: importBatch, rows }),
      cleanText(importBatch.note || first.note)
    ).run()
  }
  for (const row of readyRows) {
    const rawPayload = JSON.stringify(row.raw_payload || {})
    const formula = JSON.stringify(row.formula_snapshot || {})
    if (options.update_logistics_profile || row.raw_payload?.update_logistics_profile || row.raw_payload?.cap_nhat_mac_dinh_sku) {
      await upsertLogisticsProfile(env, row.sku_id, {
        package_length_cm: row.package_length_cm,
        package_width_cm: row.package_width_cm,
        package_height_cm: row.package_height_cm,
        package_weight_kg: row.package_weight_kg,
        package_volume_m3: row.package_volume_m3,
        default_quantity_per_package: row.quantity_per_package,
        shipping_calculation_method: row.shipping_calculation_method,
        logistics_profile_source: 'purchase_import_confirm'
      }, options.user || {})
    }
    const insertedItem = await env.DB.prepare(`
      INSERT INTO purchase_batch_items (
        purchase_batch_id, import_date, sku_id, internal_sku, seller_sku, product_id,
        product_name, shop_key, supplier_name, purchase_tracking_number, quantity_imported,
        package_count, quantity_per_package, quantity_remaining, package_length_cm, package_width_cm,
        package_height_cm, package_weight_kg, package_volume_m3, total_weight_kg, total_volume_m3,
        shipping_calculation_method, currency, exchange_rate,
        unit_purchase_price_foreign, unit_purchase_price_vnd, declared_tax_price,
        domestic_shipping_cost, international_shipping_cost, shipping_allocation_rule,
        vat_percent, vat_amount, import_tax_amount, other_fee, allocated_shipping_per_unit,
        allocated_tax_per_unit, allocated_other_fee_per_unit, total_batch_cost,
        landed_cost_per_unit, line_no, forwarder_name, container_or_waybill_no, customs_declaration_no,
        customs_declaration_date, invoice_no, link_nhap_hang, cong_dung, chat_lieu,
        source, formula_snapshot, raw_payload, note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      batchId, row.import_date, row.sku_id, row.internal_sku, row.seller_sku, row.product_id,
      row.product_name, '', row.supplier_name, row.purchase_tracking_number, row.quantity_imported,
      row.package_count, row.quantity_per_package, row.quantity_remaining, row.package_length_cm, row.package_width_cm,
      row.package_height_cm, row.package_weight_kg, row.package_volume_m3, row.total_weight_kg, row.total_volume_m3,
      row.shipping_calculation_method, row.currency, row.exchange_rate,
      row.unit_purchase_price_foreign, row.unit_purchase_price_vnd, row.declared_tax_price,
      row.domestic_shipping_cost, row.international_shipping_cost, row.shipping_allocation_rule,
      row.vat_percent, row.vat_amount, row.import_tax_amount, row.other_fee, row.allocated_shipping_per_unit,
      row.allocated_tax_per_unit, row.allocated_other_fee_per_unit, row.total_batch_cost,
      row.landed_cost_per_unit, row.row_index, row.forwarder_name, row.container_or_waybill_no, row.customs_declaration_no,
      row.customs_declaration_date, row.invoice_no, row.link_nhap_hang, row.cong_dung, row.chat_lieu,
      row.source, formula, rawPayload, row.note
    ).run()
    const itemId = Number(insertedItem?.meta?.last_row_id || 0)
    await env.DB.prepare(`
      INSERT INTO inventory_cost_layers (
        sku_id, purchase_batch_item_id, purchase_batch_id, import_date, quantity_imported, quantity_consumed,
        quantity_remaining, landed_cost_per_unit, layer_status, source
      ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, 'warehouse_purchase_core')
    `).bind(
      row.sku_id,
      itemId,
      batchId,
      row.import_date,
      row.quantity_imported,
      row.quantity_remaining,
      row.landed_cost_per_unit,
      row.quantity_remaining > 0 ? 'active' : 'depleted'
    ).run()
    const currentCost = await recalculateSkuCurrentCost(env, row.sku_id)
    inserted.push({
      purchase_batch_id: batchId,
      purchase_batch_item_id: itemId,
      sku_id: row.sku_id,
      current_cost_readback: currentCost
    })
  }
  const batchReadback = await refreshPurchaseBatchTotals(env, batchId)
  return {
    ok: true,
    status: 'confirmed',
    import_batch_id: batchId,
    batch_code: batchCode,
    inserted_count: inserted.length,
    blocked_count: preview.blocked_count,
    batch_readback: batchReadback,
    inserted,
    blocked_rows: preview.rows.filter(row => row.status === 'blocked')
  }
}

async function loadCostReadModelMap(env) {
  await ensurePurchaseCoreTables(env)
  const { results } = await env.DB.prepare(`SELECT * FROM sku_current_cost_read_model`).all()
  return new Map((results || []).map(row => [cleanText(row.sku_id), row]))
}

async function loadLatestPurchaseMap(env) {
  await ensurePurchaseCoreTables(env)
  const { results } = await env.DB.prepare(`
    SELECT *
    FROM purchase_batch_items
    ORDER BY datetime(COALESCE(NULLIF(import_date, ''), '1970-01-01')) DESC, id DESC
  `).all()
  const map = new Map()
  for (const row of results || []) {
    const sku = cleanText(row.sku_id)
    if (sku && !map.has(sku)) map.set(sku, row)
  }
  return map
}

async function loadLogisticsProfileMap(env) {
  await ensurePurchaseCoreTables(env)
  const { results } = await env.DB.prepare(`SELECT * FROM product_logistics_profiles`).all()
  return new Map((results || []).map(row => [cleanText(row.sku_id), row]))
}

export async function listPurchaseReadModel(env, filters = {}) {
  await ensurePurchaseCoreTables(env)
  const query = lowerText(filters.search)
  const platform = lowerText(filters.platform)
  const limit = Math.min(Math.max(Number(filters.limit || 200) || 200, 1), 500)
  const hasVariations = await tableExists(env, 'product_variations')
  const hasProducts = await tableExists(env, 'products')
  const products = []

  if (hasVariations) {
    const where = []
    const params = []
    if (platform) {
      where.push(`LOWER(COALESCE(v.platform, '')) = ?`)
      params.push(platform)
    }
    if (query) {
      where.push(`(
        LOWER(COALESCE(v.internal_sku, '')) LIKE ?
        OR LOWER(COALESCE(v.platform_sku, '')) LIKE ?
        OR LOWER(COALESCE(v.product_name, '')) LIKE ?
        OR LOWER(COALESCE(v.variation_name, '')) LIKE ?
      )`)
      params.push(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`)
    }
    const { results } = await env.DB.prepare(`
      SELECT
        COALESCE(NULLIF(v.internal_sku, ''), v.platform_sku) AS sku_id,
        COALESCE(NULLIF(v.internal_sku, ''), v.platform_sku) AS internal_sku,
        v.platform_sku AS seller_sku,
        v.platform_item_id AS product_id,
        v.product_name AS product_name,
        v.variation_name,
        v.image_url AS image_url,
        '' AS category,
        '' AS shop_key,
        v.platform,
        'active' AS product_status,
        COALESCE(v.stock, 0) AS product_stock,
        NULL AS reference_cost,
        '' AS updated_at
      FROM product_variations v
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY product_name COLLATE NOCASE
      LIMIT ?
    `).bind(...params, limit).all()
    products.push(...(results || []))
  } else if (hasProducts) {
    const where = []
    const params = []
    if (query) {
      where.push(`LOWER(COALESCE(product_name, '') || ' ' || COALESCE(sku, '')) LIKE ?`)
      params.push(`%${query}%`)
    }
    const { results } = await env.DB.prepare(`
      SELECT sku AS sku_id, sku AS internal_sku, sku AS seller_sku, sku AS product_id,
             product_name, '' AS variation_name, image_url, '' AS category, '' AS shop_key,
             '' AS platform, 'active' AS product_status, stock AS product_stock,
             COALESCE(cost_real, cost_invoice, NULL) AS reference_cost, updated_at
      FROM products
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY product_name COLLATE NOCASE
      LIMIT ?
    `).bind(...params, limit).all()
    products.push(...(results || []))
  }

  const productMap = new Map()
  for (const product of products) {
    const sku = cleanText(product.sku_id || product.internal_sku)
    if (!sku) continue
    if (!productMap.has(sku)) {
      productMap.set(sku, {
        ...product,
        sku_id: sku,
        internal_sku: cleanText(product.internal_sku || sku),
        seller_skus: cleanText(product.seller_sku) ? [cleanText(product.seller_sku)] : [],
        platforms: cleanText(product.platform) ? [cleanText(product.platform)] : []
      })
    } else {
      const existing = productMap.get(sku)
      const sellerSku = cleanText(product.seller_sku)
      const platformName = cleanText(product.platform)
      if (sellerSku && !existing.seller_skus.includes(sellerSku)) existing.seller_skus.push(sellerSku)
      if (platformName && !existing.platforms.includes(platformName)) existing.platforms.push(platformName)
      if (!existing.image_url && product.image_url) existing.image_url = product.image_url
      if (!existing.variation_name && product.variation_name) existing.variation_name = product.variation_name
    }
  }

  const costMap = await loadCostReadModelMap(env)
  const latestMap = await loadLatestPurchaseMap(env)
  const profileMap = await loadLogisticsProfileMap(env)
  const rows = [...productMap.values()].map(product => {
    const sku = cleanText(product.sku_id)
    const cost = costMap.get(sku)
    const latest = latestMap.get(sku)
    const profile = profileMap.get(sku)
    const currentCost = numberOrNull(cost?.current_cost)
    const purchaseHistoryStatus = latest ? 'has_purchase_history' : 'no_purchase_history'
    const costStatus = cleanText(cost?.cost_status) || (latest ? 'cost_missing' : 'missing')
    const logisticsStatus = cleanText(profile?.logistics_profile_status || 'missing')
    return {
      ...product,
      sku_id: sku,
      shop_key: '',
      platform: (product.platforms || []).join(', '),
      seller_sku: (product.seller_skus || []).join(', '),
      purchase_history_status: purchaseHistoryStatus,
      current_cost_status: costStatus,
      logistics_profile_status: logisticsStatus,
      logistics_profile: profile || null,
      package_weight_kg: numberOrNull(profile?.package_weight_kg),
      package_length_cm: numberOrNull(profile?.package_length_cm),
      package_width_cm: numberOrNull(profile?.package_width_cm),
      package_height_cm: numberOrNull(profile?.package_height_cm),
      package_volume_m3: numberOrNull(profile?.package_volume_m3),
      default_quantity_per_package: numberOrNull(profile?.default_quantity_per_package),
      shipping_calculation_method: cleanText(profile?.shipping_calculation_method),
      current_cost: currentCost,
      current_cost_method: cleanText(cost?.current_cost_method || 'weighted_average_remaining_stock'),
      total_remaining_stock: numberValue(cost?.total_remaining_stock, 0),
      batch_count: Number(cost?.batch_count || 0),
      latest_import_date: cleanText(cost?.latest_import_date || latest?.import_date),
      latest_purchase_batch_id: cleanText(latest?.purchase_batch_id),
      purchase_tracking_number: cleanText(latest?.purchase_tracking_number),
      supplier_name: cleanText(latest?.supplier_name),
      latest_quantity_imported: numberOrNull(latest?.quantity_imported),
      latest_landed_cost_per_unit: numberOrNull(cost?.latest_landed_cost_per_unit ?? latest?.landed_cost_per_unit),
      latest_total_batch_cost: numberOrNull(latest?.total_batch_cost),
      reference_cost: numberOrNull(cost?.reference_cost ?? product.reference_cost),
      status: purchaseHistoryStatus === 'no_purchase_history'
        ? 'no_purchase_history'
        : (numberValue(cost?.total_remaining_stock, 0) <= 0 ? 'out_of_stock' : 'cost_ready')
    }
  }).filter(row => {
    if (filters.cost_status && row.current_cost_status !== filters.cost_status) return false
    if (filters.logistics_status && row.logistics_profile_status !== filters.logistics_status) return false
    if (filters.stock_status === 'has_stock' && !(row.total_remaining_stock > 0 || numberValue(row.product_stock, 0) > 0)) return false
    if (filters.stock_status === 'out_of_stock' && (row.total_remaining_stock > 0 || numberValue(row.product_stock, 0) > 0)) return false
    return true
  })

  const withHistory = rows.filter(row => row.purchase_history_status === 'has_purchase_history').length
  const totalValue30d = await env.DB.prepare(`
    SELECT COALESCE(SUM(total_batch_cost), 0) AS total
    FROM purchase_batch_items
    WHERE date(import_date) >= date('now', '-30 day')
  `).first().catch(() => ({ total: 0 }))
  const latestImport = await env.DB.prepare(`
    SELECT MAX(import_date) AS latest_import_date
    FROM purchase_batch_items
  `).first().catch(() => ({ latest_import_date: '' }))
  const totalRemainingValue = rows.reduce((sum, row) => sum + numberValue(row.current_cost, 0) * numberValue(row.total_remaining_stock, 0), 0)
  const totalRemainingStock = rows.reduce((sum, row) => sum + numberValue(row.total_remaining_stock, 0), 0)

  return {
    ok: true,
    source: 'warehouse_purchase_core',
    current_cost_method: 'weighted_average_remaining_stock',
    summary: {
      total_product_core: rows.length,
      sku_with_purchase_history: withHistory,
      sku_without_purchase_history: rows.length - withHistory,
      latest_import_date: cleanText(latestImport?.latest_import_date),
      total_import_value_30d: numberValue(totalValue30d?.total, 0),
      average_current_cost: totalRemainingStock > 0 ? totalRemainingValue / totalRemainingStock : null
    },
    products: rows
  }
}

export async function getPurchaseHistoryBySku(env, skuId) {
  const sku = cleanText(skuId)
  await ensurePurchaseCoreTables(env)
  const { results: history } = await env.DB.prepare(`
    SELECT *
    FROM purchase_batch_items
    WHERE sku_id = ? OR internal_sku = ? OR seller_sku = ?
    ORDER BY date(import_date) DESC, id DESC
    LIMIT 100
  `).bind(sku, sku, sku).all()
  const { results: layers } = await env.DB.prepare(`
    SELECT *
    FROM inventory_cost_layers
    WHERE sku_id = ?
    ORDER BY date(import_date) DESC, id DESC
    LIMIT 100
  `).bind(sku).all()
  const currentCost = await env.DB.prepare(`
    SELECT *
    FROM sku_current_cost_read_model
    WHERE sku_id = ?
    LIMIT 1
  `).bind(sku).first()
  const profile = await getLogisticsProfileBySku(env, sku)
  const { results: revisions } = await env.DB.prepare(`
    SELECT *
    FROM purchase_batch_revisions
    WHERE sku_id = ?
    ORDER BY datetime(edited_at) DESC
    LIMIT 100
  `).bind(sku).all()
  return {
    ok: true,
    sku_id: sku,
    history: history || [],
    cost_layers: layers || [],
    current_cost: currentCost || null,
    logistics_profile: profile || null,
    revisions: revisions || [],
    source: 'warehouse_purchase_core'
  }
}

export async function listImportBatches(env, filters = {}) {
  await ensurePurchaseCoreTables(env)
  const limit = Math.min(Math.max(Number(filters.limit || 100) || 100, 1), 500)
  const where = []
  const params = []
  const search = lowerText(filters.search)
  if (search) {
    where.push(`LOWER(batch_code || ' ' || supplier_name || ' ' || forwarder_name || ' ' || purchase_tracking_number) LIKE ?`)
    params.push(`%${search}%`)
  }
  const { results } = await env.DB.prepare(`
    SELECT
      b.*,
      COALESCE(NULLIF(b.total_package_count, 0), a.total_package_count, 0) AS total_package_count,
      COALESCE(NULLIF(b.total_quantity, 0), a.total_quantity, 0) AS total_quantity,
      COALESCE(NULLIF(b.total_weight_kg, 0), a.total_weight_kg, 0) AS total_weight_kg,
      COALESCE(NULLIF(b.total_volume_m3, 0), a.total_volume_m3, 0) AS total_volume_m3,
      COALESCE(NULLIF(b.total_purchase_value, 0), a.total_purchase_value, 0) AS total_purchase_value,
      COALESCE(NULLIF(b.total_declared_value, 0), a.total_declared_value, 0) AS total_declared_value,
      COALESCE(NULLIF(b.total_shipping_fee, 0), a.total_shipping_fee, 0) AS total_shipping_fee,
      COALESCE(NULLIF(b.total_tax, 0), a.total_tax, 0) AS total_tax,
      COALESCE(NULLIF(b.total_landed_cost, 0), a.total_landed_cost, 0) AS total_landed_cost
    FROM purchase_batches b
    LEFT JOIN (
      SELECT
        purchase_batch_id,
        COALESCE(SUM(package_count), 0) AS total_package_count,
        COALESCE(SUM(quantity_imported), 0) AS total_quantity,
        COALESCE(SUM(total_weight_kg), 0) AS total_weight_kg,
        COALESCE(SUM(total_volume_m3), 0) AS total_volume_m3,
        COALESCE(SUM(quantity_imported * unit_purchase_price_vnd), 0) AS total_purchase_value,
        COALESCE(SUM(quantity_imported * declared_tax_price), 0) AS total_declared_value,
        COALESCE(SUM(quantity_imported * allocated_shipping_per_unit), 0) AS total_shipping_fee,
        COALESCE(SUM(quantity_imported * allocated_tax_per_unit), 0) AS total_tax,
        COALESCE(SUM(total_batch_cost), 0) AS total_landed_cost
      FROM purchase_batch_items
      GROUP BY purchase_batch_id
    ) a ON a.purchase_batch_id = b.purchase_batch_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY date(b.import_date) DESC, b.updated_at DESC
    LIMIT ?
  `).bind(...params, limit).all()
  return { ok: true, batches: results || [], source: 'warehouse_purchase_core' }
}

export async function getImportBatchDetail(env, batchId) {
  const id = cleanText(batchId)
  await ensurePurchaseCoreTables(env)
  const batch = await env.DB.prepare(`SELECT * FROM purchase_batches WHERE purchase_batch_id = ? OR import_batch_id = ? OR batch_code = ? LIMIT 1`).bind(id, id, id).first()
  if (!batch) return { ok: false, error: 'import_batch_not_found' }
  const { results: items } = await env.DB.prepare(`
    SELECT *
    FROM purchase_batch_items
    WHERE purchase_batch_id = ?
    ORDER BY line_no ASC, id ASC
  `).bind(batch.purchase_batch_id).all()
  const aggregate = (items || []).reduce((sum, item) => {
    sum.total_package_count += numberValue(item.package_count, 0)
    sum.total_quantity += numberValue(item.quantity_imported, 0)
    sum.total_weight_kg += numberValue(item.total_weight_kg, 0)
    sum.total_volume_m3 += numberValue(item.total_volume_m3, 0)
    sum.total_purchase_value += numberValue(item.quantity_imported, 0) * numberValue(item.unit_purchase_price_vnd, 0)
    sum.total_declared_value += numberValue(item.quantity_imported, 0) * numberValue(item.declared_tax_price, 0)
    sum.total_shipping_fee += numberValue(item.quantity_imported, 0) * numberValue(item.allocated_shipping_per_unit, 0)
    sum.total_tax += numberValue(item.quantity_imported, 0) * numberValue(item.allocated_tax_per_unit, 0)
    sum.total_landed_cost += numberValue(item.total_batch_cost, 0)
    return sum
  }, {
    total_package_count: 0,
    total_quantity: 0,
    total_weight_kg: 0,
    total_volume_m3: 0,
    total_purchase_value: 0,
    total_declared_value: 0,
    total_shipping_fee: 0,
    total_tax: 0,
    total_landed_cost: 0
  })
  const batchReadModel = {
    ...batch,
    total_package_count: numberValue(batch.total_package_count, 0) || aggregate.total_package_count,
    total_quantity: numberValue(batch.total_quantity, 0) || aggregate.total_quantity,
    total_weight_kg: numberValue(batch.total_weight_kg, 0) || aggregate.total_weight_kg,
    total_volume_m3: numberValue(batch.total_volume_m3, 0) || aggregate.total_volume_m3,
    total_purchase_value: numberValue(batch.total_purchase_value, 0) || aggregate.total_purchase_value,
    total_declared_value: numberValue(batch.total_declared_value, 0) || aggregate.total_declared_value,
    total_shipping_fee: numberValue(batch.total_shipping_fee, 0) || aggregate.total_shipping_fee,
    total_tax: numberValue(batch.total_tax, 0) || aggregate.total_tax,
    total_landed_cost: numberValue(batch.total_landed_cost, 0) || aggregate.total_landed_cost
  }
  const { results: revisions } = await env.DB.prepare(`
    SELECT *
    FROM purchase_batch_revisions
    WHERE purchase_batch_id = ?
    ORDER BY datetime(edited_at) DESC
    LIMIT 100
  `).bind(batch.purchase_batch_id).all()
  return { ok: true, batch: batchReadModel, items: items || [], revisions: revisions || [], source: 'warehouse_purchase_core' }
}

export async function getPurchaseBatchRevisions(env, itemIdOrBatchId) {
  const id = cleanText(itemIdOrBatchId)
  await ensurePurchaseCoreTables(env)
  const { results } = await env.DB.prepare(`
    SELECT *
    FROM purchase_batch_revisions
    WHERE purchase_batch_id = ? OR CAST(purchase_batch_item_id AS TEXT) = ?
    ORDER BY datetime(edited_at) DESC
    LIMIT 100
  `).bind(id, id).all()
  return { ok: true, revisions: results || [], source: 'warehouse_purchase_core' }
}

export async function editPurchaseBatchItem(env, itemId, patch = {}, user = {}) {
  const id = Number(itemId)
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: 'invalid_purchase_batch_item_id' }
  const editReason = cleanText(patch.edit_reason)
  if (!editReason) return { ok: false, error: 'missing_edit_reason' }
  await ensurePurchaseCoreTables(env)
  const before = await env.DB.prepare(`SELECT * FROM purchase_batch_items WHERE id = ? LIMIT 1`).bind(id).first()
  if (!before) return { ok: false, error: 'purchase_batch_item_not_found' }
  if (patch.sku_id && cleanText(patch.sku_id) !== cleanText(before.sku_id)) {
    return { ok: false, error: 'sku_change_not_allowed' }
  }
  const product = await findProductCoreBySku(env, before.sku_id)
  const settings = await getPurchaseSettings(env)
  const editable = {
    ...before,
    ...patch,
    sku_id: before.sku_id,
    internal_sku: before.internal_sku,
    seller_sku: before.seller_sku,
    product_id: before.product_id,
    product_name: before.product_name
  }
  const blockReason = blockReasonForRow(editable, product)
  if (blockReason) return { ok: false, error: blockReason }
  const after = calculatePurchaseCost(editable, product, settings)
  const fieldChanges = changedFields(before, after).filter(field => !['updated_at', 'formula_snapshot', 'raw_payload'].includes(field))
  const editor = cleanText(user?.email || user?.username || user?.role || 'admin')
  await env.DB.prepare(`
    UPDATE purchase_batch_items
    SET import_date = ?, supplier_name = ?, purchase_tracking_number = ?, quantity_imported = ?,
        package_count = ?, quantity_per_package = ?, quantity_remaining = ?,
        package_length_cm = ?, package_width_cm = ?, package_height_cm = ?, package_weight_kg = ?,
        package_volume_m3 = ?, total_weight_kg = ?, total_volume_m3 = ?, shipping_calculation_method = ?,
        currency = ?, exchange_rate = ?, unit_purchase_price_foreign = ?, unit_purchase_price_vnd = ?,
        declared_tax_price = ?, domestic_shipping_cost = ?, international_shipping_cost = ?, shipping_allocation_rule = ?,
        vat_percent = ?, vat_amount = ?, import_tax_amount = ?, other_fee = ?,
        allocated_shipping_per_unit = ?, allocated_tax_per_unit = ?, allocated_other_fee_per_unit = ?,
        total_batch_cost = ?, landed_cost_per_unit = ?, formula_snapshot = ?, note = ?,
        last_edited_by = ?, last_edited_at = datetime('now', '+7 hours'), last_edit_reason = ?,
        last_changed_fields = ?, updated_at = datetime('now', '+7 hours')
    WHERE id = ?
  `).bind(
    after.import_date, after.supplier_name, after.purchase_tracking_number, after.quantity_imported,
    after.package_count, after.quantity_per_package, after.quantity_remaining,
    after.package_length_cm, after.package_width_cm, after.package_height_cm, after.package_weight_kg,
    after.package_volume_m3, after.total_weight_kg, after.total_volume_m3, after.shipping_calculation_method,
    after.currency, after.exchange_rate, after.unit_purchase_price_foreign, after.unit_purchase_price_vnd,
    after.declared_tax_price, after.domestic_shipping_cost, after.international_shipping_cost, after.shipping_allocation_rule,
    after.vat_percent, after.vat_amount, after.import_tax_amount, after.other_fee,
    after.allocated_shipping_per_unit, after.allocated_tax_per_unit, after.allocated_other_fee_per_unit,
    after.total_batch_cost, after.landed_cost_per_unit, JSON.stringify(after.formula_snapshot || {}), after.note,
    editor, editReason, JSON.stringify(fieldChanges), id
  ).run()
  await env.DB.prepare(`
    UPDATE inventory_cost_layers
    SET import_date = ?, quantity_imported = ?, quantity_remaining = ?,
        landed_cost_per_unit = ?, layer_status = ?, updated_at = datetime('now', '+7 hours')
    WHERE purchase_batch_item_id = ? OR (purchase_batch_id = ? AND sku_id = ?)
  `).bind(
    after.import_date,
    after.quantity_imported,
    after.quantity_remaining,
    after.landed_cost_per_unit,
    after.quantity_remaining > 0 ? 'active' : 'depleted',
    id,
    before.purchase_batch_id,
    before.sku_id
  ).run()
  await env.DB.prepare(`
    INSERT INTO purchase_batch_revisions (
      revision_id, purchase_batch_id, purchase_batch_item_id, sku_id,
      before_payload, after_payload, changed_fields, edited_by, edit_reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    before.purchase_batch_id,
    id,
    before.sku_id,
    JSON.stringify(before),
    JSON.stringify(after),
    JSON.stringify(fieldChanges),
    editor,
    editReason
  ).run()
  const batchReadback = await refreshPurchaseBatchTotals(env, before.purchase_batch_id)
  const currentCost = await recalculateSkuCurrentCost(env, before.sku_id)
  return {
    ok: true,
    status: 'edited',
    purchase_batch_id: before.purchase_batch_id,
    purchase_batch_item_id: id,
    changed_fields: fieldChanges,
    batch_readback: batchReadback,
    current_cost_readback: currentCost,
    revision_history: await getPurchaseBatchRevisions(env, String(id))
  }
}

export function purchaseExportRows(products = []) {
  return (products || []).map(row => ({
    product_name: row.product_name,
    sku: row.internal_sku || row.sku_id,
    import_date: row.latest_import_date,
    purchase_batch_id: row.latest_purchase_batch_id || '',
    purchase_tracking_number: row.purchase_tracking_number || '',
    quantity_imported: row.latest_quantity_imported,
    quantity_remaining: row.total_remaining_stock,
    landed_cost_per_unit: row.latest_landed_cost_per_unit,
    current_cost: row.current_cost,
    package_weight_kg: row.package_weight_kg,
    package_length_cm: row.package_length_cm,
    package_width_cm: row.package_width_cm,
    package_height_cm: row.package_height_cm,
    shipping_calculation_method: row.shipping_calculation_method,
    total_batch_cost: row.latest_total_batch_cost,
    supplier_name: row.supplier_name || '',
    source: 'warehouse_purchase_core',
    image_url: row.image_url
  }))
}
