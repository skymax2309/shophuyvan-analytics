(function () {
  const AGENT_TRAINING_MARKER = "## AI CSKH - luật vận hành";
  const ZALO_TRAINING_MARKER = "## Zalo - cách trả lời riêng";

  const DEFAULT_AGENT_CONFIG = {
    mode: "suggest_only",
    reply_identity: "Nhân viên Shop Huy Vân, gọi khách là anh/chị, xưng em, trả lời ngắn gọn và không dùng emoji.",
    min_confidence: "high",
    handoff_policy: "Khi thiếu dữ liệu sản phẩm, đơn hàng, đổi trả, bảo hành hoặc khách phàn nàn thì chỉ soạn gợi ý và chuyển nhân viên duyệt.",
    evidence_required: true,
    raw_conversation_learning: false,
    auto_send_delay_seconds: 15,
    sources: {
      product_data: true,
      order_data: true,
      shop_policy: true,
      approved_replies: true,
      zalo_notes: true
    }
  };

  const DEFAULT_ZALO_REPLY_CONFIG = {
    mode: "suggest_only",
    reply_style: "Lịch sự, gọi khách là anh/chị, xưng em, trả lời ngắn gọn và không dùng emoji.",
    welcome_template: "Chào {name}, Shop Huy Vân có thể hỗ trợ thông tin gì cho anh/chị ạ?",
    first_inbound_template: "Dạ em đã nhận tin nhắn. Anh/chị cần shop hỗ trợ thông tin sản phẩm hay đơn hàng ạ?",
    training_notes: "Trả lời đúng hội thoại đang mở, không lôi sản phẩm khác. Hỏi thêm mã đơn, tên sản phẩm hoặc hình ảnh khi thiếu dữ liệu. Khi có khiếu nại, đổi trả hoặc bảo hành thì chỉ soạn gợi ý để nhân viên duyệt.",
    auto_send_delay_seconds: 10
  };

  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(Math.max(Math.round(number), min), max);
  }

  function runtimeSettings(runtime) {
    return runtime?.state?.settings || {};
  }

  function agentConfig(runtime) {
    const stored = runtimeSettings(runtime).chat_ai_agent_config || {};
    return {
      ...DEFAULT_AGENT_CONFIG,
      ...stored,
      sources: {
        ...DEFAULT_AGENT_CONFIG.sources,
        ...(stored.sources || {})
      }
    };
  }

  function zaloReplyConfig(runtime) {
    return {
      ...DEFAULT_ZALO_REPLY_CONFIG,
      ...(runtimeSettings(runtime).zalo_reply_config || {})
    };
  }

  function setChecked(runtime, id, value) {
    const el = runtime.$(id);
    if (el) el.checked = Boolean(value);
  }

  function fillAgentConfig(runtime) {
    const config = agentConfig(runtime);
    if (runtime.$("agentReplyMode")) runtime.$("agentReplyMode").value = config.mode || "suggest_only";
    if (runtime.$("agentReplyIdentity")) runtime.$("agentReplyIdentity").value = config.reply_identity || DEFAULT_AGENT_CONFIG.reply_identity;
    if (runtime.$("agentMinConfidence")) runtime.$("agentMinConfidence").value = config.min_confidence || "high";
    if (runtime.$("agentHandoffPolicy")) runtime.$("agentHandoffPolicy").value = config.handoff_policy || DEFAULT_AGENT_CONFIG.handoff_policy;
    if (runtime.$("agentAutoDelaySeconds")) runtime.$("agentAutoDelaySeconds").value = clampNumber(config.auto_send_delay_seconds, 10, 60, 15);
    setChecked(runtime, "agentEvidenceRequired", config.evidence_required !== false);
    setChecked(runtime, "agentUseProductData", config.sources.product_data !== false);
    setChecked(runtime, "agentUseOrderData", config.sources.order_data !== false);
    setChecked(runtime, "agentUsePolicyData", config.sources.shop_policy !== false);
    setChecked(runtime, "agentUseApprovedReplies", config.sources.approved_replies !== false);
    setChecked(runtime, "agentUseZaloNotes", config.sources.zalo_notes !== false);

    const trained = Boolean(config.updated_at);
    runtime.setText(
      "agentConfigStatus",
      trained
        ? `Đã lưu cấu hình huấn luyện lúc ${runtime.fmtTime(config.updated_at)}. Zalo vẫn ở chế độ nhân viên duyệt.`
        : "Đang dùng cấu hình an toàn mặc định. Lưu lại để AI dùng đúng nguồn dữ liệu và cách trả lời."
    );
    runtime.setHtml?.(
      "agentConfigBadge",
      `<span class="badge ${trained ? "ok" : "warn"}">${trained ? "Đã cấu hình" : "Cần lưu cấu hình"}</span>`
    );
  }

  function fillZaloReplyConfig(runtime) {
    const config = zaloReplyConfig(runtime);
    if (runtime.$("zaloReplyMode")) runtime.$("zaloReplyMode").value = config.mode || "suggest_only";
    if (runtime.$("zaloReplyStyle")) runtime.$("zaloReplyStyle").value = config.reply_style || DEFAULT_ZALO_REPLY_CONFIG.reply_style;
    if (runtime.$("zaloWelcomeTemplate")) runtime.$("zaloWelcomeTemplate").value = config.welcome_template || DEFAULT_ZALO_REPLY_CONFIG.welcome_template;
    if (runtime.$("zaloFirstInboundTemplate")) runtime.$("zaloFirstInboundTemplate").value = config.first_inbound_template || DEFAULT_ZALO_REPLY_CONFIG.first_inbound_template;
    if (runtime.$("zaloTrainingNotes")) runtime.$("zaloTrainingNotes").value = config.training_notes || DEFAULT_ZALO_REPLY_CONFIG.training_notes;
    if (runtime.$("zaloAutoDelaySeconds")) runtime.$("zaloAutoDelaySeconds").value = clampNumber(config.auto_send_delay_seconds, 5, 30, 10);
    runtime.setText(
      "zaloConfigStatus",
      config.updated_at
        ? `Đã lưu cấu hình Zalo AI lúc ${runtime.fmtTime(config.updated_at)}. Tự gửi vẫn cần bật riêng sau kiểm duyệt.`
        : "Đang dùng mẫu an toàn mặc định. Hãy chỉnh nội dung rồi lưu để AI học đúng cách trả lời Zalo."
    );
  }

  function collectAgentConfig(runtime, options = {}) {
    const current = agentConfig(runtime);
    const config = {
      ...current,
      mode: runtime.$("agentReplyMode")?.value || "suggest_only",
      reply_identity: (runtime.$("agentReplyIdentity")?.value || DEFAULT_AGENT_CONFIG.reply_identity).trim(),
      min_confidence: runtime.$("agentMinConfidence")?.value || "high",
      handoff_policy: (runtime.$("agentHandoffPolicy")?.value || DEFAULT_AGENT_CONFIG.handoff_policy).trim(),
      evidence_required: runtime.$("agentEvidenceRequired")?.checked !== false,
      raw_conversation_learning: false,
      auto_send_delay_seconds: clampNumber(runtime.$("agentAutoDelaySeconds")?.value, 10, 60, 15),
      sources: {
        product_data: runtime.$("agentUseProductData")?.checked !== false,
        order_data: runtime.$("agentUseOrderData")?.checked !== false,
        shop_policy: runtime.$("agentUsePolicyData")?.checked !== false,
        approved_replies: runtime.$("agentUseApprovedReplies")?.checked !== false,
        zalo_notes: runtime.$("agentUseZaloNotes")?.checked !== false
      }
    };
    if (options.stamp) config.updated_at = new Date().toISOString();
    return config;
  }

  function collectZaloReplyConfig(runtime, options = {}) {
    const current = zaloReplyConfig(runtime);
    const config = {
      ...current,
      mode: runtime.$("zaloReplyMode")?.value || "suggest_only",
      reply_style: (runtime.$("zaloReplyStyle")?.value || DEFAULT_ZALO_REPLY_CONFIG.reply_style).trim(),
      welcome_template: (runtime.$("zaloWelcomeTemplate")?.value || DEFAULT_ZALO_REPLY_CONFIG.welcome_template).trim(),
      first_inbound_template: (runtime.$("zaloFirstInboundTemplate")?.value || DEFAULT_ZALO_REPLY_CONFIG.first_inbound_template).trim(),
      training_notes: (runtime.$("zaloTrainingNotes")?.value || DEFAULT_ZALO_REPLY_CONFIG.training_notes).trim(),
      auto_send_delay_seconds: clampNumber(runtime.$("zaloAutoDelaySeconds")?.value, 5, 30, 10)
    };
    if (options.stamp) config.updated_at = new Date().toISOString();
    return config;
  }

  function stripSection(notes, marker) {
    const text = String(notes || "").trim();
    const index = text.indexOf(marker);
    return index >= 0 ? text.slice(0, index).trim() : text;
  }

  function sourceLine(label, enabled) {
    return `- ${label}: ${enabled ? "được dùng" : "không dùng"}.`;
  }

  function buildAgentTrainingSection(config) {
    return [
      AGENT_TRAINING_MARKER,
      `- Chế độ: ${config.mode === "reviewed_auto_ready" ? "sẵn sàng kiểm duyệt trước khi tự gửi" : "chỉ soạn gợi ý để nhân viên duyệt"}.`,
      `- Cách xưng hô: ${config.reply_identity}`,
      `- Độ chắc chắn tối thiểu: ${config.min_confidence === "very_high" ? "rất cao" : "cao"}.`,
      `- Bắt buộc nêu nguồn trước khi dùng gợi ý: ${config.evidence_required ? "có" : "không"}.`,
      sourceLine("Dữ liệu sản phẩm đã kiểm", config.sources.product_data),
      sourceLine("Dữ liệu đơn hàng đã kiểm", config.sources.order_data),
      sourceLine("Chính sách shop", config.sources.shop_policy),
      sourceLine("Câu trả lời đã duyệt", config.sources.approved_replies),
      sourceLine("Ghi chú riêng cho Zalo", config.sources.zalo_notes),
      `- Khi không đủ dữ liệu: ${config.handoff_policy}`,
      "- Không tự học từ hội thoại thô khi nhân viên chưa duyệt."
    ].join("\n");
  }

  function buildZaloTrainingSection(config) {
    return [
      ZALO_TRAINING_MARKER,
      `- Chế độ: ${config.mode === "reviewed_auto_ready" ? "đã sẵn sàng kiểm duyệt tự gửi" : "chỉ soạn gợi ý"}.`,
      `- Giọng trả lời: ${config.reply_style}`,
      `- Câu chào bạn mới: ${config.welcome_template}`,
      `- Câu khi khách nhắn trước: ${config.first_inbound_template}`,
      "- Nội dung train:",
      config.training_notes
    ].join("\n");
  }

  function mergedLearningNotesWithAgentAndZalo(runtime, agent, zalo) {
    const original = runtime.$("learningNotes")?.value || runtimeSettings(runtime).ai_learning_notes || "";
    const withoutAgent = stripSection(original, AGENT_TRAINING_MARKER);
    const base = stripSection(withoutAgent, ZALO_TRAINING_MARKER);
    return [
      base,
      buildAgentTrainingSection(agent),
      buildZaloTrainingSection(zalo)
    ].filter(Boolean).join("\n\n").trim();
  }

  window.ShopHuyVanChatAgentSettings = {
    collectAgentConfig,
    collectZaloReplyConfig,
    fillAgentConfig,
    fillZaloReplyConfig,
    mergedLearningNotesWithAgentAndZalo,
    zaloReplyConfig
  };
})();
