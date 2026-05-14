// Điều phối shell riêng của trang chat sàn; logic nghiệp vụ vẫn nằm trong các module fe-chat-*.
window.toggleSidebar = function() {
  document.getElementById('sidebar')?.classList.toggle('open')
  document.getElementById('sidebarOverlay')?.classList.toggle('show')
}

window.addEventListener('DOMContentLoaded', () => {
  if (typeof window.loadChat === 'function') window.loadChat()
})
