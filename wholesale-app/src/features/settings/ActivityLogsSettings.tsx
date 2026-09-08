import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ScrollText, Loader2, RefreshCw, Search } from 'lucide-react'
import {
  activityLogRepository,
  formatActivityTime,
} from '@/firebase/repositories/activityLogRepository'
import { todayIst, istDayStart, istDayEnd } from '@/lib/istDate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import type { ActivityEventType, ActivityLog } from '@/types'

const EVENT_LABELS: Record<ActivityEventType, string> = {
  'bill.created': 'Bill created',
  'bill.updated': 'Bill updated',
  'bill.payment_recorded': 'Bill payment',
  'bill.moved_to_ledger': 'Moved to ledger',
  'bill.removed_from_ledger': 'Removed from ledger',
  'bill.shared_whatsapp': 'WhatsApp share',
  'bill.shared_pdf': 'PDF share',
  'bill.printed': 'Printed',
  'ledger.payment_recorded': 'Ledger payment',
  'order.created': 'Order created',
  'order.updated': 'Order updated',
  'order.status_changed': 'Order status',
  'order.deleted': 'Order deleted',
  'order.converted_to_bill': 'Order → bill',
  'purchase.created': 'Purchase created',
  'purchase.updated': 'Purchase updated',
  'purchase.deleted': 'Purchase deleted',
  'settings.shop_profile_updated': 'Shop profile',
  'settings.number_format_updated': 'Number format',
  'settings.user_role_updated': 'User role',
  'settings.customer_created': 'Customer created',
  'settings.customer_updated': 'Customer updated',
  'settings.customer_deleted': 'Customer deleted',
  'settings.product_created': 'Product created',
  'settings.product_updated': 'Product updated',
  'settings.product_deleted': 'Product deleted',
  'settings.catalog_created': 'Catalog created',
  'settings.catalog_updated': 'Catalog updated',
  'settings.catalog_deleted': 'Catalog deleted',
  'settings.pricing_updated': 'Custom pricing',
  'settings.ledger_rebuilt': 'Ledger rebuilt',
}

const FILTER_OPTIONS: { value: 'all' | ActivityEventType; label: string }[] = [
  { value: 'all', label: 'All events' },
  { value: 'bill.created', label: 'Bills created' },
  { value: 'bill.updated', label: 'Bills updated' },
  { value: 'bill.payment_recorded', label: 'Bill payments' },
  { value: 'ledger.payment_recorded', label: 'Ledger payments' },
  { value: 'order.created', label: 'Orders created' },
  { value: 'order.updated', label: 'Orders updated' },
  { value: 'order.status_changed', label: 'Order status' },
  { value: 'order.deleted', label: 'Orders deleted' },
  { value: 'order.converted_to_bill', label: 'Order → bill' },
  { value: 'purchase.created', label: 'Purchases created' },
  { value: 'purchase.updated', label: 'Purchases updated' },
  { value: 'purchase.deleted', label: 'Purchases deleted' },
  { value: 'settings.shop_profile_updated', label: 'Shop profile' },
  { value: 'settings.number_format_updated', label: 'Number format' },
  { value: 'settings.user_role_updated', label: 'User roles' },
  { value: 'settings.customer_created', label: 'Customers' },
  { value: 'settings.product_created', label: 'Products' },
  { value: 'settings.catalog_created', label: 'Catalog' },
  { value: 'settings.pricing_updated', label: 'Pricing' },
  { value: 'settings.ledger_rebuilt', label: 'Ledger rebuild' },
]

function defaultLast24hDates(): { from: string; to: string } {
  const now = new Date()
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  return {
    from: from.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
    to: todayIst(),
  }
}

function matchesSearch(log: ActivityLog, q: string): boolean {
  if (!q) return true
  const hay = [
    log.description,
    log.actorName,
    log.actorEmail,
    log.entityLabel,
    log.customerName,
    log.itemsSummary,
    log.itemsBefore,
    log.itemsAfter,
    EVENT_LABELS[log.type] ?? log.type,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return hay.includes(q)
}

export default function ActivityLogsSettings() {
  const defaults = useMemo(() => defaultLast24hDates(), [])
  const [typeFilter, setTypeFilter] = useState<'all' | ActivityEventType>('all')
  const [fromDate, setFromDate] = useState(defaults.from)
  const [toDate, setToDate] = useState(defaults.to)
  const [rangeMode, setRangeMode] = useState<'24h' | 'custom'>('24h')
  const [search, setSearch] = useState('')

  const range = useMemo(() => {
    if (rangeMode === '24h') {
      return {
        from: new Date(Date.now() - 24 * 60 * 60 * 1000),
        to: new Date(),
      }
    }
    return {
      from: istDayStart(fromDate),
      to: istDayEnd(toDate),
    }
  }, [rangeMode, fromDate, toDate])

  const { data: logs = [], isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['activityLogs', typeFilter, rangeMode, fromDate, toDate],
    queryFn: () =>
      activityLogRepository.listRecent({
        limitCount: 400,
        type: typeFilter === 'all' ? undefined : typeFilter,
        from: range.from,
        to: range.to,
      }),
    staleTime: 15_000,
  })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return logs.filter((log) => matchesSearch(log, q))
  }, [logs, search])

  const resetLast24h = () => {
    const next = defaultLast24hDates()
    setFromDate(next.from)
    setToDate(next.to)
    setRangeMode('24h')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 dark:border-[#2a3040] bg-white dark:bg-[#252d3d]/60 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="activity-search">Search</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                id="activity-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="User, bill, items…"
                className="pl-9"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="activity-filter">Event</Label>
            <select
              id="activity-filter"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as 'all' | ActivityEventType)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="activity-from">From</Label>
            <Input
              id="activity-from"
              type="date"
              value={fromDate}
              max={toDate}
              onChange={(e) => {
                setFromDate(e.target.value)
                setRangeMode('custom')
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="activity-to">To</Label>
            <Input
              id="activity-to"
              type="date"
              value={toDate}
              min={fromDate}
              onChange={(e) => {
                setToDate(e.target.value)
                setRangeMode('custom')
              }}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={resetLast24h}>
            Last 24 hours{rangeMode === '24h' ? ' ✓' : ''}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </Button>
          <p className="text-xs text-gray-500 ml-auto">
            Showing {filtered.length} log{filtered.length === 1 ? '' : 's'}
            {search.trim() ? ' (filtered)' : ''}
          </p>
        </div>
      </div>

      <p className="text-xs text-gray-500">
        Defaults to the last 24 hours. Bill and order logs include item lines when available.
      </p>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <p className="text-sm text-red-500">
              Could not load logs
              {error instanceof Error ? `: ${error.message}` : '.'}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <ScrollText className="h-10 w-10 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">No activity in this range</p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-[#2a3040]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-[#2a3040] bg-gray-50 dark:bg-[#1e2330]">
                <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                  When
                </th>
                <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  User
                </th>
                <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Event
                </th>
                <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Description
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((log) => (
                <tr
                  key={log.logId}
                  className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30"
                >
                  <td className="py-3 px-3 text-xs text-gray-500 whitespace-nowrap align-top">
                    {formatActivityTime(log.createdAt)}
                  </td>
                  <td className="py-3 px-3 align-top">
                    <div className="font-medium text-gray-900 dark:text-white">
                      {log.actorName}
                    </div>
                    <div className="text-[11px] text-gray-400">
                      {log.actorEmail || log.actorRole}
                    </div>
                  </td>
                  <td className="py-3 px-3 align-top whitespace-nowrap">
                    <span className="inline-flex rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 text-[11px] font-medium">
                      {EVENT_LABELS[log.type] ?? log.type}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-gray-700 dark:text-gray-300 align-top">
                    <div>{log.description}</div>
                    {log.entityLabel && (
                      <span className="block text-[11px] text-gray-400 mt-0.5">
                        {log.entityLabel}
                        {log.customerName ? ` · ${log.customerName}` : ''}
                      </span>
                    )}
                    {log.itemsBefore && log.itemsAfter && (
                      <div className="mt-1.5 space-y-1 text-[11px]">
                        <p className="text-amber-700 dark:text-amber-400">
                          <span className="font-semibold">Before:</span> {log.itemsBefore}
                        </p>
                        <p className="text-emerald-700 dark:text-emerald-400">
                          <span className="font-semibold">After:</span> {log.itemsAfter}
                        </p>
                      </div>
                    )}
                    {!log.itemsBefore && log.itemsSummary && (
                      <p className="mt-1.5 text-[11px] text-gray-500">
                        <span className="font-semibold text-gray-600 dark:text-gray-400">Items:</span>{' '}
                        {log.itemsSummary}
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
