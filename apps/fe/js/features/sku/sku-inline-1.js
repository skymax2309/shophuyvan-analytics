function openShipXanhReference() {
    const url = "https://app.shipxanh.com/dashboard/stock/products";
    const ref = window.open(url, "shipxanh_reference", "noopener,noreferrer,width=1500,height=900,left=60,top=40");
    if (!ref) window.open(url, "_blank", "noopener,noreferrer");
  }
