import { createMultiShopProductPicker } from './multi-shop/product-picker.js'

window.createMultiShopProductPicker = createMultiShopProductPicker

const VIDEO_DASHBOARD_CHUNKS = [
  './dashboard/foundation-utils.js',
  './dashboard/multi-shop-state.js',
  './dashboard/shop-lazada-panel.js',
  './dashboard/overview-library-render.js',
  './dashboard/detail-upload-helpers.js',
  './dashboard/upload-form.js',
  './dashboard/multi-shop-render.js',
  './dashboard/catalog-actions.js',
  './dashboard/queue-browser-actions.js',
  './dashboard/packing-events-init.js'
]
const VIDEO_DASHBOARD_CHUNK_VERSION = 'video-tab-init-20260531b'

function loadClassicChunk(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = new URL(`${src}?v=${VIDEO_DASHBOARD_CHUNK_VERSION}`, import.meta.url).href
    script.async = false
    script.onload = resolve
    script.onerror = () => reject(new Error('Không tải được module video: ' + src))
    document.head.appendChild(script)
  })
}

// NEO: Loader video giữ thứ tự script legacy sau khi đã tách file; tránh làm mất state/hàm global của dashboard đang vận hành.
for (const chunk of VIDEO_DASHBOARD_CHUNKS) {
  await loadClassicChunk(chunk)
}
