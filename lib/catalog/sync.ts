import 'server-only'
import { query } from '@/lib/db'

/**
 * Brings every active product with an active marketplace price into the storefront.
 * Existing catalog rows (curated, edited or unpublished in the panel) are never touched;
 * SKUs are compared without the KLS- prefix so a product only enters once.
 * Price follows the direct-sale rule: 10% below the highest active marketplace price.
 */
export const SYNC_CATALOG_SQL = `
WITH channel_price AS (
  SELECT product_id, MAX(current_price) AS price
    FROM product_channels
   WHERE status = 'active' AND current_price > 0
   GROUP BY product_id
), candidates AS (
  SELECT DISTINCT ON (UPPER(REGEXP_REPLACE(TRIM(p.sku), '^KLS-', '', 'i')))
         p.id, p.sku, p.name, p.category, cp.price,
         UPPER(REGEXP_REPLACE(TRIM(p.sku), '^KLS-', '', 'i')) AS norm
    FROM products p
    JOIN channel_price cp ON cp.product_id = p.id
   WHERE p.active AND TRIM(p.sku) <> ''
   ORDER BY UPPER(REGEXP_REPLACE(TRIM(p.sku), '^KLS-', '', 'i')), LENGTH(p.sku), p.id
)
INSERT INTO catalog_items (product_id, sku, name, category, price, compare_at_price, published, sort_order)
SELECT c.id, c.sku, c.name, c.category, ROUND(c.price * 0.9, 2), NULL, true, 10000
  FROM candidates c
 WHERE NOT EXISTS (
         SELECT 1 FROM catalog_items ci
          WHERE ci.product_id = c.id
             OR UPPER(REGEXP_REPLACE(TRIM(ci.sku), '^KLS-', '', 'i')) = c.norm
       )
ON CONFLICT (sku) DO NOTHING
RETURNING id`

/**
 * The 010/012 seeds stored the marketplace price as "preço de" to fake a -10% badge.
 * Rows never edited in the panel that still carry exactly that signature lose it.
 */
export const CLEAR_SEEDED_COMPARE_SQL = `
UPDATE catalog_items
   SET compare_at_price = NULL
 WHERE compare_at_price IS NOT NULL
   AND price = ROUND(compare_at_price * 0.9, 2)
   AND updated_at = created_at
RETURNING id`

export async function syncCatalogFromProducts(): Promise<{ added: number; clearedCompare: number }> {
  const added = await query<{ id: string }>(SYNC_CATALOG_SQL)
  const cleared = await query<{ id: string }>(CLEAR_SEEDED_COMPARE_SQL)
  return { added: added.length, clearedCompare: cleared.length }
}
