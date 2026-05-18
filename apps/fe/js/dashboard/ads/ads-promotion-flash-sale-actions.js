function renderFlashSaleCreateForm() {
  return `
    <div class="ads-promotion-live-form">
      <b>Cài Flash Sale theo timeslot Shopee</b>
      <label>Giờ bật <input id="flashSaleStartInput" type="datetime-local"></label>
      <label>Giờ tắt <input id="flashSaleEndInput" type="datetime-local"></label>
      <label>Payload Flash Sale JSON <textarea id="flashSalePayloadInput" placeholder='{"timeslot_id":123456,"item_list":[{"item_id":123,"model_list":[{"model_id":456,"input_promotion_price":69000,"campaign_stock":10,"purchase_limit":1}]}]}'></textarea></label>
      <small>API Shopee yêu cầu timeslot_id lấy từ /api/v2/shop_flash_sale/get_time_slot_id; giờ bật/tắt chỉ dùng để đối chiếu, không thay thế timeslot_id.</small>
      <div class="ads-promotion-browser-actions">
        <button type="button" onclick="runFlashSaleCreateFromForm(false)">Kiểm tra payload Flash Sale</button>
        <button type="button" class="danger" disabled title="Chỉ mở sau khi diagnostics Flash Sale PASS và có timeslot_id thật.">Tạo thật bị khóa</button>
      </div>
    </div>
  `
}

window.runFlashSaleCreateFromForm = async function(execute) {
  const start = Date.parse(adsEl('flashSaleStartInput')?.value || '')
  const end = Date.parse(adsEl('flashSaleEndInput')?.value || '')
  if (!start || !end || end <= start) {
    adsShowToast('Cần nhập giờ bật/tắt Flash Sale hợp lệ.', 'error')
    return
  }
  let payload = {}
  try {
    payload = JSON.parse(adsEl('flashSalePayloadInput')?.value || '{}')
  } catch {
    adsShowToast('Payload JSON Flash Sale chưa hợp lệ.', 'error')
    return
  }
  if (!payload.timeslot_id) {
    adsShowToast('Shopee create_shop_flash_sale cần timeslot_id thật từ get_time_slot_id. Không gửi start/end tự nhập thay cho timeslot_id.', 'error')
    return
  }
  payload.start_time = Math.floor(start / 1000)
  payload.end_time = Math.floor(end / 1000)
  const row = { platform: 'shopee', module: 'shop_flash_sale', shop: adsEl('adsShop')?.value || '' }
  if (!row.shop) {
    adsShowToast('Chọn đúng shop Shopee ở bộ lọc trên cùng trước khi tạo Flash Sale.', 'error')
    return
  }
  if (execute) {
    const ok = await adsConfirmShopeeAction({
      title: 'Xác nhận tạo Flash Sale',
      message: 'Shopee yêu cầu timeslot_id thật từ get_time_slot_id. Hệ thống sẽ refetch danh sách Flash Sale sau khi gửi.',
      danger: true,
      confirmText: 'Gửi thật lên Shopee',
      shop: row.shop,
      endpoint: '/api/v2/shop_flash_sale/create_shop_flash_sale',
      objectId: payload.timeslot_id
    })
    if (!ok) return
  }
  try {
    const data = await postShopeePromotionLive(row, 'programs', 'add', execute, payload)
    const box = adsEl('promotionPreviewBox') || adsEl('promotionUpdateStatus')
    adsSetApiResult(box, data, { action: 'add', title: execute ? 'Kết quả tạo Flash Sale' : 'Kiểm tra payload tạo Flash Sale' })
    if (execute && adsActionOk(data)) await loadPromotionBrowserList()
  } catch (error) {
    adsShowToast(`Không tạo được Flash Sale: ${error.message}`, 'error')
  }
}
