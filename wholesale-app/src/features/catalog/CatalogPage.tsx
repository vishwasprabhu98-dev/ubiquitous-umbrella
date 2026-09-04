import { useQuery } from '@tanstack/react-query'
import { Images, Loader2 } from 'lucide-react'
import { catalogProductRepository } from '@/firebase/repositories/catalogProductRepository'
import { settingsRepository } from '@/firebase/repositories/settingsRepository'
import { Skeleton } from '@/components/ui/skeleton'
import CatalogProductCard from './CatalogProductCard'

export default function CatalogPage() {
  const { data: shopProfile } = useQuery({
    queryKey: ['shopProfile', 'public'],
    queryFn: () => settingsRepository.getShopProfile(),
    staleTime: 5 * 60_000,
  })

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

  const shopName = shopProfile?.name?.trim() || 'Shop'

  return (
    <div className="min-h-screen bg-[#f5f6f8]">
      <header className="sticky top-0 z-20 border-b border-black/5 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
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
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
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
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <CatalogProductCard
                key={product.catalogProductId}
                product={product}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
