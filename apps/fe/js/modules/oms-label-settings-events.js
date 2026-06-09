export function bindLabelModalEvents(modal, ctx) {
  const {
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
  } = ctx;
  if (modal.dataset.bound === '1') return;
  modal.dataset.bound = '1';

  modal.addEventListener('click', event => {
    const target = event.target.closest('button, a, input, [data-template-section], [data-template-layer], [data-template-row-section], [data-template-toggle-overlay]');
    if (!target) return;

    if (target.matches('[data-label-close]')) {
      modal.classList.remove('open');
      return;
    }
    if (target.matches('[data-label-tab]')) {
      switchTab(target.dataset.labelTab);
      return;
    }
    if (target.matches('[data-label-status-tab]')) {
      const status = target.dataset.labelStatusTab || 'all';
      if (status === 'error') {
        switchTab('errors');
      } else {
        labelVaultState.activeTab = 'warehouse';
        modal.querySelectorAll('.label-vault-tab').forEach(button => {
          button.classList.toggle('active', button.dataset.labelTab === 'warehouse');
        });
        loadLabels(status);
      }
      return;
    }
    if (target.matches('[data-label-reload]')) {
      loadLabels(target.dataset.labelReload || 'all');
      return;
    }
    if (target.matches('[data-label-apply-filter]')) {
      labelVaultState.filters.q = modal.querySelector('#labelVaultSearch')?.value.trim() || '';
      loadLabels(labelVaultState.activeTab === 'errors' ? 'error' : 'all');
      return;
    }
    if (target.matches('[data-label-notice-close]')) {
      target.closest('.label-vault-notice')?.remove();
      return;
    }
    if (target.matches('[data-label-select-page]')) {
      selectRows(rowsForStatus(currentWarehouseStatus()), true);
      return;
    }
    if (target.matches('[data-label-select-errors]')) {
      selectRows(rowsForStatus(currentWarehouseStatus()).filter(row => row.error), true);
      return;
    }
    if (target.matches('[data-label-clear-selected]')) {
      labelVaultState.selected.clear();
      renderLabelVaultPanel();
      return;
    }
    if (target.matches('[data-label-open]')) {
      printLabelsWithOverlay([target.dataset.labelOpen]);
      return;
    }
    if (target.matches('[data-label-refresh]')) {
      target.disabled = true;
      refreshSelectedLabels([target.dataset.labelRefresh])
        .catch(error => showToast(error.message, 5000))
        .finally(() => {
          target.disabled = false;
        });
      return;
    }
    if (target.matches('[data-label-open-selected]')) {
      openSelectedLabels([...labelVaultState.selected]);
      return;
    }
    if (target.matches('[data-label-refresh-selected]')) {
      refreshSelectedLabels([...labelVaultState.selected]);
      return;
    }
    if (target.matches('[data-label-manual-print]')) {
      openSelectedLabels(cleanOrderIds(modal.querySelector('#labelManualOrders')?.value));
      return;
    }
    if (target.matches('[data-label-manual-refresh]')) {
      refreshSelectedLabels(cleanOrderIds(modal.querySelector('#labelManualOrders')?.value));
      return;
    }
    if (target.matches('[data-template-platform]')) {
      labelVaultState.previewSettings = readTemplateSettingsFromModal();
      labelVaultState.activePlatform = target.dataset.templatePlatform;
      renderLabelVaultPanel();
      return;
    }
    if (target.matches('[data-template-toggle-overlay]')) {
      const settings = readTemplateSettingsFromModal();
      settings.overlayEnabled = !(settings.overlayEnabled !== false);
      labelVaultState.previewSettings = normalizeSettings(settings);
      renderLabelVaultPanel();
      showToast(settings.overlayEnabled ? 'Đã bật tuỳ chỉnh tem.' : 'Đã tắt tuỳ chỉnh tem.', 3000);
      return;
    }
    if (target.matches('[data-template-section], [data-template-layer], [data-template-row-section]')) {
      labelVaultState.previewSettings = readTemplateSettingsFromModal();
      labelVaultState.activeTemplateSection = target.dataset.templateSection || target.dataset.templateLayer || target.dataset.templateRowSection || 'watermark';
      renderLabelVaultPanel();
      return;
    }
    if (target.matches('[data-template-copy]')) {
      addTemplateCopy(target.dataset.templateCopy || labelVaultState.activeTemplateSection || 'watermark');
      return;
    }
    if (target.matches('[data-template-delete]')) {
      deleteTemplateSection(target.dataset.templateDelete || '');
      return;
    }
    if (target.matches('[data-template-variable]')) {
      const variable = target.dataset.templateVariable || '';
      const active = modal.querySelector('textarea:focus, input[type="text"]:focus, input:not([type]):focus');
      if (active) {
        const start = active.selectionStart ?? active.value.length;
        const end = active.selectionEnd ?? active.value.length;
        active.value = `${active.value.slice(0, start)}${variable}${active.value.slice(end)}`;
        active.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        navigator.clipboard?.writeText(variable).catch(() => {});
        showToast(`Đã copy biến ${variable}.`, 3000);
      }
      return;
    }
    if (target.matches('[data-label-clear-logo]')) {
      labelVaultState.previewSettings = { ...readTemplateSettingsFromModal(), logoDataUrl: '' };
      renderLabelVaultPanel();
      return;
    }
    if (target.matches('[data-label-save-template]')) {
      const settings = readTemplateSettingsFromModal();
      labelVaultState.previewSettings = settings;
      saveLabelSettings(settings);
      showToast('Đã lưu mẫu tem, logo và nhắc quay video.', 4000);
    }
  });

  modal.addEventListener('input', event => {
    if (event.target.matches('[data-template-input]')) {
      updatePreviewFromInputs();
    }
    if (event.target.matches('#labelVaultSearch')) {
      labelVaultState.filters.q = event.target.value.trim();
    }
  });

  modal.addEventListener('keydown', event => {
    if (event.target.matches('#labelVaultSearch') && event.key === 'Enter') {
      event.preventDefault();
      labelVaultState.filters.q = event.target.value.trim();
      loadLabels(labelVaultState.activeTab === 'errors' ? 'error' : 'all');
    }
    if (event.target.matches('[data-template-row-section]') && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      labelVaultState.previewSettings = readTemplateSettingsFromModal();
      labelVaultState.activeTemplateSection = event.target.dataset.templateRowSection || 'watermark';
      renderLabelVaultPanel();
    }
  });

  modal.addEventListener('change', event => {
    if (event.target.matches('#labelVaultPlatform')) {
      labelVaultState.filters.platform = event.target.value;
      loadLabels(labelVaultState.activeTab === 'errors' ? 'error' : 'all');
    }
    if (event.target.matches('#labelVaultSearch')) {
      labelVaultState.filters.q = event.target.value.trim();
      loadLabels(labelVaultState.activeTab === 'errors' ? 'error' : 'all');
    }
    if (event.target.matches('[data-label-select]')) {
      const id = event.target.dataset.labelSelect;
      if (event.target.checked) labelVaultState.selected.add(id);
      else labelVaultState.selected.delete(id);
      renderLabelVaultPanel();
    }
    if (event.target.matches('[data-label-select-visible]')) {
      selectRows(rowsForStatus(currentWarehouseStatus()), !!event.target.checked);
    }
    if (event.target.matches('#labelLogoFile')) {
      const file = event.target.files?.[0];
      if (!file) return;
      if (file.size > 260 * 1024) {
        showToast('Logo nên dưới 260KB để lưu nhanh trong trình duyệt.', 5000);
        event.target.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        labelVaultState.previewSettings = {
          ...readTemplateSettingsFromModal(),
          logoDataUrl: String(reader.result || '')
        };
        renderLabelVaultPanel();
      };
      reader.readAsDataURL(file);
    }
  });
}
