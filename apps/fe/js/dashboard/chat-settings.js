const API = (window.SHOPHUYVAN_CHAT_API_BASE || "https://shophuyvan-chat-api.zacha030596.workers.dev").replace(/\/+$/, "");
const ZALO_HELPER = (window.SHOPHUYVAN_ZALO_HELPER_BASE || "http://127.0.0.1:8794").replace(/\/+$/, "");

const DEFAULT_KEYWORDS = [
  "shopee",
  "lazada",
  "tiktok",
  "zalo",
  "facebook",
  "web",
  "website",
  "sdt",
  "số điện thoại",
  "điện thoại",
  "hotline",
  "zalo.me",
  "messenger"
];
const DEFAULT_PATTERN_LABELS = ["định dạng số điện thoại", "định dạng website"];

const state = {
  settings: {},
  keywords: [...DEFAULT_KEYWORDS],
  patterns: [...DEFAULT_PATTERN_LABELS],
  knowledge: [],
  learningAudit: [],
  pendingDeleteKb: "",
  stats: null,
  zaloHelper: null
};

let previewSeq = 0;

const $ = (id) => document.getElementById(id);
const chatAgentSettings = window.ShopHuyVanChatAgentSettings;
const chatKnowledgeSettings = window.ShopHuyVanChatKnowledgeSettings;
const automationBrowserSettings = window.ShopHuyVanAutomationBrowserSettings;

async function api(path, opt = {}) {
  const response = await fetch(API + path, {
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    ...opt
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.error_message || data.message || data.error || "API lỗi");
  }
  return data;
}

async function zaloApi(path, opt = {}) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 3000);
  let response;
  try {
    response = await fetch(ZALO_HELPER + path, {
      cache: "no-store",
      signal: controller.signal,
      targetAddressSpace: "loopback",
      headers: { "Content-Type": "application/json" },
      ...opt
    });
  } catch (error) {
    throw new Error(
      error?.name === "AbortError"
        ? "Zalo local helper chưa phản hồi. Kiểm tra server 8794 rồi bấm Làm mới."
        : "Chrome đang chặn quyền Local Network Access tới Zalo helper 8794. Hãy cho phép website truy cập mạng nội bộ/loopback rồi bấm Làm mới."
    );
  } finally {
    window.clearTimeout(timer);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.error_message || data.message || data.error || "Zalo local chưa sẵn sàng");
  }
  return data;
}

function escapeHtml(text = "") {
  return String(text || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function toast(message, type = "ok") {
  const toastEl = $("toast");
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.className = `toast ${type}`;
  toastEl.hidden = false;
  window.setTimeout(() => {
    toastEl.hidden = true;
  }, 3500);
}

function fmtTime(value) {
  if (!value) return "Chưa có";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Chưa có";
  return parsed.toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "2-digit"
  });
}

function setHtml(id, html) {
  const el = $(id);
  if (el) el.innerHTML = html;
}

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

function settingsRuntime() {
  return { $, state, setHtml, setText, fmtTime, api, toast, withPending, loadAll };
}

function setZaloControls(enabled) {
  ["zaloScanSeconds", "saveZaloLocalBtn", "syncZaloHistoryBtn", "disableZaloAutoReplyBtn", "saveZaloAiConfigBtn"].forEach((id) => {
    const el = $(id);
    if (el) el.disabled = !enabled;
  });
  $("zaloLocalCard")?.classList.toggle("settings-offline", !enabled);
}

async function withPending(button, work, label = "Đang xử lý...") {
  if (!button || button.disabled) return undefined;
  const oldText = button.textContent;
  button.disabled = true;
  button.textContent = label;
  try {
    return await work();
  } finally {
    button.disabled = false;
    button.textContent = oldText;
  }
}

function settingPatch(options = {}) {
  const runtime = settingsRuntime();
  const agentConfig = chatAgentSettings.collectAgentConfig(runtime, { stamp: options.stampAgent === true });
  const zaloConfig = chatAgentSettings.collectZaloReplyConfig(runtime, { stamp: options.stampZalo === true });
  const aiLearningNotes = chatAgentSettings.mergedLearningNotesWithAgentAndZalo(runtime, agentConfig, zaloConfig);
  return {
    ai_provider: $("aiProvider").value,
    ai_model: $("aiModel").value.trim() || "gemini-2.5-flash",
    ai_mode: $("aiMode").value,
    ai_learning_notes: aiLearningNotes,
    chat_ai_agent_config: agentConfig,
    zalo_reply_config: zaloConfig,
    restricted_keywords: state.keywords,
    poll_interval_seconds: Number($("pollSeconds").value),
    browser_helper_poll_seconds: Number($("helperSeconds").value),
    ...(automationBrowserSettings?.collect(settingsRuntime()) || {}),
    sync_limit: Number($("syncLimit").value),
    force_history: $("forceHistory").checked,
    allow_auto_send: $("allowAutoSend").checked,
    auto_reply_minutes: Number($("autoReplyMinutes").value || 5)
  };
}

function geminiPayload() {
  const payload = settingPatch();
  const keys = $("geminiKeys").value.trim();
  if (keys) payload.gemini_api_keys_input = keys;
  return payload;
}

function updateRangeLabels() {
  setText("pollValue", $("pollSeconds").value);
  setText("helperValue", $("helperSeconds").value);
  if ($("zaloScanSeconds")) setText("zaloScanValue", $("zaloScanSeconds").value);
}

async function loadAll() {
  const [settings, stats, aiStatus, notifications, knowledge, learningAudit, zalo] = await Promise.all([
    api("/api/chat/settings"),
    api("/api/chat/settings/stats"),
    api("/api/chat/ai/status"),
    api("/api/chat/notifications/status").catch(() => ({})),
    api("/api/chat/ai/knowledge?include_disabled=true&limit=10000"),
    api("/api/chat/ai/learning-audit?limit=30").catch(() => ({ entries: [] })),
    zaloApi("/api/automation/slots").catch((error) => ({ ok: false, error_message: error.message }))
  ]);

  state.settings = settings.settings || {};
  state.stats = stats;
  state.knowledge = knowledge.entries || [];
  state.learningAudit = learningAudit.entries || [];
  state.pendingDeleteKb = "";
  state.zaloHelper = zalo;
  state.keywords = state.settings.restricted_keywords_public || state.settings.restricted_keywords || DEFAULT_KEYWORDS;
  state.patterns = state.settings.restricted_patterns_public || DEFAULT_PATTERN_LABELS;

  fillSettings(aiStatus || {}, notifications || {});
  renderAll();
}

function fillSettings(aiStatus, notifications) {
  $("aiProvider").value = state.settings.ai_provider || "gemini";
  $("aiModel").value = state.settings.ai_model || "gemini-2.5-flash";
  $("aiMode").value = state.settings.ai_mode || "suggest_only";
  $("learningNotes").value = state.settings.ai_learning_notes || "";
  $("pollSeconds").value = state.settings.poll_interval_seconds || 15;
  $("helperSeconds").value = state.settings.browser_helper_poll_seconds || 45;
  automationBrowserSettings?.fill(settingsRuntime());
  $("syncLimit").value = state.settings.sync_limit || 30;
  $("forceHistory").checked = state.settings.force_history === true;
  $("allowAutoSend").checked = state.settings.allow_auto_send === true;
  $("autoReplyMinutes").value = state.settings.auto_reply_minutes || 5;

  const keyCount = Number(aiStatus.gemini_key_count ?? state.settings.gemini_api_key_count ?? 0) || 0;
  const aiClass = aiStatus.ai_status === "active" ? "ok" : aiStatus.ai_status === "error" ? "bad" : "warn";
  setHtml(
    "aiStatus",
    `<span class="badge ${aiClass}">${escapeHtml(aiStatus.ai_status_message || "Chưa cấu hình")}</span><p>Model: ${escapeHtml(aiStatus.ai_model || "")} · Đã lưu ${keyCount}/5 key</p>`
  );
  setHtml("geminiSavedStatus", `<span class="badge ${keyCount ? "ok" : "warn"}">Đã lưu ${keyCount}/5 key Gemini</span>`);
  setText(
    "learningStatus",
    `Đã học ${state.stats?.knowledge_entries || 0} câu trả lời tốt. Tự trả lời sau ${$("autoReplyMinutes").value} phút khi đủ an toàn.`
  );
  $("vapidKey").value = notifications.vapid_public_key || "";
  setText("pushCount", `${notifications.subscriptions || 0} thiết bị đang đăng ký`);
  updateRangeLabels();
  chatAgentSettings.fillAgentConfig(settingsRuntime());
  chatAgentSettings.fillZaloReplyConfig(settingsRuntime());
}

function renderAll() {
  renderStatus();
  renderStats();
  renderSyncRows();
  renderZaloLocal();
  renderKeywords();
  renderKnowledge();
}

function renderStatus() {
  const channelStates = {
    shopee: ["warn", "cần kiểm tra"],
    lazada: ["warn", "cần kiểm tra"],
    tiktok: ["warn", "cần kiểm tra"],
    facebook: ["ok", "social riêng"],
    zalo: ["ok", "helper local"]
  };
  setHtml(
    "channelStatus",
    Object.entries(channelStates)
      .map(([channel, status]) => `<span class="badge ${status[0]}">${channel}: ${status[1]}</span>`)
      .join("")
  );
  setText("wsStatus", "Polling fallback đang bật");
}

function renderStats() {
  const stats = state.stats || {};
  setHtml(
    "statsBox",
    [
      `<span class="badge">Hội thoại ${stats.conversations_total || 0}</span>`,
      `<span class="badge">Tin nhắn ${stats.messages_total || 0}</span>`,
      `<span class="badge">AI ${stats.ai_suggestions_total || 0}</span>`,
      `<span class="badge">Đã học ${stats.knowledge_entries || 0}</span>`
    ].join("")
  );
  setHtml(
    "dbStats",
    [
      `<span class="badge">Conversations ${stats.conversations_total || 0}</span>`,
      `<span class="badge">Messages ${stats.messages_total || 0}</span>`,
      `<span class="badge">Knowledge ${stats.knowledge_entries || 0}</span>`,
      `<span class="badge">Push ${stats.push_subscriptions_active || 0}</span>`
    ].join("")
  );
}

function renderSyncRows() {
  const rows = state.stats?.sync_states || [];
  setHtml(
    "syncRows",
    rows.length
      ? rows.map((row) => `
        <tr>
          <td>${escapeHtml(row.channel)}</td>
          <td>${escapeHtml(row.shop_id)}</td>
          <td>${escapeHtml(row.last_success_at || row.last_synced_at || "Chưa có")}</td>
          <td>${escapeHtml(row.last_error_message || "")}</td>
        </tr>
      `).join("")
      : "<tr><td>Chưa có trạng thái sync.</td></tr>"
  );
}

function renderZaloLocal() {
  const data = state.zaloHelper || {};
  if (data.ok === false) {
    setZaloControls(false);
    setText("zaloScanValue", "--");
    setHtml(
      "zaloLocalStatus",
      `<span class="badge bad">Zalo trên máy chưa kết nối</span><p class="settings-note">${escapeHtml(data.error_message || "Mở chương trình kết nối Zalo rồi bấm Làm mới để đọc lại cấu hình thật.")}</p>`
    );
    setHtml("zaloSchedulerStatus", "");
    setHtml("zaloSlotStatus", "");
    setHtml("zaloSafeMode", "");
    setHtml("zaloAutoRuleStatus", "");
    setHtml("zaloAccountAiRows", "");
    return;
  }

  setZaloControls(true);
  const settings = data.automationSettings || {};
  const scheduler = data.automationScheduler || {};
  const scanSeconds = Number(settings.scanIntervalSeconds || 30) || 30;
  const slots = Array.isArray(data.slots) ? data.slots : [];
  const accounts = Array.isArray(data.aiAutoReplyAccounts) ? data.aiAutoReplyAccounts : [];
  const autoRules = data.autoRules || {};
  const hasAccountAi = accounts.some((account) => account.aiEnabled);
  const hasUnsafeAutoRule = Boolean(autoRules.autoWelcomeOnNewFriend || autoRules.autoGreetOnFirstInbound);
  const localAutoReplyEnabled = Boolean(data.autoSendEnabled && data.localAiReplyEnabled && hasAccountAi);
  const safeMode = !localAutoReplyEnabled && !hasUnsafeAutoRule;

  $("zaloScanSeconds").value = scanSeconds;
  setText("zaloScanValue", scanSeconds);

  const port = data.server?.port || 8794;
  const bridgeText = data.shophuyvanChatBridge?.configured ? "đã nối Chat chung" : "chưa nối Chat chung";
  setHtml(
    "zaloLocalStatus",
    `<span class="badge ${data.shophuyvanChatBridge?.configured ? "ok" : "warn"}">Đang chạy cổng ${port}</span><p>${bridgeText} · AI trên máy ${data.localAiReplyEnabled ? "đang bật" : "đang tắt"} · Tự gửi ${data.autoSendEnabled ? "đang bật" : "đang tắt"}</p>`
  );

  const schedulerOk = scheduler.running && !scheduler.lastError;
  setHtml(
    "zaloSchedulerStatus",
    [
      `<div class="settings-stat"><b>Scheduler</b><span class="${schedulerOk ? "ok" : "warn"}">${scheduler.busy ? "Đang quét" : scheduler.running ? "Đang bật" : "Chưa bật"}</span></div>`,
      `<div class="settings-stat"><b>Lần quét cuối</b><span>${fmtTime(scheduler.lastFinishedAt || scheduler.lastStartedAt)}</span></div>`,
      `<div class="settings-stat"><b>Lần kế tiếp</b><span>${fmtTime(scheduler.nextRunAt)}</span></div>`,
      `<div class="settings-stat"><b>Lỗi cuối</b><span>${scheduler.lastError ? escapeHtml(scheduler.lastError) : "Không có"}</span></div>`
    ].join("")
  );

  setHtml(
    "zaloSlotStatus",
    slots.length
      ? slots.map((slot, index) => `<span class="badge ${slot.ok || slot.loggedIn ? "ok" : "warn"}">Profile ${index + 1}: ${slot.ok || slot.loggedIn ? "đang mở" : "cần kiểm tra"}</span>`).join("")
      : `<span class="badge warn">Chưa thấy profile Zalo</span>`
  );

  setHtml(
    "zaloSafeMode",
    safeMode
      ? `<strong>Chế độ an toàn đang bật</strong>Zalo trên máy chỉ đồng bộ và gửi tay. AI trên máy không được tự gửi tin cho khách.`
      : `<strong>Cần kiểm tra tự động</strong>Đang còn ít nhất một rule hoặc tài khoản có thể tự phản hồi. Bấm "Tắt tự trả lời Zalo" để khóa lại.`
  );

  setHtml(
    "zaloAutoRuleStatus",
    [
      `<div class="settings-stat"><b>AI trên máy</b><span class="${data.localAiReplyEnabled ? "warn" : "ok"}">${data.localAiReplyEnabled ? "Đang bật" : "Đang tắt"}</span></div>`,
      `<div class="settings-stat"><b>Bộ gửi tự động</b><span class="${data.autoSendEnabled ? "warn" : "ok"}">${data.autoSendEnabled ? "Đang bật" : "Đang tắt"}</span></div>`,
      `<div class="settings-stat"><b>Chào bạn mới</b><span class="${autoRules.autoWelcomeOnNewFriend ? "warn" : "ok"}">${autoRules.autoWelcomeOnNewFriend ? "Đang bật" : "Đang tắt"}</span></div>`,
      `<div class="settings-stat"><b>Chào tin đầu</b><span class="${autoRules.autoGreetOnFirstInbound ? "warn" : "ok"}">${autoRules.autoGreetOnFirstInbound ? "Đang bật" : "Đang tắt"}</span></div>`
    ].join("")
  );

  setHtml(
    "zaloAccountAiRows",
    accounts.length
      ? accounts.map((account) => `
        <div class="settings-zalo-account">
          <div>
            <b>${escapeHtml(account.name || account.id)}</b>
            <span>${account.connected ? "Đang kết nối" : "Cần kiểm tra"} · AI ${account.aiEnabled ? "đang bật" : "đang tắt"}</span>
          </div>
          ${
            account.aiEnabled
              ? `<button class="btn danger" data-zalo-account-ai-off="${escapeHtml(account.id)}">Tắt AI</button>`
              : `<span class="badge ok">Đang tắt</span>`
          }
        </div>
      `).join("")
      : `<p class="muted">Chưa có tài khoản Zalo automation.</p>`
  );
}

function renderKeywords() {
  const systemChips = (state.patterns || DEFAULT_PATTERN_LABELS)
    .map((keyword) => `<span class="chip"><b>Hệ thống</b> ${escapeHtml(keyword)}</span>`)
    .join("");
  const keywordChips = state.keywords
    .map((keyword) => `<span class="chip">${escapeHtml(keyword)}<button data-del-keyword="${escapeHtml(keyword)}">x</button></span>`)
    .join("");
  setHtml("keywordChips", systemChips + keywordChips);
  previewKeyword();
}

function blockedTerms(text) {
  const normalizedText = normalizeText(text);
  return state.keywords.filter((keyword) => normalizedText.includes(normalizeText(keyword)));
}

async function previewKeyword() {
  const text = $("keywordPreview").value;
  const seq = ++previewSeq;
  const hits = blockedTerms(text);
  let html = escapeHtml(text);
  for (const keyword of hits) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    html = html.replace(new RegExp(escaped, "ig"), (match) => `<mark>${match}</mark>`);
  }

  setHtml("keywordPreviewResult", html || `<span class="muted">Chưa nhập câu test.</span>`);
  if (!text.trim()) return;

  try {
    const result = await api("/api/chat/policy/check", {
      method: "POST",
      body: JSON.stringify({ text, settings: { ...settingPatch(), restricted_keywords: state.keywords } })
    });
    if (seq !== previewSeq) return;
    if (result.allowed === false || result.policy_status === "blocked") {
      setHtml(
        "keywordPreviewResult",
        `<p><span class="badge bad">Bị chặn</span></p><p>Không thể gửi vì có: ${(result.blocked_terms || []).map(escapeHtml).join(", ")}</p><div>${html}</div>`
      );
    } else {
      setHtml("keywordPreviewResult", `<p><span class="badge ok">Có thể gửi chat sàn</span></p><div>${html}</div>`);
    }
  } catch (error) {
    if (seq === previewSeq) setHtml("keywordPreviewResult", `<span class="badge bad">Không kiểm tra được policy</span>`);
  }
}

function renderKnowledge() {
  if (chatKnowledgeSettings?.renderKnowledge) {
    chatKnowledgeSettings.renderKnowledge(settingsRuntime());
    return;
  }
  setHtml(
    "kbRows",
    state.knowledge.length
      ? state.knowledge.map((entry) => `
        <tr>
          <td>${escapeHtml(entry.question || "")}</td>
          <td>${escapeHtml(entry.answer || "")}</td>
          <td class="mono">${Number(entry.use_count || 0) || 0}</td>
          <td><button class="btn danger" data-del-kb="${escapeHtml(entry.id)}">Xóa</button></td>
        </tr>
      `).join("")
      : `<tr><td colspan="4">Chưa có dữ liệu học.</td></tr>`
  );
}

async function disableZaloAutoReply() {
  const data = state.zaloHelper || {};
  const accounts = Array.isArray(data.aiAutoReplyAccounts) ? data.aiAutoReplyAccounts : [];
  await zaloApi("/api/settings", {
    method: "PATCH",
    body: JSON.stringify({
      autoWelcomeOnNewFriend: false,
      autoGreetOnFirstInbound: false
    })
  });
  await Promise.all(accounts
    .filter((account) => account.aiEnabled)
    .map((account) => zaloApi(`/api/accounts/${encodeURIComponent(account.id)}/ai`, {
      method: "PATCH",
      body: JSON.stringify({ enabled: false })
    })));
  toast("Đã tắt tự trả lời Zalo trên helper local");
  await loadAll();
}

async function saveZaloAiConfig() {
  const runtime = settingsRuntime();
  const config = chatAgentSettings.collectZaloReplyConfig(runtime, { stamp: true });
  const agentConfig = chatAgentSettings.collectAgentConfig(runtime);
  const aiLearningNotes = chatAgentSettings.mergedLearningNotesWithAgentAndZalo(runtime, agentConfig, config);
  await api("/api/chat/settings", {
    method: "POST",
    body: JSON.stringify({
      settings: {
        chat_ai_agent_config: agentConfig,
        zalo_reply_config: config,
        ai_learning_notes: aiLearningNotes
      }
    })
  });
  $("learningNotes").value = aiLearningNotes;

  let mirrored = true;
  try {
    await zaloApi("/api/settings", {
      method: "PATCH",
      body: JSON.stringify({
        welcomeMessageTemplate: config.welcome_template,
        firstInboundGreetingTemplate: config.first_inbound_template,
        autoWelcomeOnNewFriend: false,
        autoGreetOnFirstInbound: false
      })
    });
  } catch {
    mirrored = false;
  }

  toast(
    mirrored
      ? "Đã lưu cách trả lời và train AI Zalo. Tự gửi vẫn đang khóa an toàn."
      : "Đã lưu trên website. Mở Zalo local rồi bấm lưu lại để đồng bộ mẫu câu.",
    mirrored ? "ok" : "warn"
  );
  await loadAll();
}

async function saveAgentConfig() {
  const runtime = settingsRuntime();
  const agentConfig = chatAgentSettings.collectAgentConfig(runtime, { stamp: true });
  const zaloConfig = chatAgentSettings.collectZaloReplyConfig(runtime);
  const aiLearningNotes = chatAgentSettings.mergedLearningNotesWithAgentAndZalo(runtime, agentConfig, zaloConfig);
  await api("/api/chat/settings", {
    method: "POST",
    body: JSON.stringify({
      settings: {
        ...settingPatch({ stampAgent: true }),
        chat_ai_agent_config: agentConfig,
        zalo_reply_config: zaloConfig,
        ai_learning_notes: aiLearningNotes
      }
    })
  });
  $("learningNotes").value = aiLearningNotes;
  toast("Đã lưu cấu hình huấn luyện AI. Zalo vẫn ở chế độ nhân viên duyệt.");
  await loadAll();
}

document.getElementById("tabs").onclick = (event) => {
  const button = event.target.closest("button[data-tab]");
  if (!button) return;
  document.querySelectorAll(".nav button,.tab").forEach((node) => node.classList.remove("active"));
  button.classList.add("active");
  $(button.dataset.tab).classList.add("active");
};

document.addEventListener("input", (event) => {
  if (["pollSeconds", "helperSeconds", "zaloScanSeconds"].includes(event.target.id)) updateRangeLabels();
  if (event.target.id === "keywordPreview") previewKeyword();
  if (event.target.id === "resetConfirm") $("resetBtn").disabled = event.target.value !== "XAC NHAN";
  if (["kbSearch", "kbStatusFilter"].includes(event.target.id)) renderKnowledge();
});

document.addEventListener("change", (event) => {
  if (["kbSearch", "kbStatusFilter"].includes(event.target.id)) renderKnowledge();
});

document.addEventListener("click", async (event) => {
  if (await chatKnowledgeSettings?.handleKnowledgeClick?.(settingsRuntime(), event)) return;
  const keyword = event.target.dataset.delKeyword;
  if (keyword) {
    state.keywords = state.keywords.filter((item) => item !== keyword);
    renderKeywords();
  }

  const accountId = event.target.dataset.zaloAccountAiOff;
  if (accountId) {
    await zaloApi(`/api/accounts/${encodeURIComponent(accountId)}/ai`, {
      method: "PATCH",
      body: JSON.stringify({ enabled: false })
    });
    toast("Đã tắt AI cho tài khoản Zalo");
    await loadAll();
  }
});

$("reloadBtn").onclick = () => loadAll().then(() => toast("Đã làm mới")).catch((error) => toast(error.message, "bad"));
$("syncBtn").onclick = () => api("/api/chat/sync", {
  method: "POST",
  body: JSON.stringify({ channel: "shopee", limit: 30 })
}).then(() => toast("Đã gửi lệnh sync")).catch((error) => toast(error.message, "bad"));

$("saveGeminiBtn").onclick = () => withPending($("saveGeminiBtn"), async () => {
  const hasNewKeys = Boolean($("geminiKeys").value.trim());
  await api("/api/chat/settings", {
    method: "POST",
    body: JSON.stringify({ settings: geminiPayload() })
  });
  $("geminiKeys").value = "";
  toast(hasNewKeys ? "Đã thêm key mới, key cũ vẫn được giữ" : "Không có key mới, đã giữ nguyên key đang lưu");
  await loadAll();
});

$("toggleKeysBtn").onclick = () => $("geminiKeys").classList.toggle("masked");

$("testGeminiBtn").onclick = () => withPending($("testGeminiBtn"), async () => {
  const result = await api("/api/chat/ai/test", {
    method: "POST",
    body: JSON.stringify(geminiPayload())
  }).catch((error) => ({ ok: false, error_message: error.message }));
  const message = result.ok ? `Gemini hoạt động tốt. Đã nhận ${result.key_count || 0}/5 key.` : result.error_message || "Gemini lỗi.";
  setText("geminiResult", message);
  toast(message, result.ok ? "ok" : "bad");
  await loadAll();
});

$("saveAiBtn").onclick = () => withPending($("saveAiBtn"), async () => {
  await api("/api/chat/settings", {
    method: "POST",
    body: JSON.stringify({ settings: settingPatch() })
  });
  toast("Đã lưu cài đặt AI");
  await loadAll();
});

$("saveLearningBtn").onclick = () => withPending($("saveLearningBtn"), async () => {
  await api("/api/chat/settings", {
    method: "POST",
    body: JSON.stringify({ settings: settingPatch() })
  });
  toast("Đã lưu bộ nhớ AI");
  await loadAll();
});

$("saveAgentConfigBtn").onclick = () => withPending($("saveAgentConfigBtn"), saveAgentConfig);

$("saveChannelBtn").onclick = () => withPending($("saveChannelBtn"), async () => {
  await api("/api/chat/settings", {
    method: "POST",
    body: JSON.stringify({ settings: settingPatch() })
  });
  toast("Đã lưu cài đặt kênh");
  await loadAll();
});

automationBrowserSettings?.bind(settingsRuntime());

$("saveZaloLocalBtn").onclick = () => withPending($("saveZaloLocalBtn"), async () => {
  await zaloApi("/api/settings", {
    method: "PATCH",
    body: JSON.stringify({
      automationScanIntervalSeconds: Number($("zaloScanSeconds").value),
      autoWelcomeOnNewFriend: false,
      autoGreetOnFirstInbound: false
    })
  });
  toast("Đã lưu chu kỳ quét Zalo và giữ chế độ an toàn");
  await loadAll();
});

$("syncZaloHistoryBtn").onclick = () => withPending($("syncZaloHistoryBtn"), async () => {
  const result = await zaloApi("/api/shophuyvan-chat/sync-history", {
    method: "POST",
    body: JSON.stringify({ limit: 20, deep: true })
  });
  const message = `Đã quét ${result.conversations_scanned || 0} hội thoại, đọc ${result.messages_synced || 0} tin, lưu ${result.saved_messages || 0} tin mới.`;
  setText("zaloHistoryResult", message);
  toast(message, result.errors?.length ? "bad" : "ok");
});

$("disableZaloAutoReplyBtn").onclick = () => withPending($("disableZaloAutoReplyBtn"), disableZaloAutoReply);
$("saveZaloAiConfigBtn").onclick = () => withPending($("saveZaloAiConfigBtn"), saveZaloAiConfig);

$("addKbBtn").onclick = () => chatKnowledgeSettings?.addKnowledge(settingsRuntime());
$("kbRows").onclick = (event) => chatKnowledgeSettings?.handleKnowledgeClick?.(settingsRuntime(), event);
$("kbRows").onpointerup = (event) => chatKnowledgeSettings?.handleKnowledgeClick?.(settingsRuntime(), event);
$("kbCancelEditBtn").onclick = () => {
  chatKnowledgeSettings?.resetForm(settingsRuntime());
  renderKnowledge();
};

$("addKeywordBtn").onclick = () => {
  const value = $("keywordInput").value.trim();
  if (value && !state.keywords.includes(value)) state.keywords.push(value);
  $("keywordInput").value = "";
  renderKeywords();
};

$("importKeywordBtn").onclick = () => {
  const imported = $("keywordImport").value.split(/[\n,;]/).map((item) => item.trim()).filter(Boolean);
  state.keywords = [...new Set([...state.keywords, ...imported])];
  $("keywordImport").value = "";
  renderKeywords();
};

$("defaultKeywordBtn").onclick = () => {
  state.keywords = [...DEFAULT_KEYWORDS];
  renderKeywords();
};

$("saveKeywordBtn").onclick = () => withPending($("saveKeywordBtn"), async () => {
  await api("/api/chat/settings", {
    method: "POST",
    body: JSON.stringify({ settings: { ...settingPatch(), restricted_keywords: state.keywords } })
  });
  toast("Đã lưu từ khóa chat sàn");
  await loadAll();
});

$("allowPushBtn").onclick = () => withPending($("allowPushBtn"), async () => {
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Trình duyệt chưa cho phép thông báo");

  const status = await api("/api/chat/notifications/status");
  const key = status.vapid_public_key;
  const applicationServerKey = Uint8Array.from(
    atob((key + "=".repeat((4 - key.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/")),
    (char) => char.charCodeAt(0)
  );
  const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
  await api("/api/chat/notifications/subscribe", {
    method: "POST",
    body: JSON.stringify({ subscription: subscription.toJSON(), test: true })
  });
  toast("Đã đăng ký thông báo");
  await loadAll();
});

$("testPushBtn").onclick = () => withPending($("testPushBtn"), async () => {
  const result = await api("/api/chat/notifications/test", { method: "POST" });
  setText("pushResult", `Đã gửi ${result.sent || 0}, lỗi ${result.failed || 0}`);
  toast("Đã test thông báo");
});
$("exportKbBtn").onclick = () => withPending($("exportKbBtn"), async () => {
  const result = await api("/api/chat/settings/export", { method: "POST" });
  toast(`Đã xuất ${result.key}`);
});

$("cleanupBtn").onclick = () => withPending($("cleanupBtn"), async () => {
  await api("/api/chat/settings/cleanup", { method: "POST" });
  toast("Đã dọn dữ liệu phụ trợ");
  await loadAll();
});

$("resetBtn").onclick = () => withPending($("resetBtn"), async () => {
  await api("/api/chat/settings/reset", {
    method: "POST",
    body: JSON.stringify({ confirm: "XAC NHAN" })
  });
  toast("Đã reset cài đặt");
  await loadAll();
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => null);
}

loadAll().catch((error) => toast(error.message, "bad"));
