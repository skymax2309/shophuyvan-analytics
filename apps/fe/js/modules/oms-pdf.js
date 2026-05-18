import { API } from '../oms-dashboard/oms-api.js';
import { showToast } from '../utils/helpers.js';
import { getLabelSettings, hasLabelOverlay, labelSizePoints, resolveLabelMark } from './oms-label-settings.js?v=label-real-preview2-20260509';
import { wakeRadarLocal } from './oms-radar-helper.js';

function getOrderMeta(orderMap, id) {
  if (!orderMap) return null;
  if (orderMap instanceof Map) return orderMap.get(String(id)) || orderMap.get(id) || null;
  return orderMap[String(id)] || orderMap[id] || null;
}

function isPdfBytes(bytes, contentType) {
  if (String(contentType || '').toLowerCase().includes('application/pdf')) return true;
  const header = new TextDecoder().decode(new Uint8Array(bytes.slice(0, 5)));
  return header === '%PDF-';
}

async function refreshLabelFromApi(id) {
  const res = await fetch(`${API}/api/label/${encodeURIComponent(id)}/refresh`, { method: 'POST' });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload.error) throw new Error(payload.error || `Khong tai lai duoc tem ${id}`);
  return payload;
}

async function fetchLabelWithAutoRefresh(id) {
  let res = await fetch(`${API}/api/label/${encodeURIComponent(id)}.pdf`, { cache: 'no-store' });
  if (res.ok) return res;

  const refreshed = await refreshLabelFromApi(id);
  const key = String(refreshed.storage_key || '').toLowerCase();
  const ext = key.endsWith('.html') || String(refreshed.content_type || '').toLowerCase().includes('html') ? 'html' : 'pdf';
  res = await fetch(`${API}/api/label/${encodeURIComponent(id)}.${ext}`, { cache: 'no-store' });
  return res.ok ? res : fetch(`${API}/api/label/${encodeURIComponent(id)}.pdf`, { cache: 'no-store' });
}

function openHtmlLabels(ids) {
  const htmlIds = [...new Set(ids.map(id => String(id)).filter(Boolean))];
  htmlIds.slice(0, 8).forEach((id, index) => {
    window.setTimeout(() => {
      window.open(`${API}/api/label/${encodeURIComponent(id)}.html`, '_blank');
    }, index * 150);
  });
  return htmlIds.length;
}

function groupMissingLabels(ids, orderMap) {
  const groups = new Map();
  ids.forEach(id => {
    const order = getOrderMeta(orderMap, id);
    const platform = String(order?.platform || '').toLowerCase();
    const shop = String(order?.shop || '');
    if (!platform || !shop) return;
    const key = `${platform}||${shop}`;
    if (!groups.has(key)) groups.set(key, { platform, shop, order_ids: [] });
    groups.get(key).order_ids.push(String(id));
  });
  return [...groups.values()];
}

async function queueMissingLabelJobs(ids, orderMap) {
  const groups = groupMissingLabels(ids, orderMap);
  if (!groups.length) return 0;
  const now = new Date();
  const jobs = await Promise.all(groups.map(group => fetch(API + '/api/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task_type: 'print_label',
      payload: JSON.stringify({ order_ids: group.order_ids }),
      shop_name: group.shop,
      platform: group.platform,
      month: now.getMonth() + 1,
      year: now.getFullYear()
    })
  }).then(r => r.json().catch(() => ({})))));
  if (jobs[0]?.id) await wakeRadarLocal('print_label', jobs[0].id);
  return groups.length;
}

function hexToRgb(hex) {
  const clean = String(hex || '#3b82f6').replace('#', '');
  const value = clean.length === 3
    ? clean.split('').map(ch => ch + ch).join('')
    : clean.padEnd(6, '0').slice(0, 6);
  return {
    r: parseInt(value.slice(0, 2), 16) / 255,
    g: parseInt(value.slice(2, 4), 16) / 255,
    b: parseInt(value.slice(4, 6), 16) / 255
  };
}

function dataUrlToBytes(dataUrl = '') {
  const match = String(dataUrl).match(/^data:(image\/(?:png|jpeg|jpg));base64,(.+)$/i);
  if (!match) return null;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { mime: match[1].toLowerCase(), bytes };
}

async function drawLogoMark(page, pdfDoc, mark, rgb) {
  const logo = dataUrlToBytes(mark?.logoDataUrl);
  if (!logo) return;
  try {
    const image = logo.mime.includes('png')
      ? await pdfDoc.embedPng(logo.bytes)
      : await pdfDoc.embedJpg(logo.bytes);
    const { width, height } = page.getSize();
    const padding = 5;
    const size = Math.max(10, Number(mark.logoSizeMm || 14) * 72 / 25.4);
    const x = mark.logoPosition?.includes('right') ? width - size - padding : padding;
    const y = mark.logoPosition?.includes('bottom') ? padding : height - size - padding;
    page.drawRectangle({ x: x - 1, y: y - 1, width: size + 2, height: size + 2, color: rgb(1, 1, 1), opacity: 0.86 });
    page.drawImage(image, { x, y, width: size, height: size });
  } catch {
    // Logo chỉ là dấu phụ; nếu file ảnh không nhúng được thì vẫn giữ nguyên tem gốc để không chặn in đơn.
  }
}

function drawCameraPrompt(page, font, mark, rgb) {
  if (!font || !mark?.cameraPromptEnabled || !mark?.cameraText) return;
  const { width } = page.getSize();
  const padding = 5;
  const boxHeight = 18;
  const boxWidth = Math.max(90, width - padding * 2);
  const y = mark.footerText ? padding + 14 : padding;
  const colorParts = hexToRgb(mark.color);
  const color = rgb(colorParts.r, colorParts.g, colorParts.b);
  const text = String(mark.cameraText).slice(0, 84);
  page.drawRectangle({
    x: padding,
    y,
    width: boxWidth,
    height: boxHeight,
    color: rgb(1, 1, 1),
    opacity: 0.90,
    borderColor: color,
    borderWidth: 0.7
  });
  page.drawRectangle({ x: padding + 5, y: y + 5, width: 18, height: 9, color, opacity: 0.18, borderColor: color, borderWidth: 0.6 });
  page.drawText('REC', { x: padding + 8, y: y + 7, size: 5, font, color });
  page.drawText(text, { x: padding + 28, y: y + 6, size: 6, font, color: rgb(0.08, 0.10, 0.15) });
}

function drawFooterMark(page, font, mark, rgb) {
  if (!font || !mark?.footerText) return;
  const { width } = page.getSize();
  const padding = 5;
  const y = padding;
  page.drawRectangle({ x: padding, y, width: width - padding * 2, height: 10, color: rgb(0.04, 0.05, 0.07), opacity: 0.88 });
  page.drawText(String(mark.footerText).slice(0, 96), { x: padding + 4, y: y + 2.8, size: 5.5, font, color: rgb(1, 1, 1) });
}

async function drawLabelMark(page, pdfDoc, font, mark, rgb) {
  if (!font || !mark) return;
  // Chỉ vẽ lớp ký hiệu phụ của shop; mã vạch/mã vận đơn gốc của sàn luôn giữ nguyên từ file tem đã lưu.
  await drawLogoMark(page, pdfDoc, mark, rgb);
  // Không vẽ badge chữ shop/sàn vì phần này làm tem in rối và che nội dung sàn.
  drawCameraPrompt(page, font, mark, rgb);
  drawFooterMark(page, font, mark, rgb);
}

export async function printBatchLabelsCore(ids, orderMap = null) {
  if (!ids || !ids.length) return;

  const btn = document.getElementById('btnBatchPrint');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = 'Đang gộp file...';
  }
  showToast('Đang gom phiếu in từ Server, vui lòng không tắt trang...', 4000);

  try {
    const { PDFDocument, StandardFonts, rgb } = await import('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm');
    const mergedPdf = await PDFDocument.create();
    const settings = getLabelSettings();
    const pageSize = labelSizePoints(settings);
    const markFont = hasLabelOverlay(settings)
      ? await mergedPdf.embedFont(StandardFonts.HelveticaBold)
      : null;
    let successCount = 0;
    let missingCount = 0;
    let htmlCount = 0;
    const htmlLabels = [];
    const missingIds = [];

    for (const id of ids) {
      try {
        const res = await fetchLabelWithAutoRefresh(id);
        if (!res.ok) {
          missingCount++;
          missingIds.push(id);
          continue;
        }

        const pdfBytes = await res.arrayBuffer();
        if (!isPdfBytes(pdfBytes, res.headers.get('content-type'))) {
          htmlCount++;
          htmlLabels.push(id);
          continue;
        }

        const order = getOrderMeta(orderMap, id);
        const mark = resolveLabelMark(order, settings);
        const pdfDoc = await PDFDocument.load(pdfBytes);

        if (settings.fitMode === 'a6') {
          const indices = pdfDoc.getPageIndices();
          const embeddedPages = await mergedPdf.embedPdf(pdfBytes, indices);
          for (const embeddedPage of embeddedPages) {
            const page = mergedPdf.addPage([pageSize.width, pageSize.height]);
            const safeWidth = Math.max(10, pageSize.width - pageSize.margin * 2);
            const safeHeight = Math.max(10, pageSize.height - pageSize.margin * 2);
            const scale = Math.min(safeWidth / embeddedPage.width, safeHeight / embeddedPage.height);
            const drawWidth = embeddedPage.width * scale;
            const drawHeight = embeddedPage.height * scale;
            page.drawPage(embeddedPage, {
              x: (pageSize.width - drawWidth) / 2,
              y: (pageSize.height - drawHeight) / 2,
              width: drawWidth,
              height: drawHeight
            });
            await drawLabelMark(page, mergedPdf, markFont, mark, rgb);
          }
        } else {
          const copiedPages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
          for (const page of copiedPages) {
            const addedPage = mergedPdf.addPage(page);
            await drawLabelMark(addedPage, mergedPdf, markFont, mark, rgb);
          }
        }
        successCount++;
      } catch (error) {
        missingCount++;
        missingIds.push(id);
        console.log('Lỗi gom PDF đơn: ' + id, error);
      }
    }

    const queuedGroups = missingIds.length
      ? await queueMissingLabelJobs(missingIds, orderMap).catch(() => 0)
      : 0;

    if (successCount === 0) {
      const opened = htmlLabels.length ? openHtmlLabels(htmlLabels) : 0;
      if (opened) {
        showToast(`Da mo ${opened} phieu HTML cua Lazada de in rieng.`, 6000);
        return;
      }
      const hint = htmlCount
        ? 'Một số phiếu là HTML của Lazada, hãy mở từng phiếu để in riêng.'
        : queuedGroups
          ? `Đã gửi ${queuedGroups} lệnh cho Radar lấy tem. Đợi Bot xử lý xong rồi bấm in lại.`
          : 'Các đơn đã chọn chưa được Bot xử lý hoặc chưa có phiếu in.';
      showToast(hint, 6000);
      return;
    }

    const mergedPdfFile = await mergedPdf.save();
    const blob = new Blob([mergedPdfFile], { type: 'application/pdf' });
    const blobUrl = URL.createObjectURL(blob);

    window.open(blobUrl, '_blank');
    const openedHtml = htmlLabels.length ? openHtmlLabels(htmlLabels) : 0;
    if (openedHtml) htmlCount = 0;
    const extra = [
      openedHtml ? `${openedHtml} phieu HTML da mo rieng` : '',
      htmlCount ? `${htmlCount} phiếu HTML cần mở riêng` : '',
      missingCount ? `${missingCount} phiếu chưa có file${queuedGroups ? ', đã gửi Radar lấy lại' : ''}` : ''
    ].filter(Boolean).join(', ');
    showToast(`Đã gộp xong ${successCount} phiếu PDF${extra ? `. ${extra}.` : '.'}`, 6000);
  } catch (error) {
    showToast('Lỗi tạo PDF: ' + error.message, 6000);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = 'In Bill Hàng Loạt';
    }
  }
}
