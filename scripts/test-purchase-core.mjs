import assert from 'node:assert/strict'
import {
  calculatePurchaseCost,
  calculateWeightedAverageCurrentCost,
  normalizePurchaseInput
} from '../apps/worker-api/src/core/purchase/purchase-core.js'

const product = {
  sku_id: 'SKU-A',
  internal_sku: 'SKU-A',
  product_id: 'P-A',
  product_name: 'Sản phẩm A'
}

const missingDate = normalizePurchaseInput({ ma_hang: 'SKU-A', sl_nhap: 1, so_kien: 1, sl_sp_tren_kien: 1, package_weight_kg: 1, gia_nhap_te: 10 })
assert.equal(missingDate.import_date, '', 'Excel thiếu ngày nhập phải giữ rỗng để backend block missing_import_date')

const calculated = calculatePurchaseCost({
  ma_hang: 'SKU-A',
  ngay_nhap_hang: '2026-05-24',
  sl_nhap: 10,
  so_kien: 2,
  sl_sp_tren_kien: 5,
  package_weight_kg: 3,
  package_length_cm: 40,
  package_width_cm: 30,
  package_height_cm: 20,
  shipping_calculation_method: 'by_weight',
  gia_nhap_te: 2,
  exchange_rate: 3500,
  ship_noi_dia_te: 1,
  gia_khai_thue: 7000,
  thue_vat_percent: 10,
  other_fee: 5000
}, product, { phi_vanchuyen_kg: 2500 })

assert.equal(calculated.unit_purchase_price_vnd, 7000, 'Giá nhập tệ nhân tỉ giá phải thành giá mua VND')
assert.equal(calculated.vat_amount, 7000, 'VAT tính theo giá khai thuế * % * số lượng')
assert.equal(Math.round(calculated.landed_cost_per_unit), 10050, 'Giá vốn lô tính ở Core, không ở UI')
assert.equal(calculated.formula_snapshot.shipping_calculation_method, 'by_weight', 'Formula snapshot phải giữ cách tính vận chuyển')
assert.equal(calculated.formula_snapshot.total_weight_kg, 6, 'by_weight tính theo tổng kg')
assert.equal(calculated.formula_snapshot.shipping_total, 18500, 'Phí ship theo kg cộng ship nội địa quy đổi từ Core settings')

const byVolume = calculatePurchaseCost({
  ma_hang: 'SKU-A',
  ngay_nhap_hang: '2026-05-24',
  sl_nhap: 10,
  so_kien: 2,
  sl_sp_tren_kien: 5,
  package_length_cm: 100,
  package_width_cm: 50,
  package_height_cm: 40,
  package_weight_kg: 1,
  shipping_calculation_method: 'by_volume',
  unit_purchase_price_vnd: 10000
}, product, { phi_vanchuyen_khoi: 1000000 })
assert.equal(byVolume.formula_snapshot.total_volume_m3, 0.4, 'by_volume tính tổng khối theo số kiện')
assert.equal(byVolume.formula_snapshot.shipping_total, 400000, 'by_volume nhân tổng khối với phí khối')

const greater = calculatePurchaseCost({
  ma_hang: 'SKU-A',
  ngay_nhap_hang: '2026-05-24',
  sl_nhap: 10,
  so_kien: 2,
  sl_sp_tren_kien: 5,
  package_length_cm: 100,
  package_width_cm: 50,
  package_height_cm: 40,
  package_weight_kg: 5,
  shipping_calculation_method: 'greater_of_weight_or_volume',
  unit_purchase_price_vnd: 10000
}, product, { phi_vanchuyen_kg: 1000, volumetric_factor: 200 })
assert.equal(greater.formula_snapshot.shipping_basis, 80, 'greater_of_weight_or_volume dùng max cân thật và cân quy đổi')

const weighted = calculateWeightedAverageCurrentCost([
  { quantity_remaining: 4, landed_cost_per_unit: 10000 },
  { quantity_remaining: 6, landed_cost_per_unit: 20000 },
  { quantity_remaining: 0, landed_cost_per_unit: 90000 }
])
assert.equal(weighted.current_cost, 16000, 'current_cost phải weighted average theo tồn còn lại')
assert.equal(weighted.current_cost_method, 'weighted_average_remaining_stock')
assert.equal(weighted.batch_count, 2)

const empty = calculateWeightedAverageCurrentCost([
  { quantity_remaining: 0, landed_cost_per_unit: 10000 }
])
assert.equal(empty.current_cost, null, 'Hết tồn thì current_cost là null, không ép về 0')
assert.equal(empty.cost_status, 'cost_missing')

console.log('purchase-core regression passed')
