export function parseCSV(text){

 const lines = text.split("\n")
 const headers = lines[0].split(",")

 const rows = []

 for(let i=1;i<lines.length;i++){

  if(!lines[i]) continue

  const cols = lines[i].split(",")

  const row = {}

  headers.forEach((h,index)=>{
   row[h.trim()] = cols[index]
  })

  rows.push(row)

 }

 return rows
}


export function detectPlatform(row){

 if(row["Mã đơn hàng"]) return "shopee"
 if(row["Order ID"]) return "tiktok"
 if(row["order_id"]) return "lazada"

 return "unknown"
}


export function normalizeOrder(row){

 let platform = detectPlatform(row)

 if(platform==="shopee"){
  return {
   order_id: row["Mã đơn hàng"],
   sku: row["Mã sản phẩm"],
   qty: Number(row["Số lượng"]),
   revenue: Number(row["Thành tiền"]),
   platform: "shopee"
  }
 }

 if(platform==="tiktok"){
  return {
   order_id: row["Order ID"],
   sku: row["SKU"],
   qty: Number(row["Quantity"]),
   revenue: Number(row["Total Amount"]),
   platform: "tiktok"
  }
 }

 if(platform==="lazada"){
  return {
   order_id: row["order_id"],
   sku: row["seller_sku"],
   qty: Number(row["quantity"]),
   revenue: Number(row["item_price"]),
   platform: "lazada"
  }
 }

 return null
}