import { loadOrders, loadShopList, syncOrders, switchStatus, switchType, switchPlatform,
           showPickList, resetFilter, debounceLoad, toggleAllCheck, 
           closeModal, copyText, onCheck, openLabelSettings,
           openBotSettings, openAdvancedApiFeatures, onPlatformFilterChange, onShopFilterChange,
           openOrderChatResolver,
       setPageSize } from '../../oms-dashboard/oms-main.js?v=label-real-preview2-20260509';

  // Expose to global scope (vì HTML dùng onclick="...")
  Object.assign(window, {
    loadOrders, loadShopList, syncOrders, switchStatus, switchType, switchPlatform,
    showPickList, resetFilter, debounceLoad, toggleAllCheck, 
    closeModal, copyText, onCheck, openLabelSettings, openBotSettings,
    openAdvancedApiFeatures, onPlatformFilterChange, onShopFilterChange,
    openOrderChatResolver,
    setPageSize
  });

  const omsSearchInput = document.getElementById('f_search');
  if (omsSearchInput) omsSearchInput.value = '';
  loadShopList();
  loadOrders(1);
