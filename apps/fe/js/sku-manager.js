const skuMap = {}

export function addSkuMapping(platformSku, internalSku){

 skuMap[platformSku] = internalSku

}

export function getInternalSku(platformSku){

 return skuMap[platformSku] || platformSku

}

export function loadMapping(data){

 data.forEach(r=>{
  skuMap[r.platform_sku] = r.internal_sku
 })

}