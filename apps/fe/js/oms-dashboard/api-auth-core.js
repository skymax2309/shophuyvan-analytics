var API_BASE_URL = 'https://huyvan-worker-api.nghiemchihuy.workers.dev';
var shopeeApiConfigs = [];
var activeApiSection = 'main';
var activeVideoApiTask = localStorage.getItem('shv_video_api_task') || 'config';
var API_SHOP_STORAGE_KEY = 'shv_api_selected_shop';
var API_SECTION_STORAGE_KEY = 'shv_api_selected_section';

  function normalizeApiSection(value) {
    return value === 'video' ? 'video' : 'main';
  }

  function getStoredApiShop() {
    return localStorage.getItem(API_SHOP_STORAGE_KEY) || '';
  }

  function shouldKeepApiSelectionInUrl() {
    const params = new URLSearchParams(window.location.search);
    const modalOpen = document.getElementById('apiAuthModal')?.style.display === 'flex';
    return modalOpen || params.has('apiShop') || params.has('apiSection') || params.has('api_status');
  }

  function rememberShopeeApiSelection(shopName, section = activeApiSection, options = {}) {
    const finalShop = String(shopName || '').trim();
    activeApiSection = normalizeApiSection(section);
    if (finalShop) localStorage.setItem(API_SHOP_STORAGE_KEY, finalShop);
    localStorage.setItem(API_SECTION_STORAGE_KEY, activeApiSection);
    if (options.updateUrl === false) return;
    if (options.updateUrl !== true && !shouldKeepApiSelectionInUrl()) return;
    const params = new URLSearchParams(window.location.search);
    if (finalShop) params.set('apiShop', finalShop);
    params.set('apiSection', activeApiSection);
    window.history.replaceState({}, document.title, `${window.location.pathname}?${params.toString()}`);
  }

  function setApiModalSection(section, options = {}) {
    activeApiSection = normalizeApiSection(section);
    localStorage.setItem(API_SECTION_STORAGE_KEY, activeApiSection);
    const mainSection = document.getElementById('shopeeMainApiSection');
    const videoSection = document.getElementById('shopeeVideoApiSection');
    const mainTab = document.getElementById('shopeeMainApiTab');
    const videoTab = document.getElementById('shopeeVideoApiTab');
    if (mainSection) mainSection.style.display = activeApiSection === 'main' ? 'grid' : 'none';
    if (videoSection) videoSection.style.display = activeApiSection === 'video' ? 'grid' : 'none';
    if (mainTab) mainTab.className = activeApiSection === 'main' ? 'btn btn-primary' : 'btn btn-ghost';
    if (videoTab) videoTab.className = activeApiSection === 'video' ? 'btn btn-primary' : 'btn btn-ghost';
    if (activeApiSection === 'video') setVideoApiTask(activeVideoApiTask);
    const selected = document.getElementById('shopeeApiShop')?.value || getStoredApiShop();
    if (selected) rememberShopeeApiSelection(selected, activeApiSection, options);
  }

  function setVideoApiTask(task) {
    activeVideoApiTask = task === 'check' ? 'check' : 'config';
    localStorage.setItem('shv_video_api_task', activeVideoApiTask);
    const configTask = document.getElementById('shopeeVideoConfigTask');
    const checkTask = document.getElementById('shopeeVideoCheckTask');
    const configTab = document.getElementById('shopeeVideoConfigTab');
    const checkTab = document.getElementById('shopeeVideoCheckTab');
    if (configTask) configTask.style.display = activeVideoApiTask === 'config' ? 'grid' : 'none';
    if (checkTask) checkTask.style.display = activeVideoApiTask === 'check' ? 'grid' : 'none';
    if (configTab) configTab.className = activeVideoApiTask === 'config' ? 'btn btn-primary' : 'btn btn-ghost';
    if (checkTab) checkTab.className = activeVideoApiTask === 'check' ? 'btn btn-primary' : 'btn btn-ghost';
  }

  function parseApiDate(value) {
    if (!value) return null;
    const text = String(value).trim();
    const iso = text.includes('T') ? text : text.replace(' ', 'T') + 'Z';
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDateTime(value) {
    const date = parseApiDate(value);
    if (!date) return 'Chưa có';
    return date.toLocaleString('vi-VN', { hour12: false });
  }

  function remainingText(value, mode = 'time') {
    const date = parseApiDate(value);
    if (!date) return 'Chưa có dữ liệu';
    const diffMs = date.getTime() - Date.now();
    if (diffMs <= 0) return 'Đã hết hạn';
    const minutes = Math.ceil(diffMs / 60000);
    const hours = Math.ceil(diffMs / 3600000);
    const days = Math.ceil(diffMs / 86400000);
    if (mode === 'days') return `Còn ${days} ngày`;
    if (minutes < 60) return `Còn ${minutes} phút`;
    if (hours < 24) return `Còn ${hours} giờ`;
    return `Còn ${days} ngày`;
  }

  function apiState(cfg) {
    const connected = !!(cfg?.has_access_token && cfg?.has_refresh_token && cfg?.api_shop_id);
    if (connected) return { text: 'Đã kết nối API', color: '#22c55e' };
    if (cfg?.has_partner_key) return { text: 'Đã lưu App, chưa cấp quyền', color: '#f59e0b' };
    return { text: 'Chưa cấu hình', color: '#94a3b8' };
  }

  function videoApiState(cfg) {
    const hasApp = !!(cfg?.video_partner_id && cfg?.has_video_partner_key);
    const rawUserId = String(cfg?.video_api_user_id || '').trim();
    const rawShopId = String(cfg?.video_api_shop_id || cfg?.api_shop_id || '').trim();
    const hasUsableUserId = !!(rawUserId && cfg?.video_auth_subject_type !== 'shop' && rawUserId !== rawShopId);
    const connected = !!(cfg?.has_video_access_token && hasUsableUserId);
    const permission = String(cfg?.video_permission_status || '').toLowerCase();
    if (connected && permission === 'ok') return { text: 'Video đã test OK', color: '#22c55e' };
    if (connected) return { text: 'Cần test quyền video', color: '#f59e0b' };
    if (cfg?.has_video_access_token && !hasUsableUserId) return { text: 'Thiếu user_id video', color: '#ef4444' };
    if (hasApp) return { text: 'Đã lưu App video, chưa cấp quyền', color: '#f97316' };
    return { text: 'Chưa cấu hình Video API', color: '#94a3b8' };
  }

  function selectedShopeeConfig() {
    const selected = document.getElementById('shopeeApiShop')?.value;
    return shopeeApiConfigs.find(s => s.shop_name === selected) || null;
  }

  async function reloadShopeeApiSelectionThenAlert(shopName, section, message) {
    // Cập nhật lại trạng thái trên modal trước khi hiện alert để người vận hành không thấy nền cũ lệch với kết quả vừa bấm.
    rememberShopeeApiSelection(shopName, section);
    await loadShopeeApiConfigs(shopName);
    alert(message);
  }

  function renderApiAuthModal() {
    const modal = document.querySelector('#apiAuthModal .modal');
    if (!modal) return;
    modal.style.maxWidth = '720px';
    modal.innerHTML = `
      <div class="modal-header">
        <div class="modal-title">Kết nối API sàn</div>
        <button class="modal-close" onclick="document.getElementById('apiAuthModal').style.display='none'">×</button>
      </div>
      <div style="padding:20px 0; display:flex; flex-direction:column; gap:14px;">
        <details style="border:1px solid var(--line); border-radius:8px; padding:10px;">
          <summary style="cursor:pointer; font-weight:800; color:var(--text);">Tóm tắt shop API</summary>
          <div id="shopeeApiSummary" style="display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin-top:10px;"></div>
        </details>
        <div style="display:grid; gap:10px;">
          <label style="font-size:12px; font-weight:700; color:var(--muted);">Shop Shopee</label>
          <select id="shopeeApiShop" class="filter-input" style="width:100%; padding:10px;" onchange="rememberShopeeApiSelection(this.value); fillShopeeApiForm()"></select>
        </div>
        <div id="shopeeSelectedShopBanner" style="border:1px solid var(--line); border-radius:8px; padding:10px; background:rgba(34,197,94,.08); font-size:13px; line-height:1.5;"></div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
          <button id="shopeeMainApiTab" class="btn btn-primary" style="padding:11px; font-weight:800;" onclick="setApiModalSection('main')">API chính</button>
          <button id="shopeeVideoApiTab" class="btn btn-ghost" style="padding:11px; font-weight:800;" onclick="setApiModalSection('video')">Video API</button>
        </div>
        <section id="shopeeMainApiSection" style="border:1px solid var(--line); border-radius:10px; padding:12px; display:grid; gap:10px;">
          <div>
            <div style="font-weight:800; color:var(--text);">Shopee API chính</div>
            <div style="font-size:12px; color:var(--muted); line-height:1.5;">Dùng cho đơn hàng, sản phẩm, tồn kho và ADS. Không dùng token này cho Shopee Video.</div>
          </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:10px;">
          <div>
            <label style="font-size:12px; font-weight:700; color:var(--muted);">Live Partner ID</label>
            <input id="shopeePartnerId" class="filter-input" style="width:100%; padding:10px;" placeholder="Ví dụ: 2032989">
          </div>
          <div>
            <label style="font-size:12px; font-weight:700; color:var(--muted);">Live Partner Key</label>
            <input id="shopeePartnerKey" type="password" class="filter-input" style="width:100%; padding:10px;" placeholder="Nhập key mới, hoặc để trống nếu đã lưu">
          </div>
        </div>
        <div>
          <label style="font-size:12px; font-weight:700; color:var(--muted);">Callback URL</label>
          <input id="shopeeRedirectUrl" class="filter-input" style="width:100%; padding:10px;" value="${API_BASE_URL}/channels/shopee/callback">
        </div>
        <div id="shopeeApiStatus" style="font-size:12px; color:var(--muted); line-height:1.6;"></div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px;">
          <button class="btn btn-primary" style="padding:12px; font-weight:700;" onclick="saveShopeeApiConfig()">Lưu cấu hình App</button>
          <button id="connectShopeeBtn" class="btn" style="background:#ee4d2d; color:white; padding:12px; font-weight:700;" onclick="connectShopeeSelected()">Kết nối / Gia hạn</button>
          <button class="btn btn-ghost" style="padding:12px; font-weight:700;" onclick="refreshShopeeSelected()">Làm mới token</button>
          <button class="btn" style="background:#991b1b; color:white; padding:12px; font-weight:700;" onclick="disconnectShopeeSelected()">Ngắt kết nối</button>
        </div>
        </section>
        <section id="shopeeVideoApiSection" style="border:1px solid var(--line); border-radius:10px; padding:12px; display:grid; gap:10px;">
          <div>
            <div style="font-weight:800; color:var(--text);">Shopee Video API</div>
            <div style="font-size:12px; color:var(--muted); line-height:1.5;">
              Dùng riêng cho Shopee Video Management. Lưu Partner ID/Key video, kết nối riêng rồi bấm Test quyền video; dashboard video chỉ chạy khi test OK.
            </div>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
            <button id="shopeeVideoConfigTab" class="btn btn-primary" style="padding:11px; font-weight:800;" onclick="setVideoApiTask('config')">Cấu hình</button>
            <button id="shopeeVideoCheckTab" class="btn btn-ghost" style="padding:11px; font-weight:800;" onclick="setVideoApiTask('check')">Kiểm tra</button>
          </div>
          <div id="shopeeVideoConfigTask" style="display:grid; gap:10px;">
            <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:10px;">
              <div>
                <label style="font-size:12px; font-weight:700; color:var(--muted);">Video Partner ID</label>
                <input id="shopeeVideoPartnerId" class="filter-input" style="width:100%; padding:10px;" placeholder="Partner ID của app video">
              </div>
              <div>
                <label style="font-size:12px; font-weight:700; color:var(--muted);">Video Partner Key</label>
                <input id="shopeeVideoPartnerKey" type="password" class="filter-input" style="width:100%; padding:10px;" placeholder="Nhập key video mới, hoặc để trống nếu đã lưu">
              </div>
            </div>
            <div>
              <label style="font-size:12px; font-weight:700; color:var(--muted);">Callback URL video</label>
              <input id="shopeeVideoRedirectUrl" class="filter-input" style="width:100%; padding:10px;" value="${API_BASE_URL}/channels/shopee/video/callback">
            </div>
            <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px;">
              <button class="btn btn-primary" style="padding:12px; font-weight:700;" onclick="saveShopeeVideoApiConfig()">Lưu cấu hình video</button>
              <button class="btn" style="background:#ee4d2d; color:white; padding:12px; font-weight:700;" onclick="connectShopeeVideoSelected()">Kết nối/Gia hạn video</button>
            </div>
          </div>
          <div id="shopeeVideoApiStatus" style="font-size:12px; color:var(--muted); line-height:1.6;"></div>
          <div id="shopeeVideoCheckTask" style="display:none; gap:10px;">
            <div style="font-size:12px; color:var(--muted); line-height:1.5;">Các nút kiểm tra chỉ áp dụng cho shop đang chọn. Test quyền là bước bắt buộc trước khi đồng bộ/upload/sửa/xóa video.</div>
            <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px;">
            <button class="btn btn-ghost" style="padding:12px; font-weight:700;" onclick="testShopeeVideoSelected()">Test quyền video</button>
            <button class="btn btn-ghost" style="padding:12px; font-weight:700;" onclick="refreshShopeeVideoSelected()">Làm mới token video</button>
            <button class="btn" style="background:#991b1b; color:white; padding:12px; font-weight:700;" onclick="disconnectShopeeVideoSelected()">Ngắt video</button>
            </div>
          </div>
        </section>
        <details style="border:1px solid var(--line); border-radius:8px; padding:10px;">
          <summary style="cursor:pointer; font-weight:800; color:var(--text);">Xem trạng thái tất cả shop</summary>
          <div style="overflow:auto; margin-top:10px;">
          <table style="width:100%; border-collapse:collapse; font-size:12px;">
            <thead>
              <tr style="background:rgba(148,163,184,.08); color:var(--muted);">
                <th style="text-align:left; padding:10px;">Shop</th>
                <th style="text-align:left; padding:10px;">Trạng thái</th>
                <th style="text-align:left; padding:10px;">Access token</th>
                <th style="text-align:left; padding:10px;">Hạn ủy quyền</th>
                <th style="text-align:left; padding:10px;">App</th>
              </tr>
            </thead>
            <tbody id="shopeeApiRows"></tbody>
          </table>
          </div>
        </details>
        <a href="${API_BASE_URL}/api/auth/lazada/url" class="btn" style="background:#0f146d; color:white; text-align:center; padding:12px; text-decoration:none; font-weight:700; border-radius:8px;">
          Kết nối Lazada
        </a>
      </div>
    `;
  }

  function renderShopeeApiSummary() {
    const summary = document.getElementById('shopeeApiSummary');
    if (!summary) return;
    const total = shopeeApiConfigs.length;
    const connected = shopeeApiConfigs.filter(s => s.has_access_token && s.has_refresh_token && s.api_shop_id).length;
    const saved = shopeeApiConfigs.filter(s => s.has_partner_key).length;
    const videoOk = shopeeApiConfigs.filter(s => s.has_video_access_token && String(s.video_permission_status || '').toLowerCase() === 'ok').length;
    summary.innerHTML = [
      ['Tổng shop Shopee', total],
      ['Đã kết nối API', connected],
      ['Đã lưu App chính', saved],
      ['Video đã test OK', videoOk]
    ].map(([label, value]) => `
      <div style="border:1px solid var(--line); border-radius:8px; padding:10px; background:rgba(15,23,42,.25);">
        <div style="font-size:11px; color:var(--muted);">${label}</div>
        <div style="font-size:20px; font-weight:800; color:var(--text);">${value}</div>
      </div>
    `).join('');
  }

  function renderShopeeApiRows() {
    const rows = document.getElementById('shopeeApiRows');
    if (!rows) return;
    rows.innerHTML = shopeeApiConfigs.map(cfg => {
      const state = apiState(cfg);
      const videoState = videoApiState(cfg);
      return `
        <tr style="border-top:1px solid var(--line);">
          <td style="padding:10px; font-weight:700;">${cfg.shop_name}</td>
          <td style="padding:10px; color:${state.color}; font-weight:700;">${state.text}</td>
          <td style="padding:10px;">${remainingText(cfg.token_expire_at)}<br><span style="color:var(--muted);">${formatDateTime(cfg.token_expire_at)}</span></td>
          <td style="padding:10px;">${remainingText(cfg.api_refresh_expire_at, 'days')}<br><span style="color:var(--muted);">${formatDateTime(cfg.api_refresh_expire_at)}</span></td>
          <td style="padding:10px;">
            API chính: ${cfg.api_partner_id || 'Chưa lưu'}<br>
            <span style="color:${videoState.color}; font-weight:700;">Video: ${videoState.text}</span>
          </td>
        </tr>
      `;
    }).join('');
  }

  async function loadShopeeApiConfigs(preferredShop = '') {
    const params = new URLSearchParams(window.location.search);
    activeApiSection = normalizeApiSection(params.get('apiSection') || localStorage.getItem(API_SECTION_STORAGE_KEY) || activeApiSection);
    renderApiAuthModal();
    try {
      const res = await fetch(`${API_BASE_URL}/api/shops/api-configs?t=${Date.now()}`);
      const rows = await res.json();
      shopeeApiConfigs = (rows || []).filter(s => s.platform === 'shopee' && !(String(s.shop_name || '').match(/^Shopee \d+$/) && String(s.user_name || '').match(/^\d+$/)));
      const select = document.getElementById('shopeeApiShop');
      if (!select) return;
      select.innerHTML = shopeeApiConfigs.map(s => {
        const state = apiState(s).text;
        const videoState = videoApiState(s).text;
        return `<option value="${s.shop_name}">${s.shop_name} - ${state} / Video: ${videoState}</option>`;
      }).join('');
      const requestedShop = preferredShop || params.get('apiShop') || getStoredApiShop();
      if (requestedShop && shopeeApiConfigs.some(s => s.shop_name === requestedShop)) {
        select.value = requestedShop;
      }
      if (!select.value && shopeeApiConfigs[0]?.shop_name) select.value = shopeeApiConfigs[0].shop_name;
      const keepSelectionInUrl = shouldKeepApiSelectionInUrl();
      if (select.value) rememberShopeeApiSelection(select.value, activeApiSection, { updateUrl: keepSelectionInUrl });
      renderShopeeApiSummary();
      renderShopeeApiRows();
      fillShopeeApiForm();
      setApiModalSection(activeApiSection, { updateUrl: keepSelectionInUrl });
    } catch (err) {
      const status = document.getElementById('shopeeApiStatus');
      if (status) status.textContent = `Không tải được cấu hình API: ${err.message}`;
    }
  }

  function fillShopeeApiForm() {
    const cfg = selectedShopeeConfig() || {};
    const selected = cfg.shop_name || document.getElementById('shopeeApiShop')?.value || '';
    const banner = document.getElementById('shopeeSelectedShopBanner');
    if (banner) {
      banner.innerHTML = `<b>Đang thao tác: ${selected || 'Chưa chọn shop'}</b><br><span style="color:var(--muted);">Các nút lưu, kết nối, làm mới, test quyền và ngắt kết nối chỉ áp dụng cho shop đang chọn.</span>`;
    }
    document.getElementById('shopeePartnerId').value = cfg.api_partner_id || '';
    document.getElementById('shopeePartnerKey').value = '';
    document.getElementById('shopeeRedirectUrl').value = cfg.api_redirect_url || `${API_BASE_URL}/channels/shopee/callback`;
    document.getElementById('shopeeVideoPartnerId').value = cfg.video_partner_id || '';
    document.getElementById('shopeeVideoPartnerKey').value = '';
    document.getElementById('shopeeVideoRedirectUrl').value = cfg.video_redirect_url || `${API_BASE_URL}/channels/shopee/video/callback`;
    const state = apiState(cfg);
    const videoState = videoApiState(cfg);
    const status = document.getElementById('shopeeApiStatus');
    if (status) {
      status.innerHTML = `
        <b style="color:${state.color};">${state.text}</b> cho shop <b>${selected}</b>.<br>
        Access token: ${remainingText(cfg.token_expire_at)}. Hệ thống sẽ tự làm mới bằng refresh token khi gần hết hạn.<br>
        Hạn ủy quyền refresh token: ${remainingText(cfg.api_refresh_expire_at, 'days')}. Nếu mục này hết hạn, bấm <b>Kết nối / Gia hạn</b> để đăng nhập lại.
      `;
    }
    const videoStatus = document.getElementById('shopeeVideoApiStatus');
    if (videoStatus) {
      const rawVideoUserId = String(cfg.video_api_user_id || '').trim();
      const rawVideoShopId = String(cfg.video_api_shop_id || cfg.api_shop_id || '').trim();
      const videoUserLabel = rawVideoUserId && cfg.video_auth_subject_type !== 'shop' && rawVideoUserId !== rawVideoShopId
        ? rawVideoUserId
        : 'Chưa có user_id hợp lệ';
      videoStatus.innerHTML = `
        <b style="color:${videoState.color};">${videoState.text}</b> cho shop <b>${selected}</b>.<br>
        Token video: ${remainingText(cfg.video_token_expire_at)}. User ID video: ${videoUserLabel}.<br>
        Hạn refresh video: ${remainingText(cfg.video_api_refresh_expire_at, 'days')}. ${cfg.video_permission_message || 'Sau khi kết nối, bấm Test quyền video để mở dashboard video.'}
      `;
    }
  }
