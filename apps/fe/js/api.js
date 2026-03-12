const API = "https://huyvan-worker-api.nghiemchihuy.workers.dev/"

export async function getProducts(){
 return fetch(API+"/api/products").then(r=>r.json())
}

export async function addProduct(p){

 return fetch(API+"/api/products",{
  method:"POST",
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify(p)
 })
}