// ==========================================
// HỘP ĐỒ NGHỀ DÙNG CHUNG (HELPERS)
// ==========================================

export const fmt = n => Number(n || 0).toLocaleString('vi-VN') + 'đ';

export const fmtDate = s => {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d)) return s;
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export function showToast(msg, duration = 2500) {
  const t = document.getElementById('toast');
  if (t) {
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), duration);
  }
}

export function copyText(text) {
  navigator.clipboard.writeText(text).then(() => showToast('✅ Đã copy: ' + text));
}

export function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

// Bọc thép tự đóng Modal khi click ra ngoài nền tối
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
  }
});