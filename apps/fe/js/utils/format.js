// ── FORMAT HELPERS ──────────────────────────────────────────────────

function fmt(n) {
  if (!n && n !== 0) return "—"
  return Number(n).toLocaleString("vi-VN") + " đ"
}

function fmtShort(n) {
  if (!n) return "0"
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + " tỷ"
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + " tr"
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(0) + "k"
  return n.toLocaleString("vi-VN")
}

function fmtFull(n) {
  if (!n && n !== 0) return "—"
  return Number(n).toLocaleString("vi-VN") + " đ"
}

function pct(a, b) {
  if (!b) return "0%"
  return (a / b * 100).toFixed(1) + "%"
}

function profitClass(n) {
  return n >= 0 ? "profit-pos" : "profit-neg"
}
