// Link cũ #ads phải chuyển ngay sang trang ADS riêng để không còn chạy nút tắt/bật ADS cũ.
  if ((window.location.hash || '').replace('#', '') === 'ads') {
    window.location.replace('ads.html')
  }
  if ((window.location.hash || '').replace('#', '') === 'promotion') {
    window.location.replace('promotions.html')
  }
