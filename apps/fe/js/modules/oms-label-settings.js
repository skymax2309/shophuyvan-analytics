import { API } from '../oms-api.js';
import { showToast } from '../utils/helpers.js';
import { wakeRadarLocal } from './oms-radar-helper.js';
import { createLabelVaultRenderers } from './oms-label-settings-render.js';
import { bindLabelModalEvents } from './oms-label-settings-events.js';

export const MM_TO_PT = 72 / 25.4;

const SETTINGS_KEY = 'oms_label_print_settings_v2';
const LEGACY_SETTINGS_KEY = 'oms_label_print_settings_v1';
const LABEL_LIMIT = 120;

const DEFAULT_PLATFORM_MARKS = {
  shopee: { text: 'SHOPEE', color: '#ee4d2d', watermark: 'Shopee SPX', carrier: 'SPX Express', tracking: 'SPXVN058799940701' },
  lazada: { text: 'LAZADA', color: '#1a4fd7', watermark: 'Lazada LEX', carrier: 'LEX VN', tracking: 'LMP0353769730VNA' },
  tiktok: { text: 'TIKTOK', color: '#111827', watermark: 'TikTok Shop', carrier: 'TikTok Shop', tracking: 'TTS240509085701' }
};

const TEMPLATE_SECTIONS = [
  { id: 'layout', name: 'Mẫu khổ in', type: 'layout', hint: 'A6, mã vận đơn và vùng QR', created: '07:10 - 09/05/26' },
  { id: 'watermark', name: 'Mẫu nội dung tem', type: 'text', hint: 'Tên hàng, SKU, ghi chú, mã vận đơn', created: '07:10 - 09/05/26' },
  { id: 'logo', name: 'Mẫu logo shop', type: 'image', hint: 'Logo nhận diện shop trên tem', created: '15:08 - 12/03/25' },
  { id: 'camera', name: 'Mẫu nhắc quay video', type: 'text', hint: 'REC, lời nhắc khui hàng và hotline', created: '09:55 - 10/03/25' }
];

const TEMPLATE_VARIABLES = [
  '@shop_name',
  '@order_sn',
  '@tracking_number',
  '@items_count',
  '@table_items',
  '@note'
];

const DEFAULT_SETTINGS = {
  fitMode: 'a6',
  widthMm: 105,
  heightMm: 148,
  marginMm: 2,
  shopMarkEnabled: false,
  shopMarkText: '',
  markPosition: 'top-left',
  logoDataUrl: '',
  logoSizeMm: 14,
  logoPosition: 'top-left',
  cameraPromptEnabled: true,
  cameraPromptText: 'Quay video khi khui hàng để được hỗ trợ khiếu nại/đổi trả.',
  footerText: 'Hotline khiếu nại và đổi trả sản phẩm | 0909128999',
  overlayEnabled: true,
  showItemName: true,
  showProductName: true,
  showSku: false,
  showCustomerNote: true,
  showSellerNote: false,
  showTracking: true,
  showOrderId: false,
  itemTextSize: 0,
  platformMarks: DEFAULT_PLATFORM_MARKS,
  templateCopies: []
};

const labelVaultState = {
  activeTab: 'warehouse',
  activePlatform: 'shopee',
  filters: { platform: '', q: '' },
  labels: [],
  summary: null,
  selected: new Set(),
  loading: false,
  loadedStatus: 'all',
  message: '',
  activeTemplateSection: 'watermark',
  previewSettings: null,
  previewSamples: {},
  previewLoading: {},
  previewErrors: {}
};

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    showToast('Logo hoặc cấu hình quá lớn, chưa lưu được vào trình duyệt.', 5000);
  }
}

function normalizePlatformMarks(value = {}) {
  const result = {};
  Object.entries(DEFAULT_PLATFORM_MARKS).forEach(([platform, fallback]) => {
    result[platform] = {
      ...fallback,
      ...(value[platform] || {})
    };
  });
  return result;
}

// Mẫu tuỳ chỉnh chỉ lưu phần định danh; nội dung chỉnh sửa vẫn dùng chung cấu hình tem để không bị lệch dữ liệu.
function templateSectionById(id) {
  return TEMPLATE_SECTIONS.find(section => section.id === id) || null;
}

function normalizeTemplateCopies(value = []) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      const sourceSection = templateSectionById(item?.sourceSection) ? item.sourceSection : 'watermark';
      const base = templateSectionById(sourceSection) || TEMPLATE_SECTIONS[1];
      const id = String(item?.id || `custom_${index}_${sourceSection}`).trim();
      if (!id) return null;
      return {
        id,
        sourceSection,
        type: item?.type || base.type,
        name: String(item?.name || `${base.name} bản sao`).trim(),
        hint: String(item?.hint || `Bản sao từ ${base.name}`).trim(),
        created: String(item?.created || base.created).trim(),
        createdAgo: String(item?.createdAgo || 'vừa tạo').trim(),
        isCustom: true
      };
    })
    .filter(Boolean)
    .slice(0, 20);
}

function normalizeSettings(value = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...value,
    overlayEnabled: value.overlayEnabled !== false,
    shopMarkEnabled: false,
    shopMarkText: '',
    platformMarks: normalizePlatformMarks(value.platformMarks || {}),
    templateCopies: normalizeTemplateCopies(value.templateCopies || [])
  };
}

function templateRows(settings) {
  const normalized = normalizeSettings(settings);
  return [
    ...TEMPLATE_SECTIONS,
    ...normalized.templateCopies
  ];
}

function templateBaseId(id, settings = labelVaultState.previewSettings || getLabelSettings()) {
  const key = String(id || '').trim();
  if (templateSectionById(key)) return key;
  const copy = normalizeSettings(settings).templateCopies.find(item => item.id === key);
  return templateSectionById(copy?.sourceSection) ? copy.sourceSection : 'watermark';
}

function templateCreatedAgo(section) {
  if (section.createdAgo) return section.createdAgo;
  return String(section.created || '').includes('09/05/26') ? '3 giờ trước' : 'một năm trước';
}

function templateCreatedNow() {
  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  return `${pad(now.getHours())}:${pad(now.getMinutes())} - ${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${String(now.getFullYear()).slice(-2)}`;
}

function addTemplateCopy(sourceSectionId) {
  const current = readTemplateSettingsFromModal();
  const baseId = templateBaseId(sourceSectionId, current);
  const base = templateSectionById(baseId) || TEMPLATE_SECTIONS[1];
  const copies = normalizeTemplateCopies(current.templateCopies);
  const copyNumber = copies.filter(item => item.sourceSection === base.id).length + 1;
  const copy = {
    id: `custom_${Date.now()}_${base.id}`,
    sourceSection: base.id,
    type: base.type,
    name: `${base.name} ${copyNumber + 1}`,
    hint: `Bản sao từ ${base.name}`,
    created: templateCreatedNow(),
    createdAgo: 'vừa tạo',
    isCustom: true
  };
  labelVaultState.previewSettings = normalizeSettings({
    ...current,
    templateCopies: [copy, ...copies]
  });
  labelVaultState.activeTemplateSection = copy.id;
  renderLabelVaultPanel();
  showToast('Đã thêm mẫu mới. Bấm Lưu mẫu in để giữ lại.', 4000);
}

function deleteTemplateSection(id) {
  const current = readTemplateSettingsFromModal();
  const copies = normalizeTemplateCopies(current.templateCopies);
  const nextCopies = copies.filter(item => item.id !== id);
  if (nextCopies.length === copies.length) {
    showToast('Mẫu mặc định của OMS chưa xoá thật; có thể tắt từng phần trong setting.', 4500);
    return;
  }
  labelVaultState.previewSettings = normalizeSettings({
    ...current,
    templateCopies: nextCopies
  });
  if (labelVaultState.activeTemplateSection === id) {
    labelVaultState.activeTemplateSection = templateBaseId(id, current);
  }
  renderLabelVaultPanel();
  showToast('Đã ẩn mẫu vừa tạo. Bấm Lưu mẫu in để giữ lại.', 4000);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function fmtNumber(value) {
  return Number(value || 0).toLocaleString('vi-VN');
}

function fmtBytes(value) {
  const bytes = Number(value || 0);
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function cleanOrderIds(value) {
  return [...new Set(String(value || '')
    .split(/[\s,;]+/)
    .map(item => item.trim())
    .filter(Boolean))];
}

function platformLabel(platform) {
  const key = String(platform || '').toLowerCase();
  if (key === 'shopee') return 'Shopee';
  if (key === 'lazada') return 'Lazada';
  if (key === 'tiktok') return 'TikTok';
  return platform || 'Chưa rõ sàn';
}

function statusLabel(row) {
  if (row?.error) return { text: 'Tem lỗi', cls: 'danger' };
  if (row?.storage_key) return { text: 'Đã lưu', cls: 'success' };
  return { text: 'Chưa có tem', cls: 'warning' };
}

function normalizePlatform(value) {
  return String(value || '').trim().toLowerCase();
}

function labelRefreshMode(row = {}) {
  const mode = String(row.refresh_mode || '').toLowerCase();
  const platform = normalizePlatform(row.platform);
  if (mode === 'api' || row.api_connected) return { text: 'Tải bằng API sàn', cls: 'api' };
  if (['shopee', 'lazada', 'tiktok'].includes(platform)) return { text: 'Tải bằng Chrome helper', cls: 'helper' };
  return { text: 'Cần nhập tay', cls: 'manual' };
}

function rowsForStatus(status = labelVaultState.loadedStatus || 'all') {
  if (status === 'error') return labelVaultState.labels.filter(row => row.error);
  if (status === 'ok') return labelVaultState.labels.filter(row => !row.error && row.storage_key);
  return labelVaultState.labels;
}

function selectedCountText() {
  return `${fmtNumber(labelVaultState.selected.size)} tem đã chọn`;
}

export function getLabelSettings() {
  const current = readJson(SETTINGS_KEY, null);
  if (current) return normalizeSettings(current);
  return normalizeSettings(readJson(LEGACY_SETTINGS_KEY, DEFAULT_SETTINGS));
}

export function saveLabelSettings(settings) {
  writeJson(SETTINGS_KEY, normalizeSettings(settings));
}

export function labelSizePoints(settings = getLabelSettings()) {
  return {
    width: Number(settings.widthMm || 105) * MM_TO_PT,
    height: Number(settings.heightMm || 148) * MM_TO_PT,
    margin: Number(settings.marginMm || 0) * MM_TO_PT
  };
}

export function asciiMarkText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .trim();
}

export function hasLabelOverlay(settings = getLabelSettings()) {
  const normalized = normalizeSettings(settings);
  if (normalized.overlayEnabled === false) return false;
  return Boolean(
    normalized.logoDataUrl ||
    normalized.cameraPromptEnabled ||
    normalized.footerText
  );
}

export function resolveLabelMark(order, settings = getLabelSettings()) {
  const normalized = normalizeSettings(settings);
  const platform = String(order?.platform || labelVaultState.activePlatform || '').toLowerCase();
  const platformMark = normalized.platformMarks?.[platform] || {};
  if (!hasLabelOverlay(normalized)) return null;
  return {
    // Không vẽ badge chữ shop/sàn lên tem vì phần này làm rối tem in thực tế.
    text: '',
    color: platformMark.color || '#3b82f6',
    position: normalized.markPosition || 'top-left',
    logoDataUrl: normalized.logoDataUrl || '',
    logoPosition: normalized.logoPosition || 'top-left',
    logoSizeMm: Number(normalized.logoSizeMm || 14),
    cameraPromptEnabled: !!normalized.cameraPromptEnabled,
    cameraText: asciiMarkText(normalized.cameraPromptText || ''),
    footerText: asciiMarkText(normalized.footerText || ''),
    watermark: asciiMarkText(platformMark.watermark || '')
  };
}

function buildLabelUrl(orderId, row = {}) {
  const ext = String(row.storage_key || '').toLowerCase().endsWith('.html')
    || String(row.content_type || '').toLowerCase().includes('html')
    ? 'html'
    : 'pdf';
  return `${API}/api/label/${encodeURIComponent(orderId)}.${ext}`;
}

function canUseLabelAsPreview(row = {}) {
  return !!row.order_id && !!row.storage_key && !row.error;
}

function findLoadedPreviewLabel(platform) {
  const key = normalizePlatform(platform);
  return (labelVaultState.labels || []).find(row => normalizePlatform(row.platform) === key && canUseLabelAsPreview(row)) || null;
}

function previewLabelForPlatform(platform) {
  const key = normalizePlatform(platform || labelVaultState.activePlatform);
  return labelVaultState.previewSamples[key] || null;
}

const { renderLabelVaultPanel, renderModalShell, renderTemplatePreview } = createLabelVaultRenderers({
  DEFAULT_PLATFORM_MARKS,
  TEMPLATE_SECTIONS,
  TEMPLATE_VARIABLES,
  labelVaultState,
  escapeHtml,
  fmtNumber,
  fmtBytes,
  platformLabel,
  statusLabel,
  labelRefreshMode,
  rowsForStatus,
  selectedCountText,
  templateRows,
  templateBaseId,
  templateCreatedAgo,
  templateSectionById,
  normalizePlatform,
  buildLabelUrl,
  previewLabelForPlatform,
  ensureRealLabelPreview,
  getLabelSettings
});

function updateTemplatePreviewOnly() {
  const preview = document.getElementById('labelTemplatePreview');
  if (!preview) return;
  preview.innerHTML = renderTemplatePreview(labelVaultState.previewSettings || getLabelSettings());
}

async function ensureRealLabelPreview(platform) {
  const key = normalizePlatform(platform || labelVaultState.activePlatform || 'shopee');
  if (!key || labelVaultState.previewSamples[key] || labelVaultState.previewLoading[key]) return;

  labelVaultState.previewLoading[key] = true;
  labelVaultState.previewErrors[key] = '';
  updateTemplatePreviewOnly();
  try {
    const params = new URLSearchParams({ platform: key, status: 'ok', limit: '12' });
    const response = await fetch(`${API}/api/labels/status?${params.toString()}`, { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new Error(data.error || 'Không lấy được tem thật để xem trước.');
    const candidates = [
      findLoadedPreviewLabel(key),
      ...(Array.isArray(data.labels) ? data.labels : [])
    ].filter(canUseLabelAsPreview);
    const seen = new Set();
    let sample = null;
    for (const row of candidates) {
      const rowKey = String(row.order_id || '');
      if (!rowKey || seen.has(rowKey)) continue;
      seen.add(rowKey);
      const labelResponse = await fetch(buildLabelUrl(row.order_id, row), { cache: 'no-store' });
      if (labelResponse.ok) {
        sample = row;
        break;
      }
    }
    if (sample) {
      labelVaultState.previewSamples[key] = sample;
    } else {
      labelVaultState.previewErrors[key] = `Chưa có file tem thật mở được cho ${platformLabel(key)} trong R2. Cần tải lại tem trước khi dùng làm mẫu.`;
    }
  } catch (error) {
    labelVaultState.previewErrors[key] = error.message || 'Không lấy được tem thật để xem trước.';
  } finally {
    labelVaultState.previewLoading[key] = false;
    updateTemplatePreviewOnly();
  }
}

function openRawLabel(orderId, row = {}) {
  if (!orderId) return;
  window.open(buildLabelUrl(orderId, row), '_blank');
}

function buildOrderMapForLabels(ids) {
  const map = new Map();
  ids.forEach(id => {
    const row = labelVaultState.labels.find(item => String(item.order_id) === String(id)) || {};
    map.set(String(id), {
      ...row,
      platform: row.platform || labelVaultState.activePlatform,
      shop_name: row.shop || row.shop_name || ''
    });
  });
  return map;
}

async function printLabelsWithOverlay(ids) {
  if (!ids.length) return showToast('Chưa chọn mã đơn để in lại.', 4000);
  try {
    const { printBatchLabelsCore } = await import('./oms-pdf.js?v=label-real-preview2-20260509');
    await printBatchLabelsCore(ids, buildOrderMapForLabels(ids));
  } catch (error) {
    showToast(error.message || 'Không in lại được tem từ kho.', 5000);
    ids.slice(0, 6).forEach((id, index) => {
      const row = labelVaultState.labels.find(item => String(item.order_id) === String(id)) || {};
      window.setTimeout(() => openRawLabel(id, row), index * 140);
    });
  }
}

async function refreshLabel(orderId) {
  const response = await fetch(`${API}/api/label/${encodeURIComponent(orderId)}/refresh`, { method: 'POST' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw new Error(data.error || 'Không tải lại được tem.');
  return data;
}

async function loadLabels(status = 'all') {
  const params = new URLSearchParams({
    limit: String(LABEL_LIMIT),
    status
  });
  if (labelVaultState.filters.platform) params.set('platform', labelVaultState.filters.platform);
  if (labelVaultState.filters.q) params.set('q', labelVaultState.filters.q);

  labelVaultState.loading = true;
  labelVaultState.loadedStatus = status;
  labelVaultState.message = '';
  renderLabelVaultPanel();
  try {
    const response = await fetch(`${API}/api/labels/status?${params.toString()}`, { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new Error(data.error || 'Không tải được kho tem.');
    labelVaultState.labels = Array.isArray(data.labels) ? data.labels : [];
    labelVaultState.summary = data.summary || null;
    labelVaultState.selected = new Set([...labelVaultState.selected].filter(id => labelVaultState.labels.some(row => row.order_id === id)));
  } catch (error) {
    labelVaultState.labels = [];
    labelVaultState.message = error.message;
  } finally {
    labelVaultState.loading = false;
    renderLabelVaultPanel();
  }
}

function readTemplateSettingsFromModal() {
  const modal = document.getElementById('labelSettingsModal');
  const current = labelVaultState.previewSettings || getLabelSettings();
  if (!modal) return current;
  return normalizeSettings({
    ...current,
    fitMode: modal.querySelector('#labelFitMode')?.value || current.fitMode || 'a6',
    widthMm: Number(modal.querySelector('#labelWidthMm')?.value || current.widthMm || 105),
    heightMm: Number(modal.querySelector('#labelHeightMm')?.value || current.heightMm || 148),
    marginMm: Number(modal.querySelector('#labelMarginMm')?.value || current.marginMm || 0),
    overlayEnabled: current.overlayEnabled !== false,
    templateCopies: current.templateCopies || [],
    shopMarkEnabled: false,
    shopMarkText: '',
    markPosition: current.markPosition || 'top-left',
    logoDataUrl: current.logoDataUrl || '',
    logoSizeMm: Number(modal.querySelector('#labelLogoSizeMm')?.value || current.logoSizeMm || 14),
    logoPosition: modal.querySelector('#labelLogoPosition')?.value || current.logoPosition || 'top-left',
    cameraPromptEnabled: modal.querySelector('#labelCameraPromptEnabled')
      ? !!modal.querySelector('#labelCameraPromptEnabled')?.checked
      : !!current.cameraPromptEnabled,
    cameraPromptText: modal.querySelector('#labelCameraPromptText')?.value || current.cameraPromptText || '',
    footerText: modal.querySelector('#labelFooterText')?.value || current.footerText || '',
    showItemName: modal.querySelector('#labelShowItemName')
      ? !!modal.querySelector('#labelShowItemName')?.checked
      : !!current.showItemName,
    showProductName: modal.querySelector('#labelShowProductName')
      ? !!modal.querySelector('#labelShowProductName')?.checked
      : !!current.showProductName,
    showSku: modal.querySelector('#labelShowSku')
      ? !!modal.querySelector('#labelShowSku')?.checked
      : !!current.showSku,
    showCustomerNote: modal.querySelector('#labelShowCustomerNote')
      ? !!modal.querySelector('#labelShowCustomerNote')?.checked
      : !!current.showCustomerNote,
    showSellerNote: modal.querySelector('#labelShowSellerNote')
      ? !!modal.querySelector('#labelShowSellerNote')?.checked
      : !!current.showSellerNote,
    showTracking: modal.querySelector('#labelShowTracking')
      ? !!modal.querySelector('#labelShowTracking')?.checked
      : !!current.showTracking,
    showOrderId: modal.querySelector('#labelShowOrderId')
      ? !!modal.querySelector('#labelShowOrderId')?.checked
      : !!current.showOrderId,
    itemTextSize: Number(modal.querySelector('#labelItemTextSize')?.value || current.itemTextSize || 0),
    platformMarks: current.platformMarks || DEFAULT_PLATFORM_MARKS
  });
}

function updatePreviewFromInputs() {
  labelVaultState.previewSettings = readTemplateSettingsFromModal();
  const preview = document.getElementById('labelTemplatePreview');
  if (preview) preview.innerHTML = renderTemplatePreview(labelVaultState.previewSettings);
}

function switchTab(tab) {
  labelVaultState.activeTab = tab;
  const modal = document.getElementById('labelSettingsModal');
  modal?.querySelectorAll('.label-vault-tab').forEach(button => {
    button.classList.toggle('active', button.dataset.labelTab === tab);
  });
  renderLabelVaultPanel();
  if (tab === 'warehouse') loadLabels('all');
  if (tab === 'errors') loadLabels('error');
  if (tab === 'actions' && !labelVaultState.summary) loadLabels('all');
}

async function loadLabelRowsForIds(ids) {
  const byId = new Map(labelVaultState.labels.map(row => [String(row.order_id || ''), row]));
  const rows = [];
  for (const id of ids) {
    const key = String(id || '').trim();
    if (!key) continue;
    if (byId.has(key)) {
      rows.push(byId.get(key));
      continue;
    }
    try {
      const response = await fetch(`${API}/api/labels/status?order_id=${encodeURIComponent(key)}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      rows.push({ order_id: key, ...data });
    } catch {
      rows.push({ order_id: key, refresh_mode: 'manual', error: 'Không đọc được trạng thái tem.' });
    }
  }
  return rows;
}

function groupRowsForHelper(rows) {
  const groups = new Map();
  const blocked = [];
  rows.forEach(row => {
    const platform = normalizePlatform(row.platform);
    const shop = String(row.shop || '').trim();
    const orderId = String(row.order_id || '').trim();
    if (!orderId) return;
    if (!platform || !shop) {
      blocked.push(row);
      return;
    }
    const key = `${platform}||${shop}`;
    if (!groups.has(key)) groups.set(key, { platform, shop, order_ids: [] });
    groups.get(key).order_ids.push(orderId);
  });
  return { groups: [...groups.values()], blocked };
}

async function createLabelRefreshJob(group) {
  const now = new Date();
  const response = await fetch(`${API}/api/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task_type: 'refresh_label',
      shop_name: group.shop,
      platform: group.platform,
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      payload: JSON.stringify({
        order_ids: group.order_ids,
        download_only: true,
        source: 'label_vault_refresh'
      })
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw new Error(data.error || `Không tạo được job tải tem cho ${group.shop}`);
  return data;
}

async function refreshHelperRows(rows) {
  const { groups, blocked } = groupRowsForHelper(rows);
  const jobs = [];
  for (const group of groups) {
    const job = await createLabelRefreshJob(group);
    jobs.push({ ...job, group });
  }
  if (jobs[0]?.id) {
    await wakeRadarLocal('refresh_label', jobs[0].id);
  }
  return {
    jobCount: jobs.length,
    orderCount: groups.reduce((sum, group) => sum + group.order_ids.length, 0),
    blockedCount: blocked.length
  };
}

async function refreshSelectedLabels(ids) {
  if (!ids.length) return showToast('Chưa chọn mã đơn để tải lại tem.', 4000);
  const rows = await loadLabelRowsForIds(ids);
  const apiRows = [];
  const helperRows = [];
  rows.forEach(row => {
    const platform = normalizePlatform(row.platform);
    if ((row.api_connected || row.refresh_mode === 'api') && ['shopee', 'lazada'].includes(platform)) {
      apiRows.push(row);
    } else {
      helperRows.push(row);
    }
  });
  let ok = 0;
  let fail = 0;
  for (const row of apiRows) {
    try {
      await refreshLabel(row.order_id);
      ok++;
    } catch {
      fail++;
    }
  }
  let helperResult = { jobCount: 0, orderCount: 0, blockedCount: 0 };
  if (helperRows.length) {
    try {
      helperResult = await refreshHelperRows(helperRows);
    } catch {
      fail += helperRows.length;
    }
  }
  const parts = [];
  if (apiRows.length) parts.push(`API: tải lại ${ok}/${apiRows.length} tem`);
  if (helperResult.orderCount) parts.push(`Chrome helper: đã gửi ${helperResult.orderCount} tem / ${helperResult.jobCount} shop`);
  if (helperResult.blockedCount) parts.push(`thiếu shop/sàn ${helperResult.blockedCount} tem`);
  if (fail) parts.push(`lỗi ${fail} tem`);
  showToast(parts.join(' · ') || 'Đã gửi lệnh tải lại tem.', 6000);
  loadLabels(labelVaultState.activeTab === 'errors' ? 'error' : 'all');
}

function openSelectedLabels(ids) {
  if (!ids.length) return showToast('Chưa chọn mã đơn để in lại.', 4000);
  printLabelsWithOverlay(ids.slice(0, 80));
  if (ids.length > 80) showToast('Đã lấy 80 tem đầu tiên để tránh file in quá nặng.', 5000);
}

function currentWarehouseStatus() {
  if (labelVaultState.activeTab === 'errors') return 'error';
  return labelVaultState.loadedStatus === 'ok' ? 'ok' : 'all';
}

function selectRows(rows, checked = true) {
  rows.forEach(row => {
    const id = String(row.order_id || '').trim();
    if (!id) return;
    if (checked) labelVaultState.selected.add(id);
    else labelVaultState.selected.delete(id);
  });
  renderLabelVaultPanel();
}

function ensureModal() {
  let modal = document.getElementById('labelSettingsModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'labelSettingsModal';
    document.body.appendChild(modal);
  }
  renderModalShell(modal);
  bindLabelModalEvents(modal, {
    labelVaultState,
    showToast,
    switchTab,
    loadLabels,
    rowsForStatus,
    currentWarehouseStatus,
    selectRows,
    renderLabelVaultPanel,
    refreshSelectedLabels,
    printLabelsWithOverlay,
    openSelectedLabels,
    cleanOrderIds,
    readTemplateSettingsFromModal,
    normalizeSettings,
    addTemplateCopy,
    deleteTemplateSection,
    saveLabelSettings,
    updatePreviewFromInputs
  });
  return modal;
}

export function openLabelSettingsModal() {
  const modal = ensureModal();
  labelVaultState.previewSettings = getLabelSettings();
  labelVaultState.message = '';
  modal.classList.add('open');
  switchTab(labelVaultState.activeTab || 'warehouse');
}

export function initLabelSettings() {
  ensureModal();
}
