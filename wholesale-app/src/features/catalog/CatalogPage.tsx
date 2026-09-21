import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Images, Loader2, MapPin, Phone, Mail, FileText } from 'lucide-react'
import { catalogProductRepository } from '@/firebase/repositories/catalogProductRepository'
import { settingsRepository } from '@/firebase/repositories/settingsRepository'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import CatalogProductCard from './CatalogProductCard'

export default function CatalogPage() {
  const [activeFilterId, setActiveFilterId] = useState<string | 'all'>('all')

  const { data: shopProfile } = useQuery({
    queryKey: ['shopProfile', 'public'],
    queryFn: () => settingsRepository.getShopProfile(),
    staleTime: 5 * 60_000,
  })

  const { data: catalogFiltersSettings } = useQuery({
    queryKey: ['catalogFilters', 'public'],
    queryFn: () => settingsRepository.getCatalogFilters(),
    staleTime: 5 * 60_000,
  })
  const catalogFilters = catalogFiltersSettings?.filters ?? []

  const {
    data: products = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['catalogProducts', 'public'],
    queryFn: () => catalogProductRepository.getAll(),
    staleTime: 60_000,
  })

  const filteredProducts = useMemo(() => {
    if (activeFilterId === 'all') return products
    return products.filter((p) => (p.filterIds ?? []).includes(activeFilterId))
  }, [products, activeFilterId])

  const shopName = shopProfile?.name?.trim() || 'Shop'
  const addressParts = [
    shopProfile?.address,
    shopProfile?.city,
    shopProfile?.state,
    shopProfile?.pincode,
  ].filter(Boolean)
  const fullAddress = addressParts.join(', ')
  const hasFooterDetails =
    Boolean(shopName) ||
    Boolean(fullAddress) ||
    Boolean(shopProfile?.phone?.trim()) ||
    Boolean(shopProfile?.email?.trim()) ||
    Boolean(shopProfile?.gstNumber?.trim())

  const showFilterPills = catalogFilters.length > 0

  return (
    <div className="flex min-h-screen flex-col bg-[#f5f6f8]">
      <header className="sticky top-0 z-20 border-b border-black/5 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-indigo-600">
              {shopName}
            </p>
            <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
              Product Catalog
            </h1>
          </div>
          <div className="hidden sm:flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
            <Images className="h-5 w-5" />
          </div>
        </div>

        {showFilterPills && (
          <div className="mx-auto max-w-7xl overflow-x-auto px-4 pb-3 sm:px-6">
            <div className="flex w-max items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveFilterId('all')}
                className={cn(
                  'rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors',
                  activeFilterId === 'all'
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                )}
              >
                All
              </button>
              {catalogFilters.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setActiveFilterId(filter.id)}
                  className={cn(
                    'rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap',
                    activeFilterId === filter.id
                      ? 'border-indigo-600 bg-indigo-600 text-white'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  )}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-5 min-[640px]:grid-cols-2 min-[1281px]:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-3xl bg-white">
                <Skeleton className="aspect-[3/4] w-full rounded-none" />
                <div className="space-y-3 p-5">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-6 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-3xl bg-white px-6 py-16 text-center shadow-sm">
            <p className="text-sm text-red-500">
              Could not load catalog
              {error instanceof Error ? `: ${error.message}` : '.'}
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
            >
              <Loader2 className="h-4 w-4" />
              Retry
            </button>
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-3xl bg-white px-6 py-20 text-center shadow-sm">
            <Images className="mx-auto mb-3 h-10 w-10 text-gray-300" />
            <p className="text-gray-500">No products in the catalog yet.</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="rounded-3xl bg-white px-6 py-20 text-center shadow-sm">
            <Images className="mx-auto mb-3 h-10 w-10 text-gray-300" />
            <p className="text-gray-500">No products in this filter.</p>
            <button
              type="button"
              onClick={() => setActiveFilterId('all')}
              className="mt-4 text-sm font-medium text-indigo-600 hover:underline"
            >
              Show all products
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 min-[640px]:grid-cols-2 min-[1281px]:grid-cols-3">
            {filteredProducts.map((product) => (
              <CatalogProductCard
                key={product.catalogProductId}
                product={product}
              />
            ))}
          </div>
        )}
      </main>

      <div className="mt-auto">
        {hasFooterDetails && (
          <footer className="border-t border-black/5 bg-white">
            <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-indigo-600">
                    Contact
                  </p>
                  <h2 className="text-lg font-semibold text-gray-900">{shopName}</h2>
                  {fullAddress && (
                    <p className="flex items-start gap-2 text-sm text-gray-500">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                      <span>{fullAddress}</span>
                    </p>
                  )}
                </div>

                <div className="space-y-2 text-sm text-gray-600">
                  {shopProfile?.phone?.trim() && (
                    <a
                      href={`tel:${shopProfile.phone.trim()}`}
                      className="flex items-center gap-2 hover:text-indigo-600"
                    >
                      <Phone className="h-4 w-4 shrink-0 text-gray-400" />
                      {shopProfile.phone.trim()}
                    </a>
                  )}
                  {shopProfile?.email?.trim() && (
                    <a
                      href={`mailto:${shopProfile.email.trim()}`}
                      className="flex items-center gap-2 hover:text-indigo-600"
                    >
                      <Mail className="h-4 w-4 shrink-0 text-gray-400" />
                      {shopProfile.email.trim()}
                    </a>
                  )}
                  {shopProfile?.gstNumber?.trim() && (
                    <p className="flex items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-gray-400" />
                      GST: {shopProfile.gstNumber.trim()}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </footer>
        )}

        <div className="border-t border-black/5 bg-[#eef0f4]">
          <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
            <p className="text-center text-xs text-gray-500">
              Created by{' '}
              <span className="font-medium text-gray-700">Vishwas</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
