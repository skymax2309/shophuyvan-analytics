import { ensureShopeeVideoAuthColumns } from '../../core/shops/shopee-video-auth-core.js'
import { ensureVideoAnalyticsTables } from '../../core/video/analytics-core.js'
import { handleVideoTitleSuggestions } from './campaign-title.js'
import { handleVideoMultiShopPreview, handleVideoMultiShopQueue, handleVideoUploadQueueBrowserStatus, handleVideoUploadQueueCancel, handleVideoUploadQueueCreate, handleVideoUploadQueueFile, handleVideoUploadQueueList, handleVideoUploadQueueRun } from './multi-queue-run.js'
import { handleLazadaImageUpload, handleLazadaVideoDetail, handleLazadaVideoQuota, handleLazadaVideoRemove, handleLazadaVideoUpload, handleShopeeMediaEndpoints, handleShopeeMediaSpaceImageUpload, handleShopeeMediaSpaceVideoUpload, handleVideoCapabilities, handleVideoCatalogItems, handleVideoCoverList, handleVideoDashboard, handleVideoDetail, handleVideoLibrary, handleVideoPermissionTest, handleVideoSync } from './read-handlers.js'
import { json } from './shared-base.js'
import { handleVideoDelete, handleVideoEdit, handleVideoUpload } from './write-handlers.js'

export async function handleVideo(request, env, cors) {
  await ensureVideoAnalyticsTables(env)
  await ensureShopeeVideoAuthColumns(env)
  const url = new URL(request.url)

  if (request.method === 'GET' && url.pathname.endsWith('/video/capabilities')) {
    return handleVideoCapabilities(env, cors)
  }
  if (request.method === 'GET' && url.pathname.endsWith('/video/dashboard')) {
    return handleVideoDashboard(request, env, cors)
  }
  if (request.method === 'POST' && url.pathname.endsWith('/video/sync')) {
    return handleVideoSync(request, env, cors)
  }
  if (request.method === 'GET' && url.pathname.endsWith('/video/library')) {
    return handleVideoLibrary(request, env, cors)
  }
  if (request.method === 'GET' && url.pathname.endsWith('/video/shopee/media-endpoints')) {
    return handleShopeeMediaEndpoints(request, env, cors)
  }
  if (request.method === 'POST' && url.pathname.endsWith('/video/shopee/media-space/image-upload')) {
    return handleShopeeMediaSpaceImageUpload(request, env, cors)
  }
  if (request.method === 'POST' && url.pathname.endsWith('/video/shopee/media-space/upload')) {
    return handleShopeeMediaSpaceVideoUpload(request, env, cors)
  }
  if (request.method === 'GET' && url.pathname.endsWith('/video/lazada/quota')) {
    return handleLazadaVideoQuota(request, env, cors)
  }
  if (request.method === 'GET' && url.pathname.endsWith('/video/lazada/detail')) {
    return handleLazadaVideoDetail(request, env, cors)
  }
  if (request.method === 'POST' && url.pathname.endsWith('/video/lazada/image-upload')) {
    return handleLazadaImageUpload(request, env, cors)
  }
  if (request.method === 'POST' && url.pathname.endsWith('/video/lazada/upload')) {
    return handleLazadaVideoUpload(request, env, cors)
  }
  if (request.method === 'POST' && url.pathname.endsWith('/video/lazada/remove')) {
    return handleLazadaVideoRemove(request, env, cors)
  }
  if (request.method === 'GET' && url.pathname.endsWith('/video/detail')) {
    return handleVideoDetail(request, env, cors)
  }
  if (request.method === 'GET' && url.pathname.endsWith('/video/covers')) {
    return handleVideoCoverList(request, env, cors)
  }
  if (request.method === 'GET' && url.pathname.endsWith('/video/catalog-items')) {
    return handleVideoCatalogItems(request, env, cors)
  }
  if (request.method === 'POST' && url.pathname.endsWith('/video/title-suggestions')) {
    return handleVideoTitleSuggestions(request, env, cors)
  }
  if (request.method === 'POST' && url.pathname.endsWith('/video/test-permission')) {
    return handleVideoPermissionTest(request, env, cors)
  }
  if (request.method === 'POST' && url.pathname.endsWith('/video/edit')) {
    return handleVideoEdit(request, env, cors)
  }
  if (request.method === 'POST' && url.pathname.endsWith('/video/delete')) {
    return handleVideoDelete(request, env, cors)
  }
  if (request.method === 'POST' && url.pathname.endsWith('/video/multi-shop/preview')) {
    return handleVideoMultiShopPreview(request, env, cors)
  }
  if (request.method === 'POST' && url.pathname.endsWith('/video/multi-shop/queue')) {
    return handleVideoMultiShopQueue(request, env, cors)
  }
  if (request.method === 'GET' && url.pathname.endsWith('/video/upload-queue/file')) {
    return handleVideoUploadQueueFile(request, env, cors)
  }
  if (request.method === 'POST' && url.pathname.endsWith('/video/upload-queue/browser-status')) {
    return handleVideoUploadQueueBrowserStatus(request, env, cors)
  }
  if (request.method === 'GET' && url.pathname.endsWith('/video/upload-queue')) {
    return handleVideoUploadQueueList(request, env, cors)
  }
  if (request.method === 'POST' && url.pathname.endsWith('/video/upload-queue')) {
    return handleVideoUploadQueueCreate(request, env, cors)
  }
  if (request.method === 'POST' && url.pathname.endsWith('/video/upload-queue/cancel')) {
    return handleVideoUploadQueueCancel(request, env, cors)
  }
  if (request.method === 'POST' && url.pathname.endsWith('/video/upload-queue/run')) {
    return handleVideoUploadQueueRun(request, env, cors)
  }
  if (request.method === 'POST' && url.pathname.endsWith('/video/upload')) {
    return handleVideoUpload(request, env, cors)
  }

  return json({ status: 'error', message: 'Route video không tồn tại.' }, cors, 404)
}
