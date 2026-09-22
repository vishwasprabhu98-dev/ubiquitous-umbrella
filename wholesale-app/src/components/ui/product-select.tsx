import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Search, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { sortProductsForSelect } from '@/lib/products'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Product } from '@/types'

interface ProductSelectProps {
  products: Product[]
  value: string
  onChange: (productId: string) => void
  disabled?: boolean
  placeholder?: string
  className?: string
}

function useIsMobile(breakpointPx = 640) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(`(max-width: ${breakpointPx - 1}px)`).matches : false
  )

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpointPx - 1}px)`)
    const onChange = () => setIsMobile(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [breakpointPx])

  return isMobile
}

/** Keyboard overlap from the bottom of the layout viewport (iOS / Android). */
function useKeyboardInset(enabled: boolean) {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    if (!enabled) {
      setInset(0)
      return
    }

    const vv = window.visualViewport
    if (!vv) return

    const sync = () => {
      const next = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
      setInset(next)
    }

    sync()
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    window.addEventListener('resize', sync)
    return () => {
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
      window.removeEventListener('resize', sync)
    }
  }, [enabled])

  return inset
}

export function ProductSelect({
  products,
  value,
  onChange,
  disabled,
  placeholder = 'Select product...',
  className,
}: ProductSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const isMobile = useIsMobile()
  const keyboardInset = useKeyboardInset(open && isMobile)

  const selected = products.find((p) => p.productId === value)
  const sorted = useMemo(() => sortProductsForSelect(products), [products])
  const starred = useMemo(() => sorted.filter((p) => p.starred), [sorted])

  const q = query.trim().toLowerCase()
  const options = useMemo(() => {
    if (!q) return starred
    return sorted.filter(
      (p) =>
        p.productName.toLowerCase().includes(q) ||
        p.productId.toLowerCase().includes(q)
    )
  }, [q, starred, sorted])

  const pick = (productId: string) => {
    onChange(productId)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className={cn(className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-left text-sm shadow-sm',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
          !selected && 'text-muted-foreground'
        )}
      >
        <span className="truncate flex items-center gap-1.5 min-w-0">
          {selected?.starred && (
            <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />
          )}
          <span className="truncate">{selected?.productName || placeholder}</span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
      </button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setQuery('')
        }}
      >
        <DialogContent
          overlayClassName={cn(
            'z-[70] bg-black/60 backdrop-blur-md',
            isMobile && 'product-select-overlay'
          )}
          className={cn(
            'z-[71] flex min-h-0 flex-col gap-0 overflow-hidden p-0',
            // Mobile: bottom sheet
            'max-sm:fixed max-sm:inset-x-0 max-sm:left-0 max-sm:top-auto max-sm:w-full max-sm:max-w-none',
            'max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-2xl',
            'max-sm:border-x-0 max-sm:border-b-0 max-sm:pb-[env(safe-area-inset-bottom)]',
            'max-sm:transition-[bottom,max-height] max-sm:duration-200 max-sm:ease-out',
            // Desktop: keep centered card
            'sm:max-w-md',
            isMobile && 'product-select-sheet-mobile'
          )}
          style={
            isMobile
              ? {
                  bottom: keyboardInset,
                  maxHeight: `min(88dvh, calc(100dvh - ${keyboardInset}px - 0.5rem))`,
                }
              : undefined
          }
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {isMobile && (
            <div className="flex justify-center pt-2.5 pb-1" aria-hidden>
              <span className="h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-600" />
            </div>
          )}

          <DialogHeader className="px-4 pt-3 pb-2 pr-12 sm:pt-4">
            <DialogTitle className="text-base">Select product</DialogTitle>
          </DialogHeader>

          <div className="relative px-4 pb-3">
            <Search className="absolute left-7 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search all products..."
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className="h-11 w-full rounded-md border border-input bg-transparent pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring sm:h-10"
            />
          </div>

          <p className="px-4 pb-2 text-xs text-gray-500">
            {q
              ? `Showing matches across all products (${options.length})`
              : starred.length > 0
                ? 'Starred products — type to search all'
                : 'No starred products — type to search all'}
          </p>

          <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-gray-100 dark:border-gray-800 py-1 max-sm:max-h-none sm:max-h-[min(50vh,22rem)]">
            <li>
              <button
                type="button"
                className="w-full px-4 py-3 text-left text-sm text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-900 sm:py-2.5"
                onClick={() => pick('')}
              >
                {placeholder}
              </button>
            </li>
            {options.length === 0 ? (
              <li className="px-4 py-6 text-sm text-center text-gray-400">
                {q ? 'No products match your search' : 'Star products in Settings, or search by name'}
              </li>
            ) : (
              options.map((p) => (
                <li key={p.productId}>
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-center gap-2 px-4 py-3 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-900 sm:py-2.5',
                      p.productId === value &&
                        'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                    )}
                    onClick={() => pick(p.productId)}
                  >
                    <Star
                      className={cn(
                        'h-3.5 w-3.5 shrink-0',
                        p.starred
                          ? 'fill-amber-400 text-amber-400'
                          : 'text-gray-200 dark:text-gray-700'
                      )}
                    />
                    <span className="truncate flex-1">{p.productName}</span>
                    <span className="text-xs text-gray-400 shrink-0">{p.unit}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  )
}
