(() => {
  function escapeHtml(text = "") {
    return String(text || "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function normalizeText(value = "") {
    return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function sourceTags(entry = {}) {
    return Array.isArray(entry.source_tags) ? entry.source_tags : [];
  }

  function statusText(status = "") {
    return status === "disabled" ? "Đang tắt" : "Đang dùng";
  }

  function actionText(action = "") {
    return ({
      approved_learning_saved: "Lưu từ câu đã gửi",
      approved_learning_deduplicated: "Bỏ qua bản trùng",
      knowledge_created: "Thêm thủ công",
      knowledge_updated: "Sửa nội dung",
      knowledge_disabled: "Tắt sử dụng",
      knowledge_enabled: "Bật lại",
      knowledge_deleted: "Xóa"
    })[action] || action || "Cập nhật";
  }

  function entryMatches(entry, search, status) {
    if (status && (entry.status || "active") !== status) return false;
    if (!search) return true;
    const haystack = normalizeText([
      entry.question,
      entry.answer,
      entry.intent,
      entry.channel,
      entry.shop_id,
      sourceTags(entry).join(" ")
    ].join(" "));
    return haystack.includes(search);
  }

  function filteredEntries(runtime) {
    const { $, state } = runtime;
    const search = normalizeText($("kbSearch")?.value || "");
    const status = $("kbStatusFilter")?.value || "";
    return (state.knowledge || []).filter((entry) => entryMatches(entry, search, status));
  }

  function renderSummary(runtime, entries) {
    const { setHtml, state } = runtime;
    const all = state.knowledge || [];
    const active = all.filter((entry) => (entry.status || "active") !== "disabled").length;
    const disabled = all.filter((entry) => entry.status === "disabled").length;
    setHtml(
      "kbSummary",
      [
        `<span class="badge ok">Đang dùng ${active}</span>`,
        `<span class="badge warn">Đang tắt ${disabled}</span>`,
        `<span class="badge">Đang xem ${entries.length}</span>`
      ].join("")
    );
  }

  function renderKnowledge(runtime) {
    const { setHtml, state } = runtime;
    const entries = filteredEntries(runtime);
    renderSummary(runtime, entries);
    setHtml(
      "kbRows",
      entries.length
        ? entries.map((entry) => {
          const status = entry.status || "active";
          const pendingDelete = state.pendingDeleteKb === entry.id;
          return `
            <article class="settings-kb-item ${status === "disabled" ? "is-disabled" : ""}">
              <div class="settings-kb-main">
                <div class="settings-kb-line">
                  <span class="badge ${status === "disabled" ? "warn" : "ok"}">${statusText(status)}</span>
                  ${entry.intent ? `<span class="badge">${escapeHtml(entry.intent)}</span>` : ""}
                  ${entry.channel ? `<span class="badge">${escapeHtml(entry.channel)}</span>` : `<span class="badge">Dùng chung</span>`}
                </div>
                <h3>${escapeHtml(entry.question || "Chưa có câu hỏi")}</h3>
                <p>${escapeHtml(entry.answer || "Chưa có câu trả lời")}</p>
                <div class="settings-kb-meta">
                  <span>Dùng ${Number(entry.use_count || 0) || 0} lần</span>
                  ${entry.shop_id ? `<span>Shop ${escapeHtml(entry.shop_id)}</span>` : ""}
                  ${sourceTags(entry).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
                  ${entry.pii_redacted_count ? `<span>Đã ẩn ${Number(entry.pii_redacted_count)} dữ liệu riêng</span>` : ""}
                </div>
              </div>
              <div class="settings-kb-actions">
                <button class="btn" data-kb-edit="${escapeHtml(entry.id)}">Sửa</button>
                <button class="btn" data-kb-toggle="${escapeHtml(entry.id)}" data-kb-status="${status === "disabled" ? "active" : "disabled"}">${status === "disabled" ? "Bật lại" : "Tạm tắt"}</button>
                ${
                  pendingDelete
                    ? `<button class="btn danger" data-kb-confirm-delete="${escapeHtml(entry.id)}">Xóa thật</button>`
                    : `<button class="btn danger" data-kb-delete="${escapeHtml(entry.id)}">Xóa</button>`
                }
              </div>
            </article>
          `;
        }).join("")
        : `<div class="settings-empty">Chưa có câu trả lời phù hợp bộ lọc.</div>`
    );
    renderAudit(runtime);
  }

  function renderAudit(runtime) {
    const { setHtml, state, fmtTime } = runtime;
    const rows = (state.learningAudit || []).slice(0, 12);
    setHtml(
      "kbAuditRows",
      rows.length
        ? rows.map((row) => `
          <div class="settings-audit-item">
            <div><b>${escapeHtml(actionText(row.action))}</b><span>${escapeHtml(row.actor || "operator")} · ${escapeHtml(row.channel || "chung")} · ${fmtTime(row.created_at)}</span></div>
            <p>${escapeHtml(row.question_preview || "")}</p>
          </div>
        `).join("")
        : `<div class="settings-empty">Chưa có lịch sử học AI.</div>`
    );
  }

  function resetForm(runtime) {
    const { $ } = runtime;
    $("kbEditingId").value = "";
    $("kbQuestion").value = "";
    $("kbAnswer").value = "";
    $("kbChannel").value = "";
    $("kbShopId").value = "";
    $("kbFormTitle").textContent = "Thêm câu trả lời tốt";
    $("kbCancelEditBtn").hidden = true;
  }

  async function addKnowledge(runtime) {
    const { $, api, toast, withPending, loadAll } = runtime;
    const button = $("addKbBtn");
    return withPending(button, async () => {
      const editingId = $("kbEditingId").value;
      const payload = {
        question: $("kbQuestion").value,
        answer: $("kbAnswer").value,
        channel: $("kbChannel").value,
        shop_id: $("kbShopId").value,
        source: "manual",
        approved_by: "operator"
      };
      if (editingId) {
        await api(`/api/chat/ai/knowledge/${encodeURIComponent(editingId)}`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
      } else {
        await api("/api/chat/ai/knowledge", {
          method: "POST",
          body: JSON.stringify(payload)
        });
      }
      resetForm(runtime);
      toast(editingId ? "Đã lưu thay đổi bộ nhớ AI" : "Đã thêm vào bộ nhớ AI");
      await loadAll();
    });
  }

  async function handleKnowledgeClick(runtime, event) {
    const { $, state, api, toast, withPending, loadAll } = runtime;
    const editId = event.target.dataset.kbEdit;
    const toggleId = event.target.dataset.kbToggle;
    const deleteId = event.target.dataset.kbDelete;
    const confirmDeleteId = event.target.dataset.kbConfirmDelete;
    if (editId || toggleId || deleteId || confirmDeleteId) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (editId) {
      const entry = (state.knowledge || []).find((item) => item.id === editId);
      if (!entry) return true;
      $("kbEditingId").value = entry.id;
      $("kbQuestion").value = entry.question || "";
      $("kbAnswer").value = entry.answer || "";
      $("kbChannel").value = entry.channel || "";
      $("kbShopId").value = entry.shop_id || "";
      $("kbFormTitle").textContent = "Sửa câu trả lời đã duyệt";
      $("kbCancelEditBtn").hidden = false;
      $("kbQuestion").focus();
      return true;
    }

    if (toggleId) {
      const status = event.target.dataset.kbStatus || "active";
      await withPending(event.target, async () => {
        await api(`/api/chat/ai/knowledge/${encodeURIComponent(toggleId)}`, {
          method: "PATCH",
          body: JSON.stringify({ status, approved_by: "operator" })
        });
        toast(status === "disabled" ? "Đã tắt mục học này" : "Đã bật lại mục học này");
        await loadAll();
      });
      return true;
    }

    if (deleteId) {
      state.pendingDeleteKb = deleteId;
      renderKnowledge(runtime);
      return true;
    }

    if (confirmDeleteId) {
      await withPending(event.target, async () => {
        await api(`/api/chat/ai/knowledge/${encodeURIComponent(confirmDeleteId)}`, { method: "DELETE" });
        state.pendingDeleteKb = "";
        toast("Đã xóa mục học AI");
        await loadAll();
      });
      return true;
    }
    return false;
  }

  window.ShopHuyVanChatKnowledgeSettings = {
    addKnowledge,
    handleKnowledgeClick,
    renderKnowledge,
    resetForm
  };
})();
