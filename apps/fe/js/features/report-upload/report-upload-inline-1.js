// 1. Hack thông minh: Tự động quét và click Xóa với độ trễ (Chống lỗi chặn Spam của Server)
async function deleteAllJobs() {
    // Quét tất cả các thẻ có chữ Xóa (bất kể là button, thẻ a, hay div) và có chứa lệnh onclick
    const deleteBtns = Array.from(document.querySelectorAll('#jobProgressList *')).filter(el => 
        (el.innerText && el.innerText.includes('Xóa')) && el.hasAttribute('onclick')
    );
    
    if(deleteBtns.length === 0) {
        alert("Không có lệnh nào để xóa!");
        return;
    }
    
    if(!confirm(`Bạn có chắc muốn dọn dẹp toàn bộ ${deleteBtns.length} lệnh này không?`)) return;
    
    // Bịt miệng confirm
    const originalConfirm = window.confirm;
    window.confirm = () => true; 
    
    for(let btn of deleteBtns) {
        btn.click();
        // CHÌA KHÓA: Phải nghỉ 200ms (0.2 giây) giữa mỗi lần bấm để Server lách luật chống Spam
        await new Promise(r => setTimeout(r, 200)); 
    }
    
    window.confirm = originalConfirm;
    alert("Đã xóa xong! Giao diện sẽ tự động làm mới.");
    setTimeout(() => loadJobProgress(), 1500);
}
