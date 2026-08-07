import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Tags, Save, RotateCcw } from 'lucide-react'
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
import { formatCurrency } from '@/lib/utils'

/** Empty string = no custom price (use base). */
type PriceDraft = Record<string, string>

export default function PricingManagement() {
  const queryClient = useQueryClient()
  const [customerId, setCustomerId] = useState('')
  const [draft, setDraft] = useState<PriceDraft>({})
  const [productSearch, setProductSearch] = useState('')

  const { data: customers = [], isLoading: customersLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: customerRepository.getAll,
  })
  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ['products'],
    queryFn: productRepository.getAll,
  })
  const {
    data: customerPricings = [],
    isLoading: pricingLoading,
    isFetching: pricingFetching,
  } = useQuery({
    queryKey: ['pricing', customerId],
    queryFn: () => pricingRepository.getByCustomer(customerId),
    enabled: !!customerId,
  })

  // Reset draft whenever customer or their saved pricing changes
  useEffect(() => {
    if (!customerId) {
      setDraft({})
      return
    }
    const next: PriceDraft = {}
    for (const product of products) {
      const mapping = customerPricings.find((p) => p.productId === product.productId)
      next[product.productId] = mapping ? String(mapping.customPrice) : ''
    }
    setDraft(next)
  }, [customerId, products, customerPricings])

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
    const next: PriceDraft = {}
    for (const product of products) {
      const mapping = customerPricings.find((p) => p.productId === product.productId)
      next[product.productId] = mapping ? String(mapping.customPrice) : ''
    }
    setDraft(next)
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

  const isLoading = customersLoading || productsLoading

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5 w-full sm:max-w-sm">
          <Label>Customer</Label>
          <select
            value={customerId}
            onChange={(e) => {
              setCustomerId(e.target.value)
              setProductSearch('')
            }}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={fillBasePrices} disabled={saveMutation.isPending}>
              Fill empty with base
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={resetDraft}
              disabled={saveMutation.isPending || dirtyCount === 0}
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || dirtyCount === 0 || pricingLoading}
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save all{dirtyCount > 0 ? ` (${dirtyCount})` : ''}
            </Button>
          </div>
        )}
      </div>

      {!customerId ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Tags className="h-10 w-10 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">Select a customer to set custom prices</p>
            <p className="text-sm text-gray-400 mt-1">
              Edit every product price for that customer, then save once
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
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Input
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Search products..."
              className="sm:max-w-xs"
            />
            <p className="text-xs text-gray-500">
              Leave blank to use base price
              {pricingFetching && !pricingLoading ? ' · Refreshing…' : ''}
            </p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/40">
                  <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Product
                  </th>
                  <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Unit
                  </th>
                  <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Base Price
                  </th>
                  <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-40">
                    Custom Price (₹)
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => {
                  const value = draft[product.productId] ?? ''
                  const hasCustom = value.trim() !== ''
                  return (
                    <tr
                      key={product.productId}
                      className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30"
                    >
                      <td className="py-2.5 px-3 font-medium">{product.productName}</td>
                      <td className="py-2.5 px-3 text-gray-500">{product.unit}</td>
                      <td
                        className={`py-2.5 px-3 text-right ${hasCustom ? 'text-gray-400 line-through' : 'text-gray-600 dark:text-gray-400'}`}
                      >
                        {formatCurrency(product.basePrice)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
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
                          className="h-8 text-right ml-auto max-w-[9rem]"
                          disabled={saveMutation.isPending}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {filteredProducts.length === 0 && (
            <p className="text-sm text-center text-gray-500 py-6">No products match your search</p>
          )}
        </>
      )}
    </div>
  )
}
