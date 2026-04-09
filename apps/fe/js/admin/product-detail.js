// ===== TOAST =====
function showToast(msg, isErr = false) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.style.background = isErr ? '#dc2626' : '#ee4d2d'; // Đổi màu chuẩn Shopee
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

// ===== TOGGLE SECTION =====
function toggleSection(header) {
  header.classList.toggle('collapsed');
  const body = header.nextElementSibling;
  body.classList.toggle('hidden');
}

// ===== LẤY SKU TỪ URL =====
const urlParams = new URLSearchParams(location.search);
const currentSku = urlParams.get('sku') || '';
let productData = null;
let imgList = []; // [{url, isLocal, file?}]

// ===== LOAD DỮ LIỆU =====
async function loadProduct() {
  if (!currentSku) {
    // Chế độ tạo mới
    document.getElementById('topbar-title').textContent = 'Tạo sản phẩm mới';
    addFreeRow();
    return;
  }
  try {
    const data = await fetch(API + '/api/products').then(r => r.json());
    const all = Array.isArray(data) ? data : [];
    const parent = all.find(p => p.sku === currentSku);
    if (!parent) return showToast('❌ Không tìm thấy sản phẩm', true);
    productData = parent;
    productData.children = all.filter(p => p.parent_sku === currentSku);

    // --- KHU VỰC 1: Dữ liệu từ Sàn (Chỉ xem, hạn chế sửa) ---
    document.getElementById('pd-name').value = parent.product_name || '';
    document.getElementById('pd-desc').value = parent.description || '';
    document.getElementById('pd-video').value = parent.video_url || '';
    document.getElementById('topbar-title').textContent = parent.product_name || currentSku;
    document.getElementById('btn-delete').style.display = 'inline-block';
    if (parent.video_url) previewVideo(parent.video_url);

    // Ảnh
    imgList = [];
    if (parent.image_url) imgList.push({ url: parent.image_url });
    try {
      const extras = JSON.parse(parent.images || '[]');
      extras.forEach(u => { if (u && u !== parent.image_url) imgList.push({ url: u }); });
    } catch(e) {}
    renderGallery();

    // --- KHU VỰC 2 & 3: Load Dữ Liệu Cũ Vào Bảng Matrix ---
    const vars = productData.children.length > 0 ? productData.children : [parent];
    document.getElementById('var-tbody-shopee').innerHTML = '';
    vars.forEach((v, idx) => addFreeRow(v, idx));
  } catch(e) {
    showToast('❌ Lỗi tải dữ liệu: ' + e.message, true);
  }
}

// ===== GALLERY ẢNH =====
function renderGallery() {
  const gallery = document.getElementById('img-gallery');
  const addBtn = gallery.querySelector('.img-add-btn');
  // Xóa thumbs cũ
  gallery.querySelectorAll('.img-thumb-wrap').forEach(el => el.remove());

  imgList.forEach((img, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'img-thumb-wrap' + (i === 0 ? ' main-img' : '');
    wrap.innerHTML = `
      <img src="${img.url}" alt="">
      <button class="img-del" onclick="removeImg(${i})" title="Xóa ảnh">✕</button>
    `;
    gallery.insertBefore(wrap, addBtn);
  });
}

function handleImgUpload(input) {
  Array.from(input.files).forEach(file => {
    const url = URL.createObjectURL(file);
    imgList.push({ url, isLocal: true, file });
  });
  renderGallery();
  input.value = '';
}

function removeImg(i) {
  imgList.splice(i, 1);
  renderGallery();
}

// ===== VIDEO PREVIEW =====
function previewVideo(url) {
  const wrap = document.getElementById('video-preview');
  const iframe = document.getElementById('video-iframe');
  const video = document.getElementById('video-native');
  if (!url) { wrap.style.display = 'none'; return; }

  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) {
    iframe.src = `https://www.youtube.com/embed/${ytMatch[1]}`;
    iframe.style.display = 'block';
    video.style.display = 'none';
  } else {
    video.src = url;
    video.style.display = 'block';
    iframe.style.display = 'none';
  }
  wrap.style.display = 'block';
}

// ===== LOGIC MA TRẬN SHOPEE =====
let tags1 = [];
let tags2 = [];
let hasGroup2 = false;

function handleTagEnter(e, groupNum) {
  if (e.key === 'Enter') {
    e.preventDefault();
    const val = e.target.value.trim();
    if (!val) return;
    if (groupNum === 1 && !tags1.includes(val)) tags1.push(val);
    if (groupNum === 2 && !tags2.includes(val)) tags2.push(val);
    e.target.value = '';
    renderTagsAndMatrix();
  }
}

function removeTag(groupNum, index) {
  if (groupNum === 1) tags1.splice(index, 1);
  if (groupNum === 2) tags2.splice(index, 1);
  renderTagsAndMatrix();
}

function toggleGroup2(show) {
  hasGroup2 = show;
  document.getElementById('shopee-grp2-wrap').style.display = show ? 'block' : 'none';
  document.getElementById('btn-add-grp2').style.display = show ? 'none' : 'inline-block';
  if (!show) { tags2 = []; document.getElementById('shopee-input-2').value = ''; }
  renderTagsAndMatrix();
}

function renderTagsAndMatrix() {
  const tplTag = (name, i, grp) => `<div style="background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; padding:2px 8px; border-radius:4px; font-size:12px; font-weight:600; display:flex; align-items:center; gap:6px;">${escHtml(name)} <span onclick="removeTag(${grp}, ${i})" style="color:#ef4444; cursor:pointer; font-weight:bold;">✕</span></div>`;
  document.getElementById('shopee-tags-1').innerHTML = tags1.map((t, i) => tplTag(t, i, 1)).join('');
  document.getElementById('shopee-tags-2').innerHTML = tags2.map((t, i) => tplTag(t, i, 2)).join('');
  generateShopeeMatrix();
}

function generateShopeeMatrix() {
  const tbody = document.getElementById('var-tbody-shopee');
  if (tags1.length === 0 && tags2.length === 0) return;
  tbody.innerHTML = '';
  
  const g1Name = document.getElementById('shopee-grp1-name').value.trim() || 'Nhóm 1';
  const g2Name = document.getElementById('shopee-grp2-name').value.trim() || 'Nhóm 2';

  let permutations = [];
  if (tags1.length > 0 && !hasGroup2) {
    permutations = tags1.map(t => ({ name: t, t1: t }));
  } else if (tags1.length > 0 && hasGroup2 && tags2.length > 0) {
    tags1.forEach(t1 => {
      tags2.forEach(t2 => {
        permutations.push({ name: `${t1}, ${t2}`, t1: t1, t2: t2 });
      });
    });
  }

  permutations.forEach((p, i) => addFreeRow({ product_name: p.name }, i));
}

function addFreeRow(data = null, id = null) {
  const tbody = document.getElementById('var-tbody-shopee');
  const rowId = id !== null ? id : Date.now();
  const tr = document.createElement('tr');
  tr.className = 'shopee-var-row';
  tr.innerHTML = `
    <td>
      <div style="position:relative; width:44px; height:44px; cursor:pointer;" onclick="document.getElementById('shopee-img-${rowId}').click()" title="Đổi ảnh">
        <img src="${data && data.image_url ? data.image_url : 'https://placehold.co/44x44?text=+'}" id="preview-${rowId}" style="width:100%; height:100%; object-fit:cover; border-radius:6px; border:1px solid #e5e7eb;">
        <input type="file" id="shopee-img-${rowId}" style="display:none" accept="image/*" onchange="document.getElementById('preview-${rowId}').src = window.URL.createObjectURL(this.files[0])">
      </div>
    </td>
    <td><input type="text" class="v-name" value="${data ? escHtml(data.product_name) : ''}" placeholder="Tên biến thể..." style="width:100%; border:none; background:transparent; font-weight:500; outline:none;"></td>
    <td class="center"><input type="number" class="v-inv" value="${data ? data.cost_invoice || 0 : 0}" style="width:100%; border:none; text-align:center; outline:none; color:#666;"></td>
    <td class="center"><input type="number" class="v-real" value="${data ? data.cost_real || 0 : 0}" style="width:100%; border:none; text-align:center; outline:none; color:#ee4d2d; font-weight:500;"></td>
    <td class="center"><input type="number" class="v-main" value="${data ? data.stock_main || 0 : 0}" style="width:100%; border:none; text-align:center; outline:none; color:#333;"></td>
    <td class="center"><input type="number" class="v-sub" value="${data ? data.stock_sub || 0 : 0}" style="width:100%; border:none; text-align:center; outline:none; color:#333;"></td>
    <td><input type="text" class="v-sku" value="${data ? escHtml(data.sku) : ''}" placeholder="Nhập SKU..." style="width:100%; border:none; background:transparent; font-family:monospace; outline:none;"></td>
    <td class="center"><button onclick="this.closest('tr').remove()" style="background:#fff; border:none; color:#ee4d2d; font-weight:bold; cursor:pointer;" title="Xóa dòng">✕</button></td>
  `;
  tbody.appendChild(tr);
}

function applyBulkValues() {
  const inv = document.getElementById('bulk-inv').value;
  const real = document.getElementById('bulk-real').value;
  const main = document.getElementById('bulk-main').value;
  const sub = document.getElementById('bulk-sub').value;

  document.querySelectorAll('.shopee-var-row').forEach(row => {
    if (inv !== '') row.querySelector('.v-inv').value = inv;
    if (real !== '') row.querySelector('.v-real').value = real;
    if (main !== '') row.querySelector('.v-main').value = main;
    if (sub !== '') row.querySelector('.v-sub').value = sub;
  });
  showToast('⚡ Đã áp dụng hàng loạt!');
}

// ===== LƯU SẢN PHẨM CHUẨN CẤU TRÚC D1 =====
async function saveProduct() {
  const name = document.getElementById('pd-name').value.trim();
  if (!name) return showToast('⚠️ Vui lòng nhập tên bài đăng!', true);

  const rows = document.querySelectorAll('.shopee-var-row');
  if (rows.length === 0) return showToast('⚠️ Cần ít nhất 1 dòng phân loại!', true);

  const btn = document.querySelector('.btn-save-main');
  btn.textContent = '⏳ Đang lưu...'; btn.disabled = true;

  try {
    const parentSku = currentSku || rows[0].querySelector('.v-sku').value.trim();
    const mainImg = imgList.length > 0 ? imgList[0].url : '';
    const extraImg = imgList.slice(1).map(i => i.url);
    const desc = document.getElementById('pd-desc').value;
    const videoUrl = document.getElementById('pd-video').value;

    // 1. TẠO SP CHA TRƯỚC (NẾU CÓ NHIỀU PHÂN LOẠI)
    if (rows.length > 1 || currentSku) {
        await fetch(API + '/api/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sku: parentSku, product_name: name, description: desc, video_url: videoUrl,
                image_url: mainImg, images: JSON.stringify(extraImg),
                is_parent: 1, stock: 0, cost_invoice: 0, cost_real: 0
            })
        });
    }

    // 2. LƯU TỪNG PHÂN LOẠI CON
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const sku = row.querySelector('.v-sku').value.trim() || `${parentSku}-V${i+1}`;
      const varName = row.querySelector('.v-name').value.trim();
      const vImg = row.querySelector('img').src.includes('placehold') ? mainImg : row.querySelector('img').src;
      const stMain = parseInt(row.querySelector('.v-main').value) || 0;
      const stSub = parseInt(row.querySelector('.v-sub').value) || 0;

      await fetch(API + '/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            sku: sku,
            parent_sku: rows.length > 1 ? parentSku : null,
            product_name: rows.length > 1 ? varName : name,
            description: desc, video_url: videoUrl, image_url: vImg, images: JSON.stringify(extraImg),
            cost_invoice: parseFloat(row.querySelector('.v-inv').value) || 0,
            cost_real: parseFloat(row.querySelector('.v-real').value) || 0,
            stock_main: stMain, stock_sub: stSub, stock: stMain + stSub,
            is_parent: 0
        })
      });
    }

    showToast('✅ Đã lưu dữ liệu chuẩn luồng DB!');
    setTimeout(() => { location.href = 'sku.html'; }, 1000);
  } catch(e) {
    showToast('❌ Lỗi DB: ' + e.message, true);
  } finally {
    btn.textContent = '💾 Lưu sản phẩm'; btn.disabled = false;
  }
}

// ===== XÓA SẢN PHẨM =====
async function deleteProduct() {
  if (!confirm('Xóa toàn bộ sản phẩm và phân loại này?')) return;
  try {
    const rows = document.querySelectorAll('.shopee-var-row');
    for (const tr of rows) {
      const sku = tr.querySelector('.v-sku')?.value.trim();
      if (sku) await fetch(API + '/api/products/' + sku, { method: 'DELETE' });
    }
    if (currentSku) await fetch(API + '/api/products/' + currentSku, { method: 'DELETE' });
    showToast('🗑️ Đã xóa!');
    setTimeout(() => { location.href = 'sku.html'; }, 1000);
  } catch(e) { showToast('❌ Lỗi: ' + e.message, true); }
}

// ===== HELPER =====
function escHtml(str) {
  return (str || '').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===== KHỞI ĐỘNG =====
document.addEventListener('DOMContentLoaded', loadProduct);