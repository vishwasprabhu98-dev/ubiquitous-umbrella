import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { toDisplayImageUrls } from '@/lib/driveImageUrl'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { CatalogProduct } from '@/types'

interface CatalogProductCardProps {
  product: CatalogProduct
}

const SWIPE_THRESHOLD_PX = 40

export default function CatalogProductCard({ product }: CatalogProductCardProps) {
  const images = toDisplayImageUrls(product.imageUrls, 1000)
  const lightboxImages = toDisplayImageUrls(product.imageUrls, 2000)
  const sizes = product.sizes?.filter((s) => s.label.trim()) ?? []
  const hasSizes = sizes.length > 0

  const [index, setIndex] = useState(0)
  const [sizeIndex, setSizeIndex] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const swipeMoved = useRef(false)

  const hasMultiple = images.length > 1
  const safeIndex = Math.min(index, Math.max(0, images.length - 1))
  const current = images[safeIndex] ?? ''
  const lightboxCurrent = lightboxImages[safeIndex] ?? current

  const selectedSize = hasSizes
    ? sizes[Math.min(sizeIndex, sizes.length - 1)]
    : null
  const originalPrice = selectedSize?.originalPrice ?? product.originalPrice
  const discountedPrice = selectedSize?.discountedPrice ?? product.discountedPrice
  const hasDiscount = discountedPrice < originalPrice && originalPrice > 0
  const unit = product.unit?.trim() || 'Piece'

  const goPrev = () => {
    setIndex((i) => (i - 1 + images.length) % images.length)
  }

  const goNext = () => {
    setIndex((i) => (i + 1) % images.length)
  }

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY }
    swipeMoved.current = false
  }

  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return
    const t = e.changedTouches[0]
    const dx = t.clientX - touchStart.current.x
    const dy = t.clientY - touchStart.current.y
    touchStart.current = null

    if (hasMultiple && Math.abs(dx) >= SWIPE_THRESHOLD_PX && Math.abs(dx) >= Math.abs(dy)) {
      swipeMoved.current = true
      if (dx < 0) goNext()
      else goPrev()
    }
  }

  const openLightbox = () => {
    if (!current || swipeMoved.current) return
    setLightboxOpen(true)
  }

  return (
    <>
      <article className="group flex flex-col overflow-hidden rounded-3xl bg-white shadow-[0_8px_30px_rgba(15,23,42,0.06)] ring-1 ring-black/5 transition-shadow hover:shadow-[0_12px_40px_rgba(15,23,42,0.1)]">
        <div
          className="relative aspect-[3/4] w-full touch-pan-y overflow-hidden bg-[#f3f4f6]"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {current ? (
            <button
              type="button"
              onClick={openLightbox}
              aria-label={`View ${product.name} image`}
              className="absolute inset-0 cursor-zoom-in"
            >
              <img
                src={current}
                alt={product.name}
                draggable={false}
                className="h-full w-full select-none object-cover object-center"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            </button>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-400">
              <ImageOff className="h-10 w-10" />
              <span className="text-xs">No image</span>
            </div>
          )}

          {product.badge && (
            <span className="pointer-events-none absolute left-3 top-3 z-[1] rounded-full bg-amber-300 px-3 py-1 text-xs font-semibold text-amber-950 shadow-sm">
              {product.badge}
            </span>
          )}

          {hasMultiple && (
            <>
              <button
                type="button"
                aria-label="Previous image"
                onClick={(e) => {
                  e.stopPropagation()
                  goPrev()
                }}
                className="absolute left-2 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-gray-800 shadow-md backdrop-blur-sm transition hover:bg-white md:flex"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                aria-label="Next image"
                onClick={(e) => {
                  e.stopPropagation()
                  goNext()
                }}
                className="absolute right-2 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-gray-800 shadow-md backdrop-blur-sm transition hover:bg-white md:flex"
              >
                <ChevronRight className="h-5 w-5" />
              </button>

              <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
                {images.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Image ${i + 1}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      setIndex(i)
                    }}
                    className={cn(
                      'h-1.5 rounded-full transition-all',
                      i === index
                        ? 'w-4 bg-indigo-600'
                        : 'w-1.5 bg-white/80 ring-1 ring-black/10'
                    )}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-2 p-5">
          <h2 className="text-lg font-bold leading-snug text-gray-900">
            {product.name}
          </h2>
          <p className="text-sm leading-relaxed text-gray-500 line-clamp-3">
            {product.description}
          </p>

          {hasSizes && (
            <div className="pt-1">
              <p className="mb-1.5 text-xs font-semibold text-gray-700">Size</p>
              <div className="flex flex-wrap gap-2">
                {sizes.map((size, i) => (
                  <button
                    key={`${size.label}-${i}`}
                    type="button"
                    onClick={() => setSizeIndex(i)}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-medium border transition-colors',
                      i === sizeIndex
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                    )}
                  >
                    {size.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-auto flex items-baseline gap-2 pt-2">
            <span className="text-xl font-bold text-gray-900">
              {formatCurrency(discountedPrice)}
            </span>
            {hasDiscount && (
              <span className="text-sm text-gray-400 line-through">
                {formatCurrency(originalPrice)}
              </span>
            )}
            <span className="text-sm font-medium text-gray-500">/ {unit}</span>
          </div>
        </div>
      </article>

      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent
          overlayClassName="z-[80] bg-black/75 backdrop-blur-sm"
          className={cn(
            'z-[81] max-h-[95vh] w-[calc(100%-1rem)] max-w-4xl overflow-hidden border-0 bg-transparent p-0 shadow-none',
            'gap-0 sm:p-0',
            '[&>button]:rounded-full [&>button]:bg-white/90 [&>button]:p-1.5 [&>button]:opacity-100 [&>button]:shadow-md [&>button]:hover:bg-white [&>button]:hover:opacity-100'
          )}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{product.name}</DialogTitle>
          </DialogHeader>

          <div className="relative flex max-h-[95vh] flex-col items-center justify-center">
            <div className="relative w-full overflow-hidden rounded-2xl bg-black/40">
              {lightboxCurrent ? (
                <img
                  src={lightboxCurrent}
                  alt={product.name}
                  className="mx-auto max-h-[min(85vh,900px)] w-full object-contain"
                  referrerPolicy="no-referrer"
                />
              ) : null}

              {hasMultiple && (
                <>
                  <button
                    type="button"
                    aria-label="Previous image"
                    onClick={goPrev}
                    className="absolute left-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-gray-800 shadow-md backdrop-blur-sm transition hover:bg-white sm:left-3"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next image"
                    onClick={goNext}
                    className="absolute right-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-gray-800 shadow-md backdrop-blur-sm transition hover:bg-white sm:right-3"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>

                  <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
                    {images.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        aria-label={`Image ${i + 1}`}
                        onClick={() => setIndex(i)}
                        className={cn(
                          'h-1.5 rounded-full transition-all',
                          i === index
                            ? 'w-4 bg-white'
                            : 'w-1.5 bg-white/50 ring-1 ring-white/20'
                        )}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>

            <p className="mt-3 px-4 text-center text-sm font-medium text-white">
              {product.name}
              {hasMultiple ? ` · ${safeIndex + 1} / ${images.length}` : ''}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
