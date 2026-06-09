import { cleanOrderText } from './status-workflow.js'

const ORDER_ITEM_DEDUPE_CHUNK = 50

function uniqueOrderIds(orderIds = []) {
  return [...new Set((orderIds || []).map(cleanOrderText).filter(Boolean))]
}

function duplicateCountSql(placeholders) {
  return `
    SELECT COUNT(*) AS duplicate_groups,
           COALESCE(SUM(row_count - 1), 0) AS duplicate_extra_rows
    FROM (
      SELECT COUNT(*) AS row_count
      FROM order_items
      WHERE order_id IN (${placeholders})
      GROUP BY
        order_id,
        COALESCE(sku, ''),
        COALESCE(variation_name, ''),
        COALESCE(product_name, ''),
        COALESCE(image_url, ''),
        COALESCE(qty, 0),
        COALESCE(revenue_line, 0),
        COALESCE(cost_real, 0),
        COALESCE(cost_invoice, 0),
        COALESCE(original_price, 0),
        COALESCE(sale_price, 0),
        COALESCE(current_price, 0),
        COALESCE(price_source, ''),
        COALESCE(reservation_id, '')
      HAVING COUNT(*) > 1
    )
  `
}

async function countDuplicateOrderItems(env, orderIds = []) {
  const ids = uniqueOrderIds(orderIds)
  let duplicateGroups = 0
  let duplicateExtraRows = 0

  for (let i = 0; i < ids.length; i += ORDER_ITEM_DEDUPE_CHUNK) {
    const chunk = ids.slice(i, i + ORDER_ITEM_DEDUPE_CHUNK)
    const placeholders = chunk.map(() => '?').join(',')
    const row = await env.DB.prepare(duplicateCountSql(placeholders)).bind(...chunk).first()
    duplicateGroups += Number(row?.duplicate_groups || 0)
    duplicateExtraRows += Number(row?.duplicate_extra_rows || 0)
  }

  return { duplicate_groups: duplicateGroups, duplicate_extra_rows: duplicateExtraRows }
}

export async function cleanupDuplicateOrderItemsForOrders(env, orderIds = []) {
  const ids = uniqueOrderIds(orderIds)
  if (!ids.length) {
    return {
      checked_orders: 0,
      duplicate_groups_before: 0,
      duplicate_extra_rows_before: 0,
      deleted_rows: 0,
      duplicate_groups_after: 0,
      duplicate_extra_rows_after: 0
    }
  }

  const before = await countDuplicateOrderItems(env, ids)
  let deletedRows = 0

  for (let i = 0; i < ids.length; i += ORDER_ITEM_DEDUPE_CHUNK) {
    const chunk = ids.slice(i, i + ORDER_ITEM_DEDUPE_CHUNK)
    const placeholders = chunk.map(() => '?').join(',')
    // Chỉ xóa dòng trùng tuyệt đối trong cùng một đơn, giữ row mới nhất để tránh mất dòng cùng SKU hợp lệ.
    const result = await env.DB.prepare(`
      DELETE FROM order_items
      WHERE id IN (
        SELECT id
        FROM (
          SELECT
            id,
            ROW_NUMBER() OVER (
              PARTITION BY
                order_id,
                COALESCE(sku, ''),
                COALESCE(variation_name, ''),
                COALESCE(product_name, ''),
                COALESCE(image_url, ''),
                COALESCE(qty, 0),
                COALESCE(revenue_line, 0),
                COALESCE(cost_real, 0),
                COALESCE(cost_invoice, 0),
                COALESCE(original_price, 0),
                COALESCE(sale_price, 0),
                COALESCE(current_price, 0),
                COALESCE(price_source, ''),
                COALESCE(reservation_id, '')
              ORDER BY id DESC
            ) AS duplicate_rank
          FROM order_items
          WHERE order_id IN (${placeholders})
        )
        WHERE duplicate_rank > 1
      )
    `).bind(...chunk).run()
    deletedRows += Number(result?.meta?.changes ?? result?.changes ?? 0) || 0
  }

  const after = await countDuplicateOrderItems(env, ids)
  return {
    checked_orders: ids.length,
    duplicate_groups_before: before.duplicate_groups,
    duplicate_extra_rows_before: before.duplicate_extra_rows,
    deleted_rows: deletedRows,
    duplicate_groups_after: after.duplicate_groups,
    duplicate_extra_rows_after: after.duplicate_extra_rows
  }
}
