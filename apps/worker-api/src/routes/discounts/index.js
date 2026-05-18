import { getShopeeAppFromRow, getShopeeAppFromRowForClient, signHmacHex } from '../../utils/shopee-apps.js'
import { callLazadaWithShop, getApiShops } from '../api/index.js'
import { getAdminUserFromRequest } from '../admin/index.js'
import { refreshShopeeTokenForShop } from '../shops/index.js'
import { loadPromotionToolCore } from '../../core/promotions/tool-core.js'
import { buildPromotionStockPricePreview } from '../../core/promotions/stock-price-rule-core.js'
import {
  buildShopeeActionResult,
  extractShopeeError,
  isShopeeInvalidAccessTokenMessage,
  redactShopeeDebug,
  shopeeResponseHasBusinessError
} from '../../core/shopee/action-result-core.js'
import { installDiscountsCommonFoundation } from './common/foundation.js'
import { installDiscountsCommonTables } from './common/tables.js'
import { installDiscountsShopeeDiscountsSync } from './shopee/discounts/sync.js'
import { installDiscountsShopeeVouchersSync } from './shopee/vouchers/sync.js'
import { installDiscountsLazadaVouchersSync } from './lazada/vouchers/sync.js'
import { installDiscountsCommonPromotionProgramCore } from './common/promotion-program-core.js'
import { installDiscountsShopeePromotionsSyncPrograms } from './shopee/promotions/sync-programs.js'
import { installDiscountsLazadaPromotionsSyncPrograms } from './lazada/promotions/sync-programs.js'
import { installDiscountsCommonPromotionBrowser } from './common/promotion-browser.js'
import { installDiscountsCommonPromotionSkuDetail } from './common/promotion-sku-detail.js'
import { installDiscountsCommonPromotionQueue } from './common/promotion-queue.js'
import { installDiscountsCommonPromotionCacheBatch } from './common/promotion-cache-batch.js'
import { installDiscountsShopeeDiscountsAnalysis } from './shopee/discounts/analysis.js'
import { installDiscountsShopeeDiscountsActions } from './shopee/discounts/actions.js'
import { installDiscountsShopeePromotionsActions } from './shopee/promotions/actions.js'
import { installDiscountsCommonRouteHandler } from './common/route-handler.js'

const core = {
  getShopeeAppFromRow,
  getShopeeAppFromRowForClient,
  signHmacHex,
  callLazadaWithShop,
  getApiShops,
  getAdminUserFromRequest,
  refreshShopeeTokenForShop,
  loadPromotionToolCore,
  buildPromotionStockPricePreview,
  buildShopeeActionResult,
  extractShopeeError,
  isShopeeInvalidAccessTokenMessage,
  redactShopeeDebug,
  shopeeResponseHasBusinessError
}

installDiscountsCommonFoundation(core)
installDiscountsCommonTables(core)
installDiscountsShopeeDiscountsSync(core)
installDiscountsShopeeVouchersSync(core)
installDiscountsLazadaVouchersSync(core)
installDiscountsCommonPromotionProgramCore(core)
installDiscountsShopeePromotionsSyncPrograms(core)
installDiscountsLazadaPromotionsSyncPrograms(core)
installDiscountsCommonPromotionBrowser(core)
installDiscountsCommonPromotionSkuDetail(core)
installDiscountsCommonPromotionQueue(core)
installDiscountsCommonPromotionCacheBatch(core)
installDiscountsShopeeDiscountsAnalysis(core)
installDiscountsShopeeDiscountsActions(core)
installDiscountsShopeePromotionsActions(core)
installDiscountsCommonRouteHandler(core)

export const ensureShopeeDiscountTables = (...args) => core.ensureShopeeDiscountTables(...args)
export const syncShopeeDiscounts = (...args) => core.syncShopeeDiscounts(...args)
export const syncShopeeVouchers = (...args) => core.syncShopeeVouchers(...args)
export const syncLazadaVouchers = (...args) => core.syncLazadaVouchers(...args)
export const syncShopeePromotionPrograms = (...args) => core.syncShopeePromotionPrograms(...args)
export const syncLazadaPromotionPrograms = (...args) => core.syncLazadaPromotionPrograms(...args)
export const listPromotionPrograms = (...args) => core.listPromotionPrograms(...args)
export const getPromotionProgramDetail = (...args) => core.getPromotionProgramDetail(...args)
export const listPromotionVouchers = (...args) => core.listPromotionVouchers(...args)
export const getPromotionSkuDetail = (...args) => core.getPromotionSkuDetail(...args)
export const repairPromotionItemPriceGaps = (...args) => core.repairPromotionItemPriceGaps(...args)
export const previewPromotionAction = (...args) => core.previewPromotionAction(...args)
export const createPromotionApplyQueue = (...args) => core.createPromotionApplyQueue(...args)
export const executePromotionApplyQueue = (...args) => core.executePromotionApplyQueue(...args)
export const listPromotionApplyQueue = (...args) => core.listPromotionApplyQueue(...args)
export const decidePromotionApplyQueue = (...args) => core.decidePromotionApplyQueue(...args)
export const runPromotionDeepCacheBatch = (...args) => core.runPromotionDeepCacheBatch(...args)
export const analyzeShopeeDiscounts = (...args) => core.analyzeShopeeDiscounts(...args)
export const executeShopeeDiscountAction = (...args) => core.executeShopeeDiscountAction(...args)
export const executeShopeePromotionAction = (...args) => core.executeShopeePromotionAction(...args)
export const handleDiscounts = (...args) => core.handleDiscounts(...args)
