import { getShopeeAppFromRow, signHmacHex } from '../utils/shopee-apps.js'
import {
  saveProductCatalogSnapshotsBatch,
  saveProductCatalogState,
  saveProductShopLimit,
  getProductCatalogSettings
} from '../core/product-catalog-core.js'
import { listApiCapableShopCredentials } from '../core/marketplace-shop-capability-core.js'
import { ensureReturnReverseLedgerTable, buildShopeeReturnLedgerRows, buildLazadaReverseLedgerRows, loadReturnReverseOrderMap, saveReturnReverseLedgerRows } from '../core/return-reverse-core.js'
import { ORDER_SOURCE_MODES, cleanupLegacyOrderSourceMeta } from '../core/order-transport-core.js'
import { normalizeBangkokDateTime, normalizeBangkokDate, nowBangkokText, ymdToBangkokMs } from '../core/order-time-core.js'
import {
  mergeLazadaStockSources,
  normalizeLazadaAdvancedStockSource,
  normalizeLazadaFblStockSource
} from '../core/inventory-stock-core.js'
import { importOrdersV2 } from './orders.js'
import { handleVariations } from './products.js'
import { notifyOrderSubscribers, saveProductKnowledgeBatch } from './worker-chat-marketplace-route.js'
import { getCostSettings, calcProfit } from '../utils/db.js'
import { refreshLazadaTokenForShop, refreshShopeeTokenForShop } from './shops.js'
import { collectShopeePackageStatus, mapShopeeStatus } from '../core/orders/shopee-status-core.js'
import { installApiSyncCommonFoundationConstants } from './api-sync/common/foundation-constants.js'
import { installApiSyncCommonFoundationOrders } from './api-sync/common/foundation-orders.js'
import { installApiSyncCommonShopAuth } from './api-sync/common/shop-auth.js'
import { installApiSyncShopeeFinanceIncome } from './api-sync/shopee/finance/income.js'
import { installApiSyncShopeeFinanceEscrowPayout } from './api-sync/shopee/finance/escrow-payout.js'
import { installApiSyncLazadaFinanceTransactions } from './api-sync/lazada/finance/transactions.js'
import { installApiSyncShopeeFinanceTransactionsWallet } from './api-sync/shopee/finance/transactions-wallet.js'
import { installApiSyncShopeeReturnsList } from './api-sync/shopee/returns/list.js'
import { installApiSyncShopeeReturnsDetailTracking } from './api-sync/shopee/returns/detail-tracking.js'
import { installApiSyncShopeeReturnsActions } from './api-sync/shopee/returns/actions.js'
import { installApiSyncLazadaReturnsReverseOrders } from './api-sync/lazada/returns/reverse-orders.js'
import { installApiSyncShopeeReturnsProfitImpact } from './api-sync/shopee/returns/profit-impact.js'
import { installApiSyncShopeeFinancePayoutInfo } from './api-sync/shopee/finance/payout-info.js'
import { installApiSyncShopeeFinanceIncomeReports } from './api-sync/shopee/finance/income-reports.js'
import { installApiSyncShopeeOrdersSync } from './api-sync/shopee/orders/sync.js'
import { installApiSyncAdsCommonDatesMetrics } from './api-sync/ads/common/dates-metrics.js'
import { installApiSyncAdsCommonStorage } from './api-sync/ads/common/storage.js'
import { installApiSyncAdsShopeeNormalizePerformance } from './api-sync/ads/shopee/normalize-performance.js'
import { installApiSyncAdsShopeeSyncProbe } from './api-sync/ads/shopee/sync-probe.js'
import { installApiSyncAdsShopeeSuggestions } from './api-sync/ads/shopee/suggestions.js'
import { installApiSyncAdsShopeeCampaignActions } from './api-sync/ads/shopee/campaign-actions.js'
import { installApiSyncAdsShopeeAffiliate } from './api-sync/ads/shopee/affiliate.js'
import { installApiSyncAdsLazadaCampaignActions } from './api-sync/ads/lazada/campaign-actions.js'
import { installApiSyncLazadaOrdersSync } from './api-sync/lazada/orders/sync.js'
import { installApiSyncShopeeProductsBase } from './api-sync/shopee/products/base.js'
import { installApiSyncShopeeProductsSync } from './api-sync/shopee/products/sync.js'
import { installApiSyncLazadaProductsSync } from './api-sync/lazada/products/sync.js'
import { installApiSyncCommonHandlers } from './api-sync/common/handlers.js'

const core = { getShopeeAppFromRow, signHmacHex, saveProductCatalogSnapshotsBatch, saveProductCatalogState, saveProductShopLimit, getProductCatalogSettings, listApiCapableShopCredentials, ensureReturnReverseLedgerTable, buildShopeeReturnLedgerRows, buildLazadaReverseLedgerRows, loadReturnReverseOrderMap, saveReturnReverseLedgerRows, ORDER_SOURCE_MODES, cleanupLegacyOrderSourceMeta, normalizeBangkokDateTime, normalizeBangkokDate, nowBangkokText, ymdToBangkokMs, mergeLazadaStockSources, normalizeLazadaAdvancedStockSource, normalizeLazadaFblStockSource, importOrdersV2, handleVariations, notifyOrderSubscribers, saveProductKnowledgeBatch, getCostSettings, calcProfit, refreshLazadaTokenForShop, refreshShopeeTokenForShop, collectShopeePackageStatus, mapShopeeStatus }

installApiSyncCommonFoundationConstants(core)
installApiSyncCommonFoundationOrders(core)
installApiSyncCommonShopAuth(core)
installApiSyncShopeeFinanceIncome(core)
installApiSyncShopeeFinanceEscrowPayout(core)
installApiSyncLazadaFinanceTransactions(core)
installApiSyncShopeeFinanceTransactionsWallet(core)
installApiSyncShopeeReturnsList(core)
installApiSyncShopeeReturnsDetailTracking(core)
installApiSyncShopeeReturnsActions(core)
installApiSyncLazadaReturnsReverseOrders(core)
installApiSyncShopeeReturnsProfitImpact(core)
installApiSyncShopeeFinancePayoutInfo(core)
installApiSyncShopeeFinanceIncomeReports(core)
installApiSyncShopeeOrdersSync(core)
installApiSyncAdsCommonDatesMetrics(core)
installApiSyncAdsCommonStorage(core)
installApiSyncAdsShopeeNormalizePerformance(core)
installApiSyncAdsShopeeSyncProbe(core)
installApiSyncAdsShopeeSuggestions(core)
installApiSyncAdsShopeeCampaignActions(core)
installApiSyncAdsShopeeAffiliate(core)
installApiSyncAdsLazadaCampaignActions(core)
installApiSyncLazadaOrdersSync(core)
installApiSyncShopeeProductsBase(core)
installApiSyncShopeeProductsSync(core)
installApiSyncLazadaProductsSync(core)
installApiSyncCommonHandlers(core)

export const ensureShopeeReturnsTable = (...args) => core.ensureShopeeReturnsTable(...args)
export const getApiShops = (...args) => core.getApiShops(...args)
export const signLazada = (...args) => core.signLazada(...args)
export const fetchShopeeOpenCampaignAddedProducts = (...args) => core.fetchShopeeOpenCampaignAddedProducts(...args)
export const callLazadaWithShop = (...args) => core.callLazadaWithShop(...args)
export const fetchShopeeIncomeOverview = (...args) => core.fetchShopeeIncomeOverview(...args)
export const fetchShopeeIncomeDetail = (...args) => core.fetchShopeeIncomeDetail(...args)
export const fetchShopeeEscrowList = (...args) => core.fetchShopeeEscrowList(...args)
export const fetchShopeeEscrowDetail = (...args) => core.fetchShopeeEscrowDetail(...args)
export const fetchShopeePaymentMethodList = (...args) => core.fetchShopeePaymentMethodList(...args)
export const fetchShopeePayoutDetail = (...args) => core.fetchShopeePayoutDetail(...args)
export const fetchLazadaFinanceTransactions = (...args) => core.fetchLazadaFinanceTransactions(...args)
export const fetchLazadaAccountTransactions = (...args) => core.fetchLazadaAccountTransactions(...args)
export const syncLazadaFinanceTransactions = (...args) => core.syncLazadaFinanceTransactions(...args)
export const fetchLazadaPayoutStatus = (...args) => core.fetchLazadaPayoutStatus(...args)
export const fetchShopeeBillingTransactionInfo = (...args) => core.fetchShopeeBillingTransactionInfo(...args)
export const fetchShopeeWalletTransactionList = (...args) => core.fetchShopeeWalletTransactionList(...args)
export const fetchShopeeReturnList = (...args) => core.fetchShopeeReturnList(...args)
export const fetchShopeeReturnDetail = (...args) => core.fetchShopeeReturnDetail(...args)
export const fetchShopeeReverseTrackingInfo = (...args) => core.fetchShopeeReverseTrackingInfo(...args)
export const fetchShopeeReturnDisputeReasons = (...args) => core.fetchShopeeReturnDisputeReasons(...args)
export const queryShopeeReturnProof = (...args) => core.queryShopeeReturnProof(...args)
export const fetchShopeeReturnAvailableSolutions = (...args) => core.fetchShopeeReturnAvailableSolutions(...args)
export const fetchShopeeReturnShippingCarrier = (...args) => core.fetchShopeeReturnShippingCarrier(...args)
export const confirmShopeeReturn = (...args) => core.confirmShopeeReturn(...args)
export const offerShopeeReturn = (...args) => core.offerShopeeReturn(...args)
export const acceptShopeeReturnOffer = (...args) => core.acceptShopeeReturnOffer(...args)
export const disputeShopeeReturn = (...args) => core.disputeShopeeReturn(...args)
export const cancelShopeeReturnDispute = (...args) => core.cancelShopeeReturnDispute(...args)
export const uploadShopeeReturnProof = (...args) => core.uploadShopeeReturnProof(...args)
export const uploadShopeeReturnShippingProof = (...args) => core.uploadShopeeReturnShippingProof(...args)
export const handleBuyerCancellationDecision = (...args) => core.handleBuyerCancellationDecision(...args)
export const syncShopeeReturns = (...args) => core.syncShopeeReturns(...args)
export const syncLazadaReverseOrders = (...args) => core.syncLazadaReverseOrders(...args)
export const fetchShopeeReturnProfitImpact = (...args) => core.fetchShopeeReturnProfitImpact(...args)
export const fetchShopeePayoutInfo = (...args) => core.fetchShopeePayoutInfo(...args)
export const generateShopeeIncomeReport = (...args) => core.generateShopeeIncomeReport(...args)
export const generateShopeeIncomeStatement = (...args) => core.generateShopeeIncomeStatement(...args)
export const fetchShopeeIncomeStatement = (...args) => core.fetchShopeeIncomeStatement(...args)
export const fetchShopeeIncomeReport = (...args) => core.fetchShopeeIncomeReport(...args)
export const fetchShopeeAdsToggleInfo = (...args) => core.fetchShopeeAdsToggleInfo(...args)
export const fetchShopeeCreateProductAdBudgetSuggestion = (...args) => core.fetchShopeeCreateProductAdBudgetSuggestion(...args)
export const fetchShopeeProductRecommendedRoiTarget = (...args) => core.fetchShopeeProductRecommendedRoiTarget(...args)
export const fetchShopeeProductLevelCampaignIdList = (...args) => core.fetchShopeeProductLevelCampaignIdList(...args)
export const fetchShopeeProductLevelCampaignSettingInfo = (...args) => core.fetchShopeeProductLevelCampaignSettingInfo(...args)
export const createShopeeAutoProductAds = (...args) => core.createShopeeAutoProductAds(...args)
export const editShopeeAutoProductAds = (...args) => core.editShopeeAutoProductAds(...args)
export const editShopeeManualProductAds = (...args) => core.editShopeeManualProductAds(...args)
export const editShopeeManualProductAdKeywords = (...args) => core.editShopeeManualProductAdKeywords(...args)
export const fetchShopeeAdsBalances = (...args) => core.fetchShopeeAdsBalances(...args)
export const ensureShopeeAffiliatePerformanceTable = (...args) => core.ensureShopeeAffiliatePerformanceTable(...args)
export const syncShopeeAffiliatePerformance = (...args) => core.syncShopeeAffiliatePerformance(...args)
export const ensureShopeeOpenCampaignPerformanceTable = (...args) => core.ensureShopeeOpenCampaignPerformanceTable(...args)
export const syncShopeeOpenCampaignPerformance = (...args) => core.syncShopeeOpenCampaignPerformance(...args)
export const fetchLazadaAdsAccountSignInfo = (...args) => core.fetchLazadaAdsAccountSignInfo(...args)
export const fetchLazadaAdsLatestSignInfo = (...args) => core.fetchLazadaAdsLatestSignInfo(...args)
export const updateLazadaAdsCampaign = (...args) => core.updateLazadaAdsCampaign(...args)
export const updateLazadaAdsAdgroupBatch = (...args) => core.updateLazadaAdsAdgroupBatch(...args)
export const syncApiProducts = (...args) => core.syncApiProducts(...args)
export const syncApiOrders = (...args) => core.syncApiOrders(...args)
export const syncApiOrderStatuses = (...args) => core.syncApiOrderStatuses(...args)
export const syncAdsCampaignSnapshots = (...args) => core.syncAdsCampaignSnapshots(...args)
export const probeShopeeAdsApi = (...args) => core.probeShopeeAdsApi(...args)
export const handleApiStatusSync = (...args) => core.handleApiStatusSync(...args)
export const handleApiOrderSync = (...args) => core.handleApiOrderSync(...args)
export const handleApiProductSync = (...args) => core.handleApiProductSync(...args)
export const __test__ = core.__test__
