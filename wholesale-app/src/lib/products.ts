import type { Product } from '@/types'

/** Starred products first, then A–Z by name. */
export function sortProductsForSelect(products: Product[]): Product[] {
  return [...products].sort((a, b) => {
    const starDiff = Number(!!b.starred) - Number(!!a.starred)
    if (starDiff !== 0) return starDiff
    return a.productName.localeCompare(b.productName)
  })
}
