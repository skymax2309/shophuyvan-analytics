  async function saveShopeeApiConfig() {
    const shopName = document.getElementById('shopeeApiShop')?.value;
    const partnerId = document.getElementById('shopeePartnerId')?.value.trim();
    const partnerKey = document.getElementById('shopeePartnerKey')?.value.trim();
    const redirect = document.getElementById('shopeeRedirectUrl')?.value.trim();
    if (!shopName || !partnerId) {
      alert('Vui lòng chọn shop và nhập Partner ID.');
      return;
    }
    const res = await fetch(`${API_BASE_URL}/api/shops/shopee-app-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shop_name: shopName, partner_id: partnerId, partner_key: partnerKey, redirect })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Không lưu được cấu hình Shopee.');
      return;
    }
    await reloadShopeeApiSelectionThenAlert(shopName, 'main', 'Đã lưu cấu hình App Shopee cho shop.');
  }

  function connectShopeeSelected() {
    const cfg = selectedShopeeConfig();
    const shopName = cfg?.shop_name || document.getElementById('shopeeApiShop')?.value;
    if (!shopName) {
      alert('Vui lòng chọn shop Shopee.');
      return;
    }
    if (!document.getElementById('shopeePartnerId')?.value.trim()) {
      alert('Vui lòng lưu Partner ID và Partner Key trước khi kết nối.');
      return;
    }
    rememberShopeeApiSelection(shopName, 'main');
    window.location.href = `${API_BASE_URL}/api/auth/shopee/url?shop=${encodeURIComponent(shopName)}`;
  }

  async function refreshShopeeSelected() {
    const cfg = selectedShopeeConfig();
    if (!cfg?.has_refresh_token || !cfg?.api_shop_id) {
      alert('Shop này chưa có refresh token. Vui lòng bấm Kết nối / Gia hạn trước.');
      return;
    }
    const res = await fetch(`${API_BASE_URL}/api/shops/force-refresh-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shop_id: cfg.id })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Không làm mới được token.');
      return;
    }
    await reloadShopeeApiSelectionThenAlert(cfg.shop_name, 'main', 'Đã làm mới token Shopee.');
  }

  async function disconnectShopeeSelected() {
    const cfg = selectedShopeeConfig();
    if (!cfg?.id) {
      alert('Vui lòng chọn shop Shopee.');
      return;
    }
    if (!confirm(`Ngắt kết nối API của shop ${cfg.shop_name}? Cấu hình Partner ID/Key vẫn được giữ lại để kết nối lại sau.`)) return;
    const res = await fetch(`${API_BASE_URL}/api/shops/disconnect-api`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shop_id: cfg.id })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Không ngắt kết nối được API.');
      return;
    }
    await reloadShopeeApiSelectionThenAlert(cfg.shop_name, 'main', 'Đã ngắt kết nối API Shopee.');
  }

  async function saveShopeeVideoApiConfig() {
    const shopName = document.getElementById('shopeeApiShop')?.value;
    const partnerId = document.getElementById('shopeeVideoPartnerId')?.value.trim();
    const partnerKey = document.getElementById('shopeeVideoPartnerKey')?.value.trim();
    const redirect = document.getElementById('shopeeVideoRedirectUrl')?.value.trim();
    if (!shopName || !partnerId) {
      alert('Vui lòng chọn shop và nhập Partner ID video.');
      return;
    }
    const res = await fetch(`${API_BASE_URL}/api/shops/shopee-video-app-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shop_name: shopName, partner_id: partnerId, partner_key: partnerKey, redirect })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Không lưu được cấu hình Shopee Video.');
      return;
    }
    await reloadShopeeApiSelectionThenAlert(shopName, 'video', 'Đã lưu cấu hình Shopee Video API cho shop.');
  }

  function connectShopeeVideoSelected() {
    const cfg = selectedShopeeConfig();
    const shopName = cfg?.shop_name || document.getElementById('shopeeApiShop')?.value;
    if (!shopName) {
      alert('Vui lòng chọn shop Shopee.');
      return;
    }
    const partnerId = document.getElementById('shopeeVideoPartnerId')?.value.trim() || cfg?.video_partner_id;
    if (!partnerId) {
      alert('Vui lòng lưu Partner ID/Key video trước khi kết nối.');
      return;
    }
    rememberShopeeApiSelection(shopName, 'video');
    window.location.href = `${API_BASE_URL}/api/auth/shopee/video/url?shop=${encodeURIComponent(shopName)}`;
  }

  async function testShopeeVideoSelected() {
    const cfg = selectedShopeeConfig();
    if (!cfg?.shop_name) {
      alert('Vui lòng chọn shop Shopee.');
      return;
    }
    const res = await fetch(`${API_BASE_URL}/api/video/test-permission`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shop: cfg.shop_name })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      await reloadShopeeApiSelectionThenAlert(cfg.shop_name, 'video', data.message || data.error || 'Test quyền Shopee Video thất bại.');
      return;
    }
    await reloadShopeeApiSelectionThenAlert(cfg.shop_name, 'video', data.message || 'Test quyền Shopee Video OK.');
  }

  async function refreshShopeeVideoSelected() {
    const cfg = selectedShopeeConfig();
    if (!cfg?.id || !cfg?.has_video_refresh_token) {
      alert('Shop này chưa có refresh token video. Vui lòng bấm Kết nối/Gia hạn video trước.');
      return;
    }
    const res = await fetch(`${API_BASE_URL}/api/shops/force-refresh-video-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shop_id: cfg.id })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Không làm mới được token Shopee Video.');
      return;
    }
    await reloadShopeeApiSelectionThenAlert(cfg.shop_name, 'video', 'Đã làm mới token Shopee Video.');
  }

  async function disconnectShopeeVideoSelected() {
    const cfg = selectedShopeeConfig();
    if (!cfg?.id) {
      alert('Vui lòng chọn shop Shopee.');
      return;
    }
    if (!confirm(`Ngắt riêng Shopee Video API của shop ${cfg.shop_name}? API chính vẫn giữ nguyên.`)) return;
    const res = await fetch(`${API_BASE_URL}/api/shops/disconnect-video-api`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shop_id: cfg.id })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Không ngắt được Shopee Video API.');
      return;
    }
    await reloadShopeeApiSelectionThenAlert(cfg.shop_name, 'video', 'Đã ngắt riêng Shopee Video API.');
  }

  function openApiAuthModal() {
    document.getElementById('apiAuthModal').style.display = 'flex';
    loadShopeeApiConfigs(getStoredApiShop());
  }

  window.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const requestedShop = params.get('apiShop') || getStoredApiShop();
    const requestedSection = normalizeApiSection(params.get('apiSection') || localStorage.getItem(API_SECTION_STORAGE_KEY));
    activeApiSection = requestedSection;
    if (params.get('apiShop') || params.get('apiSection')) {
      document.getElementById('apiAuthModal').style.display = 'flex';
    }
    loadShopeeApiConfigs(requestedShop);
    if (params.get('api_status') === 'success') {
      alert(params.get('shopee_video') === 'success'
        ? 'Đã kết nối Shopee Video API. Hãy bấm Test quyền video trước khi đồng bộ.'
        : 'Đã kết nối API thành công và lưu vào hệ thống.');
      params.delete('api_status');
      params.delete('shopee_video');
      if (requestedShop) params.set('apiShop', requestedShop);
      params.set('apiSection', requestedSection);
      window.history.replaceState({}, document.title, `${window.location.pathname}?${params.toString()}`);
      if (window.loadShopList) window.loadShopList();
    }
  });
