export default {
 async fetch(request, env) {

  const url = new URL(request.url)

  const cors = {
   "Access-Control-Allow-Origin": "*",
   "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
   "Access-Control-Allow-Headers": "Content-Type"
  }

  if (request.method === "OPTIONS")
   return new Response("",{headers:cors})

  if (url.pathname === "/favicon.ico")
   return new Response("",{status:204})

  if (url.pathname === "/")
   return new Response("ShopHuyVan Profit API running")

  try{

   if(url.pathname==="/api/products")
    return products(request,env,cors)

   if(url.pathname==="/api/dashboard")
    return dashboard(env,cors)

   if(url.pathname==="/api/profit-by-day")
    return profitByDay(env,cors)

   if(url.pathname==="/api/profit-by-sku")
    return profitBySku(env,cors)

   if(url.pathname==="/api/import-orders")
    return importOrders(request,env,cors)

   return new Response("Not found",{status:404})

  }catch(e){

   return new Response(e.toString(),{status:500})

  }

 }
}


async function products(request,env,cors){

 if(request.method==="GET"){

  const rows=await env.DB.prepare(`
  SELECT * FROM products
  ORDER BY sku
  `).all()

  return Response.json(rows.results,{headers:cors})
 }

 if(request.method==="POST"){

  const body=await request.json()

  await env.DB.prepare(`
  INSERT INTO products
  (sku,name,cost,price)
  VALUES (?,?,?,?)
  `)
  .bind(body.sku,body.name,body.cost,body.price)
  .run()

  return Response.json({status:"ok"},{headers:cors})
 }

}


async function dashboard(env,cors){

 const row=await env.DB.prepare(`
 SELECT
 SUM(revenue) revenue,
 SUM(profit) profit,
 COUNT(*) orders
 FROM orders
 `).first()

 return Response.json(row,{headers:cors})
}


async function profitByDay(env,cors){

 const rows=await env.DB.prepare(`
 SELECT
 date(created_at) d,
 SUM(profit) profit
 FROM orders
 GROUP BY d
 ORDER BY d
 `).all()

 return Response.json(rows.results,{headers:cors})
}


async function profitBySku(env,cors){

 const rows=await env.DB.prepare(`
 SELECT
 sku,
 SUM(qty) qty,
 SUM(profit) profit
 FROM orders
 GROUP BY sku
 ORDER BY profit DESC
 `).all()

 return Response.json(rows.results,{headers:cors})
}


async function importOrders(request,env,cors){

 const orders = await request.json()

 for(const o of orders){

  const cost = await env.DB.prepare(`
   SELECT cost FROM products WHERE sku=?
  `).bind(o.sku).first()

  const profit = cost
   ? o.revenue - (cost.cost * o.qty)
   : o.revenue

  await env.DB.prepare(`
   INSERT INTO orders (order_id,sku,qty,revenue,profit,platform,status,created_at)
   VALUES (?,?,?,?,?,?,?,datetime('now'))
  `).bind(o.order_id, o.sku, o.qty, o.revenue, profit, o.platform ?? "tiktok", "completed").run()

 }

 return Response.json({status:"ok", imported: orders.length},{headers:cors})

}