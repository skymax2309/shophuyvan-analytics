import { loadOrders, loadShopList, switchStatus, switchType, switchPlatform,
           showPickList, resetFilter, debounceLoad, toggleAllCheck, 
           closeModal, copyText, onCheck, openLabelSettings,
           openBotSettings, openManualBotRun, openAdvancedApiFeatures, onPlatformFilterChange, onShopFilterChange,
           refreshOrdersView,
       setPageSize } from '../../oms-dashboard/oms-main.js?v=oms-ops-settings-20260523c';
import { initOmsCustomerChatActions } from '../../modules/oms-chat-actions.js?v=order-confirm-20260527c';

  // HTML cũ vẫn dùng onclick global, nên giữ alias rõ để nút production không bị gãy.
  Object.assign(window, {
    loadOrders, loadShopList, switchStatus, switchType, switchPlatform,
    showPickList, resetFilter, debounceLoad, toggleAllCheck, 
    closeModal, copyText, onCheck, openLabelSettings, openBotSettings, openManualBotRun,
    openBotSettingsModal: openBotSettings,
    openManualBotRunModal: openManualBotRun,
    openAdvancedApiFeatures, onPlatformFilterChange, onShopFilterChange,
    refreshOrdersView,
    setPageSize
  });

  initOmsCustomerChatActions();

  const omsSearchInput = document.getElementById('f_search');
  if (omsSearchInput) omsSearchInput.value = '';
  loadShopList();
  loadOrders(1);
