import { getShopeeAppFromRow, signHmacHex } from '../utils/shopee-apps.js'
import { callLazadaWithShop, getApiShops } from './api-sync.js'
import { getAdminUserFromRequest } from './admin-auth.js'
import { loadPromotionToolCore } from '../core/promotion-tool-core.js'
import { buildPromotionStockPricePreview } from '../core/promotion-stock-price-rule-core.js'
import { installDiscountsCommonFoundation } from './discounts/common/foundation.js'
import { installDiscountsCommonTables } from './discounts/common/tables.js'
import { installDiscountsShopeeDiscountsSync } from './discounts/shopee/discounts/sync.js'
import { installDiscountsShopeeVouchersSync } from './discounts/shopee/vouchers/sync.js'
import { installDiscountsLazadaVouchersSync } from './discounts/lazada/vouchers/sync.js'
import { installDiscountsCommonPromotionProgramCore } from './discounts/common/promotion-program-core.js'
import { installDiscountsShopeePromotionsSyncPrograms } from './discounts/shopee/promotions/sync-programs.js'
import { installDiscountsLazadaPromotionsSyncPrograms } from './discounts/lazada/promotions/sync-programs.js'
import { installDiscountsCommonPromotionBrowser } from './discounts/common/promotion-browser.js'
import { installDiscountsCommonPromotionSkuDetail } from './discounts/common/promotion-sku-detail.js'
import { installDiscountsCommonPromotionQueue } from './discounts/common/promotion-queue.js'
import { installDiscountsCommonPromotionCacheBatch } from './discounts/common/promotion-cache-batch.js'
import { installDiscountsShopeeDiscountsAnalysis } from './discounts/shopee/discounts/analysis.js'
import { installDiscountsShopeeDiscountsActions } from './discounts/shopee/discounts/actions.js'
import { installDiscountsShopeePromotionsActions } from './discounts/shopee/promotions/actions.js'
import { installDiscountsCommonRouteHandler } from './discounts/common/route-handler.js'

const core = { getShopeeAppFromRow, signHmacHex, callLazadaWithShop, getApiShops, getAdminUserFromRequest, loadPromotionToolCore, buildPromotionStockPricePreview }

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
