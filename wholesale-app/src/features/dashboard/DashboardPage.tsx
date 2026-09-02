import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, ShoppingCart, CreditCard } from 'lucide-react'
import { format } from 'date-fns'
import { billRepository } from '@/firebase/repositories/billRepository'
import { orderRepository } from '@/firebase/repositories/orderRepository'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatCurrency, formatDate } from '@/lib/utils'
import { addIstDays, todayIst } from '@/lib/istDate'
import InvoiceView from '@/features/billing/InvoiceView'
import OrderView from '@/features/orders/OrderView'
import type { Bill, Order, TimeSlot } from '@/types'

const TIME_SLOT_ORDER: Record<TimeSlot, number> = { MORNING: 0, AFTERNOON: 1, EVENING: 2 }
const TIME_SLOT_LABEL: Record<TimeSlot, string> = { MORNING: 'Morning', AFTERNOON: 'Afternoon', EVENING: 'Evening' }
const TIME_SLOT_STYLE: Record<TimeSlot, string> = {
  MORNING: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  AFTERNOON: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  EVENING: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
}

const MAX_PENDING_PAYMENTS = 10

function orderDateKey(order: Order): string {
  return order.orderDate || format(order.createdAt?.toDate?.() ?? new Date(), 'yyyy-MM-dd')
}

function formatOrderItemsText(items: Order['items']): string {
  if (!items?.length) return '—'
  return items
    .map((item) => {
      const name = item.productName?.trim() || 'Item'
      return `${item.quantity} ${name}`
    })
    .join(', ')
}

function sortByDateThenSlot(a: Order, b: Order): number {
  const dateA = orderDateKey(a)
  const dateB = orderDateKey(b)
  if (dateA !== dateB) return dateA.localeCompare(dateB)
  return (TIME_SLOT_ORDER[a.timeSlot] ?? 0) - (TIME_SLOT_ORDER[b.timeSlot] ?? 0)
}

function UpcomingOrderRow({
  order,
  overdue,
  onOpen,
}: {
  order: Order
  overdue?: boolean
  onOpen: (order: Order) => void
}) {
  const dateLabel = order.orderDate
    ? format(new Date(order.orderDate), 'd MMM yyyy')
    : (order.createdAt?.toDate ? formatDate(order.createdAt.toDate()) : '—')
  const itemsText = formatOrderItemsText(order.items)
  const commentText = order.comment?.trim() || ''

  return (
    <button
      type="button"
      onClick={() => onOpen(order)}
      className="w-full text-left py-2.5 px-2 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors rounded-lg"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="font-mono text-xs text-blue-600">{order.orderNumber}</span>
        <span className="text-gray-300 dark:text-gray-600">·</span>
        <span className="font-medium text-gray-900 dark:text-white">{order.customerInfo.name}</span>
        {overdue && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
            Pending
          </span>
        )}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className={`whitespace-nowrap ${overdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-500'}`}>
          {dateLabel}
        </span>
        {order.timeSlot && (
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${TIME_SLOT_STYLE[order.timeSlot]}`}>
            {TIME_SLOT_LABEL[order.timeSlot]}
          </span>
        )}
      </div>
      <div className="mt-1 text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
        <span title={itemsText}>{itemsText}</span>
        {commentText ? (
          <>
            <span className="text-gray-300 dark:text-gray-600"> · </span>
            <span className="text-gray-500" title={commentText}>{commentText}</span>
          </>
        ) : null}
      </div>
    </button>
  )
}

function OrderSection({
  title,
  count,
  accent,
  emptyLabel,
  children,
}: {
  title: string
  count: number
  accent: string
  emptyLabel: string
  children: ReactNode
}) {
  return (
    <section className="rounded-xl border border-gray-100 dark:border-[#2a3040] overflow-hidden">
      <div className={`flex items-center justify-between px-3 py-2 ${accent}`}>
        <h3 className="text-xs font-semibold uppercase tracking-wide">{title}</h3>
        <span className="text-xs font-medium tabular-nums opacity-80">{count}</span>
      </div>
      {count === 0 ? (
        <p className="px-3 py-4 text-xs text-gray-400">{emptyLabel}</p>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-800/80">{children}</div>
      )}
    </section>
  )
}

export default function DashboardPage() {
  const [viewOrder, setViewOrder] = useState<Order | null>(null)
  const [viewBill, setViewBill] = useState<Bill | null>(null)

  const { data: bills = [], isLoading: billsLoading } = useQuery({
    queryKey: ['bills'],
    queryFn: billRepository.getAll,
  })

  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: orderRepository.getAll,
  })

  const { todayOrders, tomorrowOrders, laterOrders, today } = useMemo(() => {
    const todayKey = todayIst()
    const tomorrowKey = addIstDays(todayKey, 1)

    const open = orders
      .filter((o) => o.status !== 'DELIVERED' && o.status !== 'REJECTED')
      .map((order) => ({ order, date: orderDateKey(order) }))

    const todayList = open
      .filter(({ date }) => date <= todayKey)
      .sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date)
        return (TIME_SLOT_ORDER[a.order.timeSlot] ?? 0) - (TIME_SLOT_ORDER[b.order.timeSlot] ?? 0)
      })
      .map(({ order }) => order)

    const tomorrowList = open
      .filter(({ date }) => date === tomorrowKey)
      .sort((a, b) => (TIME_SLOT_ORDER[a.order.timeSlot] ?? 0) - (TIME_SLOT_ORDER[b.order.timeSlot] ?? 0))
      .map(({ order }) => order)

    const laterList = open
      .filter(({ date }) => date > tomorrowKey)
      .sort((a, b) => sortByDateThenSlot(a.order, b.order))
      .map(({ order }) => order)

    return {
      todayOrders: todayList,
      tomorrowOrders: tomorrowList,
      laterOrders: laterList,
      today: todayKey,
    }
  }, [orders])

  const hasUpcoming =
    todayOrders.length > 0 || tomorrowOrders.length > 0 || laterOrders.length > 0

  const pendingPayments = [...bills]
    .filter((b) => b.remainingAmount > 0 && !b.movedToLedger)
    .sort((a, b) => b.remainingAmount - a.remainingAmount)
    .slice(0, MAX_PENDING_PAYMENTS)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
          Upcoming orders and pending payments at a glance.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-blue-600" />
              Upcoming Orders
            </CardTitle>
            <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" asChild>
              <Link to="/orders">
                View all
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {ordersLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : !hasUpcoming ? (
              <div className="py-12 text-center text-sm text-gray-400">No upcoming orders</div>
            ) : (
              <div className="space-y-3">
                <OrderSection
                  title="Today"
                  count={todayOrders.length}
                  accent="bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200"
                  emptyLabel="No orders for today"
                >
                  {todayOrders.map((order) => (
                    <UpcomingOrderRow
                      key={order.orderId}
                      order={order}
                      overdue={orderDateKey(order) < today}
                      onOpen={setViewOrder}
                    />
                  ))}
                </OrderSection>

                <OrderSection
                  title="Tomorrow"
                  count={tomorrowOrders.length}
                  accent="bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                  emptyLabel="No orders for tomorrow"
                >
                  {tomorrowOrders.map((order) => (
                    <UpcomingOrderRow
                      key={order.orderId}
                      order={order}
                      onOpen={setViewOrder}
                    />
                  ))}
                </OrderSection>

                <OrderSection
                  title="All"
                  count={laterOrders.length}
                  accent="bg-gray-50 text-gray-700 dark:bg-[#1e2330] dark:text-gray-300"
                  emptyLabel="No later orders"
                >
                  {laterOrders.map((order) => (
                    <UpcomingOrderRow
                      key={order.orderId}
                      order={order}
                      onOpen={setViewOrder}
                    />
                  ))}
                </OrderSection>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-orange-600" />
              Pending Payments
            </CardTitle>
            <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" asChild>
              <Link to="/billing">
                View all
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {billsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : pendingPayments.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-400">No pending payments</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-800">
                      <th className="text-left py-3 px-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Bill #</th>
                      <th className="text-left py-3 px-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Customer</th>
                      <th className="text-left py-3 px-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                      <th className="text-right py-3 px-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</th>
                      <th className="text-right py-3 px-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingPayments.map((bill) => (
                      <tr
                        key={bill.billId}
                        className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors cursor-pointer"
                        onClick={() => setViewBill(bill)}
                      >
                        <td className="py-3 px-2">
                          <button
                            type="button"
                            className="font-mono text-xs text-blue-600 hover:underline"
                            onClick={(e) => { e.stopPropagation(); setViewBill(bill) }}
                          >
                            {bill.billNumber}
                          </button>
                        </td>
                        <td className="py-3 px-2 font-medium">{bill.customerInfo.name}</td>
                        <td className="py-3 px-2 text-gray-500">
                          {bill.createdAt?.toDate ? formatDate(bill.createdAt.toDate()) : '—'}
                        </td>
                        <td className="py-3 px-2 text-right font-medium">
                          {formatCurrency(bill.grandTotal)}
                        </td>
                        <td className="py-3 px-2 text-right font-semibold text-red-600 dark:text-red-400">
                          {formatCurrency(bill.remainingAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {viewOrder && (
        <Dialog open={!!viewOrder} onOpenChange={() => setViewOrder(null)}>
          <DialogContent className="max-w-2xl max-h-[95vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Order {viewOrder.orderNumber}</DialogTitle>
            </DialogHeader>
            <OrderView order={viewOrder} />
          </DialogContent>
        </Dialog>
      )}

      {viewBill && (
        <Dialog open={!!viewBill} onOpenChange={() => setViewBill(null)}>
          <DialogContent className="max-w-2xl max-h-[95vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Invoice — {viewBill.billNumber}</DialogTitle>
            </DialogHeader>
            <InvoiceView bill={viewBill} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
