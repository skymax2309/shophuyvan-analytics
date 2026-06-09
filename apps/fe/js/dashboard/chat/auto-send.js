import { renderAll } from './render.js?v=chat-auto-send-20260603a'
import { setState, state } from './state.js?v=chat-auto-send-20260603a'
import { showToast } from './toast.js'

let countdownTimer = null

function clampSeconds(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 15
  return Math.min(Math.max(Math.round(number), 10), 60)
}

function latestCustomerSignature() {
  const latest = [...(state.messages || [])].reverse().find(item => item.sender_type === 'customer')
  return latest ? `${latest.id || ''}|${latest.platform_message_id || ''}|${latest.created_at || ''}` : ''
}

function stopTimer() {
  if (countdownTimer) clearInterval(countdownTimer)
  countdownTimer = null
}

export function cancelAiAutoSend(reason = 'operator_cancel', options = {}) {
  if (!state.aiAutoSend) return false
  stopTimer()
  setState({ aiAutoSend: null })
  renderAll()
  if (!options.silent) {
    const message = reason === 'new_customer_message'
      ? 'ÄÃ£ há»§y tá»± gá»­i vÃ¬ khÃ¡ch vá»«a nháº¯n thÃªm.'
      : reason === 'operator_edit'
        ? 'ÄÃ£ há»§y tá»± gá»­i vÃ¬ báº£n nhÃ¡p Ä‘Ã£ Ä‘Æ°á»£c chá»‰nh sá»­a.'
        : 'ÄÃ£ há»§y tá»± gá»­i AI.'
    showToast(message, reason === 'operator_cancel' ? 'ok' : 'error')
  }
  return true
}

function shouldCancelForChange() {
  const run = state.aiAutoSend
  if (!run || run.status !== 'counting') return ''
  if (run.conversation_id !== state.activeId) return 'conversation_changed'
  if (latestCustomerSignature() !== run.customer_signature) return 'new_customer_message'
  const currentText = document.getElementById('chatInput')?.value?.trim() || ''
  if (currentText !== run.text) return 'operator_edit'
  return ''
}

export function scheduleAiAutoSend(data = {}, sendFn = async () => {}) {
  const suggestion = data.suggestion || data
  const readiness = data.auto_send_readiness || {}
  if (!data.auto_send || readiness.eligible !== true || !suggestion?.id || !suggestion?.suggested_text) return false
  stopTimer()
  const seconds = clampSeconds(readiness.delay_seconds || suggestion.prompt_context?.agent_auto_send_delay_seconds)
  setState({
    aiAutoSend: {
      status: 'counting',
      suggestion_id: suggestion.id,
      conversation_id: state.activeId,
      text: String(suggestion.suggested_text || '').trim(),
      total_seconds: seconds,
      seconds_left: seconds,
      customer_signature: latestCustomerSignature(),
      reason: readiness.reason || 'Äá»§ Ä‘iá»u kiá»‡n tá»± gá»­i cÃ³ kiá»ƒm soÃ¡t.',
      started_at: new Date().toISOString()
    }
  })
  renderAll()
  showToast(`AI sáº½ tá»± gá»­i sau ${seconds} giÃ¢y náº¿u khÃ´ng há»§y.`, 'ok')
  countdownTimer = setInterval(async () => {
    const cancelReason = shouldCancelForChange()
    if (cancelReason) return cancelAiAutoSend(cancelReason, { silent: cancelReason === 'conversation_changed' })
    const run = state.aiAutoSend
    if (!run || run.status !== 'counting') return stopTimer()
    const nextSeconds = Number(run.seconds_left || 0) - 1
    if (nextSeconds > 0) {
      setState({ aiAutoSend: { ...run, seconds_left: nextSeconds } })
      renderAll()
      return
    }
    stopTimer()
    setState({ aiAutoSend: { ...run, status: 'sending', seconds_left: 0 } })
    renderAll()
    try {
      await sendFn({ source: 'ai_auto_countdown', suggestion_id: run.suggestion_id })
    } finally {
      if (state.aiAutoSend?.suggestion_id === run.suggestion_id) setState({ aiAutoSend: null })
      renderAll()
    }
  }, 1000)
  return true
}

window.addEventListener('chat:conversation-opened', () => cancelAiAutoSend('conversation_changed', { silent: true }))

