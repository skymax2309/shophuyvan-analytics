// ── CHART RENDERER ───────────────────────────────────────────────────
// Requires: Chart.js (CDN), fmtShort() from utils/format.js

let charts = {}

function makeChart(id, type, labels, datasets, opts = {}) {
  if (charts[id]) charts[id].destroy()
  const ctx = document.getElementById(id)
  if (!ctx) return
  charts[id] = new Chart(ctx, {
    type,
    data: { labels, datasets },
    options: {
      responsive: true,
      plugins: {
        legend: { display: opts.legend ?? false },
        tooltip: {
          callbacks: {
            label: ctx => " " + fmtShort(ctx.raw) + " đ"
          }
        }
      },
      scales: type !== "doughnut" && type !== "pie" ? {
        y: {
          ticks: {
            callback: v => fmtShort(v)
          }
        }
      } : undefined,
      ...opts.extra
    }
  })
}
