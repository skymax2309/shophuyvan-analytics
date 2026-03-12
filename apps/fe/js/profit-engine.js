export function calculateProfit(order, product){

 const revenue = order.revenue
 const cost = product.cost * order.qty

 const fee = revenue * 0.1

 const profit = revenue - cost - fee

 return {
  revenue,
  cost,
  fee,
  profit
 }

}