import { useEffect, useMemo, useRef, useState } from 'react'
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
  const searchRef = useRef<HTMLInputElement>(null)

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

  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => searchRef.current?.focus(), 50)
    return () => window.clearTimeout(t)
  }, [open])

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
          className="max-w-md p-0 gap-0 overflow-hidden"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader className="px-4 pt-4 pb-2 pr-12">
            <DialogTitle className="text-base">Select product</DialogTitle>
          </DialogHeader>

          <div className="relative px-4 pb-3">
            <Search className="absolute left-7 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search all products..."
              className="h-10 w-full rounded-md border border-input bg-transparent pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <p className="px-4 pb-2 text-xs text-gray-500">
            {q
              ? `Showing matches across all products (${options.length})`
              : starred.length > 0
                ? 'Starred products — type to search all'
                : 'No starred products — type to search all'}
          </p>

          <ul className="max-h-[min(50vh,22rem)] overflow-y-auto border-t border-gray-100 dark:border-gray-800 py-1">
            <li>
              <button
                type="button"
                className="w-full px-4 py-2.5 text-left text-sm text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-900"
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
                      'flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-900',
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
