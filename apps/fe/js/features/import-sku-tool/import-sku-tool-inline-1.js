let allProducts = []   // [{sku, product_name, image_url, status, error}]
let existingSkus = new Set()

// ── FILE CHANGE ─────────────────────────────────────────────────────
function onFileChange() {
  const s = document.getElementById('salesFile').files[0]
  const m = document.getElementById('mediaFile').files[0]
  document.getElementById('parseBtn').disabled = !(s && m)
}

// ── TEST API ─────────────────────────────────────────────────────────
async function testApi() {
  const api = document.getElementById('apiUrl').value.trim()
  try {
    const r = await fetch(api + '/api/products')
    if (r.ok) {
      const data = await r.json()
      alert(`✅ Kết nối OK! Hệ thống đang có ${data.length} SKU.`)
      existingSkus = new Set(data.map(p => p.sku))
    } else {
      alert('❌ API lỗi: ' + r.status)
    }
  } catch(e) {
    alert('❌ Không kết nối được: ' + e.message)
  }
}

// ── PARSE FILES ──────────────────────────────────────────────────────
async function parseFiles() {
  const salesFile = document.getElementById('salesFile').files[0]
  const mediaFile = document.getElementById('mediaFile').files[0]
  document.getElementById('parseLog').textContent = '⏳ Đang đọc file...'
  document.getElementById('parseBtn').disabled = true

  try {
    const [salesWb, mediaWb] = await Promise.all([
      readXlsx(salesFile), readXlsx(mediaFile)
    ])

    // ── Parse media: pid → {cover, varImgs{name: url}} ──
    const mediaMap = {}
    const mediaRows = getDataRows(mediaWb)
    for (const r of mediaRows) {
      const pid = str(r['A'])
      if (!pid || isNaN(pid)) continue
      const cover = str(r['E'])
      const varImgs = {}
      const pairs = [['Q','R'],['S','T'],['U','V'],['W','X'],['Y','Z']]
      for (const [nc, ic] of pairs) {
        const n = str(r[nc]), i = str(r[ic])
        if (n && i) varImgs[n] = i
      }
      mediaMap[pid] = { cover, varImgs }
    }

    // ── Parse sales: build SKU list ──
    const products = {}
    const salesRows = getDataRows(salesWb)
    for (const r of salesRows) {
      const pid   = str(r['A'])
      if (!pid || isNaN(pid)) continue
      const name  = str(r['B'])
      let skuSp   = str(r['E'])
      let skuPl   = str(r['F'])
      const tenPl = str(r['D'])
      
      // Bỏ qua nếu giá trị là số thuần (index của sharedStrings)
      if (/^\d+$/.test(skuSp)) skuSp = ''
      if (/^\d+$/.test(skuPl)) skuPl = ''
      
      const finalSku = skuPl || skuSp
      if (!finalSku || products[finalSku]) continue

      const m = mediaMap[pid] || {}
      const varImg = m.varImgs && m.varImgs[tenPl]
      const img = varImg || m.cover || ''

      products[finalSku] = {
        sku: finalSku,
        product_name: name,
        image_url: img,
        cost_invoice: 0,
        cost_real: 0,
        status: 'wait',
        error: ''
      }
    }

    allProducts = Object.values(products)
    document.getElementById('parseLog').textContent = `✅ Đọc xong — ${allProducts.length} SKU`
    document.getElementById('previewCard').style.display = ''
    updateStats()
    renderTable()
  } catch(e) {
    document.getElementById('parseLog').textContent = '❌ Lỗi: ' + e.message
    console.error(e)
  } finally {
    document.getElementById('parseBtn').disabled = false
  }
}

// ── READ XLSX ────────────────────────────────────────────────────────
function readXlsx(file) {
  return new Promise((res, rej) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' })
        res(wb)
      } catch(err) { rej(err) }
    }
    reader.onerror = rej
    reader.readAsArrayBuffer(file)
  })
}

function getDataRows(wb) {
  const ws = wb.Sheets[wb.SheetNames[0]]
  // Lấy tất cả rows dưới dạng array of objects với key = col letter
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
  const rows = []
  for (let R = range.s.r; R <= range.e.r; R++) {
    const row = {}
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C })
      const col = XLSX.utils.encode_col(C)
      const cell = ws[addr]
      if (cell) row[col] = cell.v !== undefined ? String(cell.v) : ''
    }
    rows.push(row)
  }
  // Bỏ qua 6 rows đầu (header + meta của Shopee)
  return rows.slice(6)
}

function str(v) { return (v || '').toString().trim() }

// ── CHECK EXISTING ───────────────────────────────────────────────────
async function checkExisting() {
  const api = document.getElementById('apiUrl').value.trim()
  try {
    const r = await fetch(api + '/api/products')
    if (!r.ok) { alert('❌ Không lấy được danh sách SKU hiện tại'); return }
    const data = await r.json()
    existingSkus = new Set(data.map(p => p.sku))
    
    let skipCount = 0
    for (const p of allProducts) {
      if (existingSkus.has(p.sku) && p.status === 'wait') {
        p.status = 'skip'
        skipCount++
      }
    }
    updateStats()
    renderTable()
    alert(`✅ Kiểm tra xong! ${skipCount} SKU đã tồn tại → đánh dấu bỏ qua.`)
  } catch(e) {
    alert('❌ Lỗi: ' + e.message)
  }
}

// ── IMPORT ───────────────────────────────────────────────────────────
async function startImport() {
  const api = document.getElementById('apiUrl').value.trim()
  if (!api) { alert('Nhập API URL trước!'); return }

  const toImport = allProducts.filter(p => p.status === 'wait')
  if (!toImport.length) { alert('Không có SKU nào cần import!'); return }
  
  if (!confirm(`Import ${toImport.length} SKU vào hệ thống?`)) return

  document.getElementById('progressWrap').style.display = ''
  document.getElementById('importBtn').disabled = true
  
  let done = 0, ok = 0, err = 0
  for (const p of toImport) {
    try {
      const res = await fetch(api + '/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: p.sku,
          product_name: p.product_name,
          cost_invoice: 0,
          cost_real: 0,
          image_url: p.image_url
        })
      })
      if (res.ok) { p.status = 'ok'; ok++ }
      else { p.status = 'err'; p.error = 'HTTP ' + res.status; err++ }
    } catch(e) {
      p.status = 'err'; p.error = e.message; err++
    }
    done++
    const pct = Math.round(done / toImport.length * 100)
    document.getElementById('progressFill').style.width = pct + '%'
    document.getElementById('progressLog').textContent = 
      `${done}/${toImport.length} — ✅ ${ok} thành công, ❌ ${err} lỗi`
    
    if (done % 5 === 0) { updateStats(); renderTable() }
    await new Promise(r => setTimeout(r, 80)) // throttle
  }

  updateStats()
  renderTable()
  document.getElementById('importBtn').disabled = false
  document.getElementById('progressLog').textContent = 
    `✅ Hoàn tất! Import ${ok} SKU thành công, ${err} lỗi.`
}

// ── RENDER ────────────────────────────────────────────────────────────
function renderTable() {
  const filter = document.getElementById('filterStatus').value
  const kw = document.getElementById('searchInput').value.toLowerCase()
  
  const list = allProducts.filter(p => {
    if (filter && p.status !== filter) return false
    if (kw && !p.sku.toLowerCase().includes(kw) && !p.product_name.toLowerCase().includes(kw)) return false
    return true
  })

  document.getElementById('totalCount').textContent = list.length

  const badgeMap = {
    wait: '<span class="badge badge-wait">⏳ Chờ</span>',
    skip: '<span class="badge badge-skip">⏭️ Bỏ qua</span>',
    ok:   '<span class="badge badge-ok">✅ Xong</span>',
    err:  '<span class="badge badge-err">❌ Lỗi</span>',
  }

  document.getElementById('tableBody').innerHTML = list.map((p, i) => `
    <tr>
      <td><input type="checkbox" class="row-chk" data-sku="${p.sku}" ${p.status==='wait'?'checked':''}></td>
      <td>${p.image_url 
        ? `<img src="${p.image_url}" class="img-thumb" onerror="this.style.display='none'">`
        : `<div style="width:36px;height:36px;background:#f1f5f9;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:18px">📦</div>`
      }</td>
      <td><code style="font-size:11px;background:#f3f4f6;padding:2px 6px;border-radius:4px">${p.sku}</code></td>
      <td style="font-size:12px;color:#374151;max-width:320px">${p.product_name}</td>
      <td>${badgeMap[p.status] || p.status}${p.error ? `<div style="font-size:10px;color:#ef4444">${p.error}</div>` : ''}</td>
    </tr>`).join('')
}

function updateStats() {
  const count = s => allProducts.filter(p => p.status === s).length
  document.getElementById('s_total').textContent = allProducts.length
  document.getElementById('s_wait').textContent  = count('wait')
  document.getElementById('s_skip').textContent  = count('skip')
  document.getElementById('s_ok').textContent    = count('ok')
  document.getElementById('s_err').textContent   = count('err')
}

function toggleAll(checked) {
  allProducts.forEach(p => { if (p.status === 'wait') p._checked = checked })
}

function selectAll(v) {
  document.querySelectorAll('.row-chk').forEach(c => c.checked = v)
}

function downloadJson() {
  const data = allProducts.map(({sku, product_name, image_url, cost_invoice, cost_real}) => 
    ({sku, product_name, image_url, cost_invoice, cost_real}))
  const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'})
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'shopee-sku-import.json'
  a.click()
}
