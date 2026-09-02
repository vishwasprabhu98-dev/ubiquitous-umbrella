import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Tags, Save, RotateCcw, Search, Plus, Minus } from 'lucide-react'
import { toast } from 'sonner'
import { pricingRepository } from '@/firebase/repositories/pricingRepository'
import { customerRepository } from '@/firebase/repositories/customerRepository'
import { productRepository } from '@/firebase/repositories/productRepository'
import { getFirestoreErrorMessage } from '@/lib/firestoreUtils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency, cn } from '@/lib/utils'
import type { CustomerProductPricing, Product } from '@/types'

/** Empty string = no custom price (use base). */
type PriceDraft = Record<string, string>

const EMPTY_PRODUCTS: Product[] = []
const EMPTY_PRICINGS: CustomerProductPricing[] = []

function buildDraftFromPricing(
  products: Product[],
  customerPricings: CustomerProductPricing[]
): PriceDraft {
  const next: PriceDraft = {}
  for (const product of products) {
    const mapping = customerPricings.find((p) => p.productId === product.productId)
    next[product.productId] = mapping ? String(mapping.customPrice) : ''
  }
  return next
}

function draftsEqual(a: PriceDraft, b: PriceDraft): boolean {
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  for (const key of keysA) {
    if (a[key] !== b[key]) return false
  }
  return true
}

export default function PricingManagement() {
  const queryClient = useQueryClient()
  const [customerId, setCustomerId] = useState('')
  const [draft, setDraft] = useState<PriceDraft>({})
  const [productSearch, setProductSearch] = useState('')
  const [bulkAdjust, setBulkAdjust] = useState('')

  const { data: customers = [], isLoading: customersLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: customerRepository.getAll,
  })
  const { data: products = EMPTY_PRODUCTS, isLoading: productsLoading } = useQuery({
    queryKey: ['products'],
    queryFn: productRepository.getAll,
  })
  const {
    data: customerPricings = EMPTY_PRICINGS,
    isLoading: pricingLoading,
    isFetching: pricingFetching,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ['pricing', customerId],
    queryFn: () => pricingRepository.getByCustomer(customerId),
    enabled: !!customerId,
  })

  // Sync draft from server pricing — stable empty arrays + equality check avoid update loops
  useEffect(() => {
    if (!customerId) {
      setDraft((prev) => (Object.keys(prev).length === 0 ? prev : {}))
      return
    }
    const next = buildDraftFromPricing(products, customerPricings)
    setDraft((prev) => (draftsEqual(prev, next) ? prev : next))
  }, [customerId, products, customerPricings, dataUpdatedAt])

  const sortedCustomers = useMemo(
    () => [...customers].sort((a, b) => a.name.localeCompare(b.name)),
    [customers]
  )

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase()
    const list = [...products].sort((a, b) => a.productName.localeCompare(b.productName))
    if (!q) return list
    return list.filter(
      (p) =>
        p.productName.toLowerCase().includes(q) ||
        p.productId.toLowerCase().includes(q)
    )
  }, [products, productSearch])

  const dirtyCount = useMemo(() => {
    if (!customerId) return 0
    let count = 0
    for (const product of products) {
      const mapping = customerPricings.find((p) => p.productId === product.productId)
      const saved = mapping ? String(mapping.customPrice) : ''
      const current = draft[product.productId] ?? ''
      if (current.trim() !== saved) count += 1
    }
    return count
  }, [customerId, products, customerPricings, draft])

  const customPricedCount = useMemo(() => {
    return products.reduce((count, product) => {
      return (draft[product.productId] ?? '').trim() !== '' ? count + 1 : count
    }, 0)
  }, [products, draft])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const entries = products.map((product) => {
        const raw = (draft[product.productId] ?? '').trim()
        if (raw === '') {
          return { productId: product.productId, customPrice: null }
        }
        const value = Number(raw)
        if (Number.isNaN(value) || value < 0) {
          throw new Error(`Invalid price for ${product.productName}`)
        }
        return { productId: product.productId, customPrice: value }
      })
      await pricingRepository.saveForCustomer(customerId, entries)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pricing'] })
      toast.success('Custom prices saved')
    },
    onError: (error) => toast.error(getFirestoreErrorMessage(error)),
  })

  const resetDraft = () => {
    setDraft(buildDraftFromPricing(products, customerPricings))
    setBulkAdjust('')
  }

  const fillBasePrices = () => {
    setDraft((prev) => {
      const next = { ...prev }
      for (const product of products) {
        if ((next[product.productId] ?? '').trim() === '') {
          next[product.productId] = String(product.basePrice)
        }
      }
      return next
    })
  }

  const applyBulkAdjust = (direction: 1 | -1) => {
    const amount = Number(bulkAdjust)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a positive amount to add or subtract')
      return
    }
    if (customPricedCount === 0) {
      toast.error('No products have custom pricing yet')
      return
    }

    const delta = direction * amount
    let updated = 0
    setDraft((prev) => {
      const next = { ...prev }
      for (const product of products) {
        const raw = (next[product.productId] ?? '').trim()
        if (raw === '') continue
        const current = Number(raw)
        if (Number.isNaN(current)) continue
        const value = Math.max(0, Math.round((current + delta) * 100) / 100)
        next[product.productId] = String(value)
        updated += 1
      }
      return next
    })

    toast.success(
      `${direction > 0 ? 'Added' : 'Subtracted'} ₹${amount} on ${updated} custom price${updated === 1 ? '' : 's'}`
    )
  }

  const isLoading = customersLoading || productsLoading
  const busy = saveMutation.isPending

  return (
    <div className="space-y-4">
      {/* Customer + primary actions */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1.5 w-full max-w-md">
              <Label htmlFor="pricing-customer">Customer</Label>
              <select
                id="pricing-customer"
                value={customerId}
                onChange={(e) => {
                  setCustomerId(e.target.value)
                  setProductSearch('')
                  setBulkAdjust('')
                }}
                className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Select customer...</option>
                {sortedCustomers.map((c) => (
                  <option key={c.customerId} value={c.customerId}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {customerId && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={fillBasePrices}
                  disabled={busy}
                  className="text-gray-600"
                >
                  Fill empty with base
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={resetDraft}
                  disabled={busy || dirtyCount === 0}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset
                </Button>
                <Button
                  size="sm"
                  onClick={() => saveMutation.mutate()}
                  disabled={busy || dirtyCount === 0 || pricingLoading}
                  className="min-w-[7.5rem]"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save{dirtyCount > 0 ? ` (${dirtyCount})` : ''}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {!customerId ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Tags className="h-10 w-10 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-600 dark:text-gray-300 font-medium">Select a customer</p>
            <p className="text-sm text-gray-400 mt-1">
              Set custom product prices for that customer, then save once
            </p>
          </CardContent>
        </Card>
      ) : isLoading || pricingLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-xl" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-gray-500">No products yet</p>
            <p className="text-sm text-gray-400 mt-1">Add products before setting custom pricing</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {/* Tools bar */}
          <div className="border-b border-gray-100 dark:border-[#2a3040] bg-gray-50/70 dark:bg-[#1e2330]/50 px-4 py-3 space-y-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="relative w-full md:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Search products..."
                  className="pl-9 h-9 bg-white dark:bg-[#252d3d]"
                />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                <span>
                  <span className="font-semibold text-gray-700 dark:text-gray-300">{customPricedCount}</span> custom
                </span>
                <span className="text-gray-300 dark:text-gray-600">·</span>
                <span>
                  <span className="font-semibold text-gray-700 dark:text-gray-300">{dirtyCount}</span> unsaved
                </span>
                {pricingFetching && !pricingLoading && (
                  <>
                    <span className="text-gray-300 dark:text-gray-600">·</span>
                    <span>Refreshing…</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-gray-200 dark:border-[#2a3040] bg-white dark:bg-[#252d3d]/80 px-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  Bulk adjust
                </p>
                <p className="text-xs text-gray-500">
                  Applies only to products with a custom price set
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                    ₹
                  </span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    placeholder="0"
                    value={bulkAdjust}
                    onChange={(e) => setBulkAdjust(e.target.value)}
                    className="h-9 w-28 pl-6"
                    disabled={busy}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyBulkAdjust(1)}
                  disabled={busy || customPricedCount === 0}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyBulkAdjust(-1)}
                  disabled={busy || customPricedCount === 0}
                >
                  <Minus className="h-3.5 w-3.5" />
                  Subtract
                </Button>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-[#2a3040]">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Product
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Unit
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Base
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide w-44">
                    Custom (₹)
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => {
                  const value = draft[product.productId] ?? ''
                  const hasCustom = value.trim() !== ''
                  const mapping = customerPricings.find((p) => p.productId === product.productId)
                  const saved = mapping ? String(mapping.customPrice) : ''
                  const isDirty = value.trim() !== saved
                  return (
                    <tr
                      key={product.productId}
                      className={cn(
                        'border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50/80 dark:hover:bg-gray-800/20',
                        hasCustom && 'bg-blue-50/70 dark:bg-blue-950/25',
                        isDirty && 'bg-amber-50/70 dark:bg-amber-950/20'
                      )}
                    >
                      <td className="py-2.5 px-4 font-medium text-gray-900 dark:text-gray-100">
                        <span className="inline-flex items-center gap-2">
                          {hasCustom && (
                            <span
                              className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0"
                              title="Custom price set"
                            />
                          )}
                          {product.productName}
                          {isDirty && (
                            <span
                              className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0"
                              title="Unsaved change"
                            />
                          )}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-gray-500">{product.unit}</td>
                      <td
                        className={cn(
                          'py-2.5 px-4 text-right tabular-nums',
                          hasCustom ? 'text-gray-400 line-through' : 'text-gray-600 dark:text-gray-400'
                        )}
                      >
                        {formatCurrency(product.basePrice)}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          inputMode="decimal"
                          placeholder={String(product.basePrice)}
                          value={value}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              [product.productId]: e.target.value,
                            }))
                          }
                          className="h-8 text-right ml-auto max-w-[9rem] tabular-nums"
                          disabled={busy}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {filteredProducts.length === 0 ? (
            <p className="text-sm text-center text-gray-500 py-10">No products match your search</p>
          ) : (
            <p className="px-4 py-2.5 text-xs text-gray-400 border-t border-gray-100 dark:border-[#2a3040]">
              Leave custom price blank to use the base price
            </p>
          )}
        </Card>
      )}
    </div>
  )
}
