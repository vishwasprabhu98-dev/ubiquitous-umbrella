import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Package, Search } from 'lucide-react'
import { billRepository } from '@/firebase/repositories/billRepository'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency } from '@/lib/utils'
import {
  MONTH_LABELS,
  currentIstMonthKey,
  formatMonthKey,
  getBillDateString,
  istMonthBounds,
  parseMonthKey,
} from '@/lib/istDate'

interface ItemSaleRow {
  key: string
  productId: string
  productName: string
  quantity: number
  amount: number
  billCount: number
}

function buildItemSales(bills: { billId: string; items?: { productId?: string; productName?: string; quantity?: number; total?: number }[] }[]): ItemSaleRow[] {
  const map = new Map<string, ItemSaleRow & { billIds: Set<string> }>()

  for (const bill of bills) {
    for (const item of bill.items ?? []) {
      const productId = (item.productId || '').trim()
      const productName = (item.productName || 'Unknown item').trim() || 'Unknown item'
      const key = productId || productName.toLowerCase()
      const qty = Number(item.quantity) || 0
      const amount = Number(item.total) || 0
      if (qty === 0 && amount === 0) continue

      const existing = map.get(key)
      if (existing) {
        existing.quantity += qty
        existing.amount += amount
        existing.billIds.add(bill.billId)
        if (!existing.productId && productId) existing.productId = productId
        if (productName && existing.productName === 'Unknown item') existing.productName = productName
      } else {
        map.set(key, {
          key,
          productId,
          productName,
          quantity: qty,
          amount,
          billCount: 0,
          billIds: new Set([bill.billId]),
        })
      }
    }
  }

  return [...map.values()]
    .map(({ billIds, ...row }) => ({ ...row, billCount: billIds.size }))
    .sort((a, b) => b.quantity - a.quantity || a.productName.localeCompare(b.productName))
}

export default function ItemWiseSaleReportPage() {
  const [monthKey, setMonthKey] = useState(() => currentIstMonthKey())
  const [search, setSearch] = useState('')
  const periodParts = useMemo(() => parseMonthKey(monthKey), [monthKey])

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear()
    const years: number[] = []
    for (let y = current; y >= current - 5; y--) years.push(y)
    return years
  }, [])

  const { data: bills = [], isLoading, isFetching } = useQuery({
    queryKey: ['bills', 'item-wise-sales', monthKey],
    queryFn: async () => {
      const bounds = istMonthBounds(monthKey)
      if (!bounds) return []
      const rangeBills = await billRepository.getByDateRange(bounds.from, bounds.to)
      return rangeBills.filter((bill) => {
        const day = getBillDateString(bill)
        return day ? day.startsWith(monthKey) : true
      })
    },
  })

  const rows = useMemo(() => buildItemSales(bills), [bills])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (row) =>
        row.productName.toLowerCase().includes(q) ||
        row.productId.toLowerCase().includes(q)
    )
  }, [rows, search])

  const totals = useMemo(
    () =>
      filteredRows.reduce(
        (acc, row) => {
          acc.quantity += row.quantity
          acc.amount += row.amount
          return acc
        },
        { quantity: 0, amount: 0 }
      ),
    [filteredRows]
  )

  const shiftMonth = (delta: number) => {
    const parts = parseMonthKey(monthKey)
    if (!parts) return
    const date = new Date(parts.year, parts.month - 1 + delta, 1)
    setMonthKey(formatMonthKey(date.getFullYear(), date.getMonth() + 1))
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Item Wise Sale Report</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Quantity of each item sold in the selected month
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-[#2a3040] dark:bg-[#252d3d]/60">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="space-y-1 flex-1">
            <Label className="text-xs text-gray-500">Month</Label>
            <select
              value={periodParts?.month ?? 1}
              onChange={(e) => {
                const m = Number(e.target.value)
                const y = periodParts?.year ?? new Date().getFullYear()
                setMonthKey(formatMonthKey(y, m))
              }}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {MONTH_LABELS.map((label, i) => (
                <option key={label} value={i + 1}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1 flex-1">
            <Label className="text-xs text-gray-500">Year</Label>
            <select
              value={periodParts?.year ?? new Date().getFullYear()}
              onChange={(e) => {
                const y = Number(e.target.value)
                const m = periodParts?.month ?? 1
                setMonthKey(formatMonthKey(y, m))
              }}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={() => shiftMonth(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={() => shiftMonth(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 sm:p-4">
            <p className="text-xs text-gray-500">Items</p>
            <p className="mt-1 text-lg font-bold text-gray-900 dark:text-white">{filteredRows.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <p className="text-xs text-gray-500">Qty sold</p>
            <p className="mt-1 text-lg font-bold text-gray-900 dark:text-white">
              {totals.quantity.toLocaleString('en-IN')}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <p className="text-xs text-gray-500">Bills</p>
            <p className="mt-1 text-lg font-bold text-gray-900 dark:text-white">{bills.length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search item..."
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : filteredRows.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center">
            <Package className="mx-auto mb-3 h-10 w-10 text-gray-300" />
            <p className="text-gray-500">
              {search.trim()
                ? 'No items match your search'
                : `No sales found for ${MONTH_LABELS[(periodParts?.month ?? 1) - 1]} ${periodParts?.year ?? ''}`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-[#2a3040] dark:bg-[#1e2330]">
          <div className="hidden border-b border-gray-100 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400 sm:grid sm:grid-cols-[minmax(0,1fr)_88px_110px] dark:border-[#2a3040]">
            <span>Item</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Amount</span>
          </div>
          <div className={isFetching ? 'opacity-70' : undefined}>
            {filteredRows.map((row, index) => (
              <div
                key={row.key}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-gray-100 px-4 py-3 last:border-0 sm:grid-cols-[minmax(0,1fr)_88px_110px] dark:border-[#2a3040]"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-900 dark:text-white">
                    <span className="mr-2 text-xs text-gray-400">{index + 1}.</span>
                    {row.productName}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {row.billCount} bill{row.billCount === 1 ? '' : 's'}
                    {row.productId ? ` · ${row.productId}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold tabular-nums text-blue-600 dark:text-blue-400">
                    {row.quantity.toLocaleString('en-IN')}
                  </p>
                  <p className="text-xs text-gray-400 sm:hidden">{formatCurrency(row.amount)}</p>
                </div>
                <div className="hidden text-right font-medium tabular-nums text-gray-700 dark:text-gray-200 sm:block">
                  {formatCurrency(row.amount)}
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-t border-gray-200 bg-gray-50 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_88px_110px] dark:border-[#2a3040] dark:bg-[#252d3d]/60">
            <p className="font-semibold text-gray-900 dark:text-white">Total</p>
            <p className="text-right font-bold tabular-nums text-blue-600 dark:text-blue-400">
              {totals.quantity.toLocaleString('en-IN')}
            </p>
            <p className="hidden text-right font-bold tabular-nums text-gray-900 dark:text-white sm:block">
              {formatCurrency(totals.amount)}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
