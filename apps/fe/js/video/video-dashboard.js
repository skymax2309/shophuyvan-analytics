import { createMultiShopProductPicker } from './multi-shop/product-picker.js'

window.createMultiShopProductPicker = createMultiShopProductPicker

const VIDEO_DASHBOARD_CHUNKS = [
  './video/dashboard/foundation-utils.js',
  './video/dashboard/multi-shop-state.js',
  './video/dashboard/shop-lazada-panel.js',
  './video/dashboard/overview-library-render.js',
  './video/dashboard/detail-upload-helpers.js',
  './video/dashboard/upload-form.js',
  './video/dashboard/multi-shop-render.js',
  './video/dashboard/catalog-actions.js',
  './video/dashboard/queue-browser-actions.js',
  './video/dashboard/packing-events-init.js'
]
const VIDEO_DASHBOARD_CHUNK_VERSION = 'video-tab-init-20260513a'

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
