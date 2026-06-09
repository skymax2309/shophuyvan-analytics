export function showToast(message, tone = 'ok') {
  const stack = document.getElementById('toastStack')
  if (!stack) return
  const node = document.createElement('div')
  node.className = `toast ${tone}`
  node.textContent = repairMojibake(message)
  stack.appendChild(node)
  setTimeout(() => node.remove(), tone === 'error' ? 5200 : 3200)
}

export function openModal({ title, body, actions = [] }) {
  const root = document.getElementById('chatModalRoot')
  if (!root) return
  const buttons = actions.map((action, index) => `
    <button class="chat-btn ${action.tone || 'ghost'}" type="button" data-modal-action="${index}">${action.label}</button>
  `).join('')
  root.innerHTML = `
    <div class="modal-backdrop" role="presentation">
      <section class="modal-panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
        <header class="modal-head">
          <strong>${escapeHtml(title)}</strong>
          <button class="icon-btn" type="button" data-modal-close>Đóng</button>
        </header>
        <div class="modal-body">${body}</div>
        <footer class="modal-actions">${buttons || '<button class="chat-btn primary" type="button" data-modal-close>Đã hiểu</button>'}</footer>
      </section>
    </div>
  `
  root.querySelector('[data-modal-close]')?.addEventListener('click', () => { root.innerHTML = '' })
  root.querySelectorAll('[data-modal-action]').forEach(button => {
    button.addEventListener('click', () => {
      const action = actions[Number(button.dataset.modalAction)]
      action?.onClick?.()
      root.innerHTML = ''
    })
  })
}

export function escapeHtml(value) {
  return repairMojibake(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

const CP1252_BYTES = new Map([
  [0x20AC, 0x80], [0x201A, 0x82], [0x0192, 0x83], [0x201E, 0x84],
  [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02C6, 0x88],
  [0x2030, 0x89], [0x0160, 0x8A], [0x2039, 0x8B], [0x0152, 0x8C],
  [0x017D, 0x8E], [0x2018, 0x91], [0x2019, 0x92], [0x201C, 0x93],
  [0x201D, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02DC, 0x98], [0x2122, 0x99], [0x0161, 0x9A], [0x203A, 0x9B],
  [0x0153, 0x9C], [0x017E, 0x9E], [0x0178, 0x9F]
])

const MOJIBAKE_MARKER = /[\u00c3\u00c4\u00c6\u00c5]|\u00c2(?=[\u00a0-\u00bf])|\u00e1[\u00ba\u00bb]|\u00e2(?=[\u0080-\u00bf\u2018-\u2026\u20ac])|\u00f0\u0178/

export function repairMojibake(value) {
  const text = String(value ?? '')
  if (!MOJIBAKE_MARKER.test(text)) return text
  const bytes = []
  for (const char of text) {
    const code = char.codePointAt(0)
    if (code <= 0xff) bytes.push(code)
    else if (CP1252_BYTES.has(code)) bytes.push(CP1252_BYTES.get(code))
    else bytes.push(...new TextEncoder().encode(char))
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes))
}
