{
  const Promo = window.SHV_PROMO

  function el(id) {
    return document.getElementById(id)
  }

  function setHeaderActions(isFlashAuto) {
    ;['promotionRefreshBtn', 'promotionSyncBtn', 'promotionCleanupBtn'].forEach(id => {
      const button = el(id)
      if (button) button.hidden = isFlashAuto
    })
  }

  function activateButton(target) {
    document.querySelectorAll('[data-promo-child-tab]').forEach(button => {
      button.classList.toggle('active', button === target)
    })
  }

  function showFlashAuto() {
    el('promotionParentPanel')?.setAttribute('hidden', '')
    el('promotionFlashAutoPanel')?.removeAttribute('hidden')
    setHeaderActions(true)
  }

  function showPromotionList(moduleKey = '') {
    el('promotionFlashAutoPanel')?.setAttribute('hidden', '')
    el('promotionParentPanel')?.removeAttribute('hidden')
    setHeaderActions(false)
    if (moduleKey && window.loadPromotionModule) {
      window.loadPromotionModule(moduleKey)
      return
    }
    if (Promo?.render?.renderModuleCards) Promo.render.renderModuleCards()
  }

  function switchTab(button) {
    activateButton(button)
    const tab = button.dataset.promoChildTab
    if (tab === 'flash-auto') {
      showFlashAuto()
      return
    }
    if (tab === 'module') {
      showPromotionList(button.dataset.moduleKey || '')
      return
    }
    showPromotionList('')
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-promo-child-tab]')
    if (!button) return
    switchTab(button)
  })

  document.addEventListener('DOMContentLoaded', () => {
    const initial = document.querySelector('[data-promo-child-tab].active') || document.querySelector('[data-promo-child-tab]')
    if (initial) switchTab(initial)
  })
}
