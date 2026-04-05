// ==========================================
// MODULE: IN ẤN & GỘP PDF BẰNG PDF-LIB
// ==========================================
import { API } from '../oms-api.js';
import { showToast } from '../utils/helpers.js';

export async function printBatchLabelsCore(ids) {
  if (!ids || !ids.length) return;

  const btn = document.getElementById('btnBatchPrint');
  if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Đang gộp file...'; }
  showToast('🔄 Đang gom file PDF từ Server, vui lòng không tắt trang...', 4000);

  try {
    const { PDFDocument } = await import('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm');
    const mergedPdf = await PDFDocument.create();
    let successCount = 0;

    for (const id of ids) {
      try {
        const url = `${API}/api/label/${id}.pdf`;
        const res = await fetch(url);
        if (!res.ok) continue; 
        
        const pdfBytes = await res.arrayBuffer();
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const copiedPages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
        successCount++;
      } catch (e) {
        console.log("Lỗi gom PDF đơn: " + id, e);
      }
    }

    if (successCount === 0) {
      showToast('❌ Các đơn đã chọn chưa được Bot xử lý hoặc chưa có Phiếu in!');
      return;
    }

    const mergedPdfFile = await mergedPdf.save();
    const blob = new Blob([mergedPdfFile], { type: 'application/pdf' });
    const blobUrl = URL.createObjectURL(blob);
    
    window.open(blobUrl, '_blank'); 
    showToast(`✅ Đã gộp xong ${successCount} phiếu in! Sẵn sàng in.`);

  } catch (error) {
    showToast('❌ Lỗi tạo PDF: ' + error.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '🖨️ In Bill Hàng Loạt'; }
  }
}