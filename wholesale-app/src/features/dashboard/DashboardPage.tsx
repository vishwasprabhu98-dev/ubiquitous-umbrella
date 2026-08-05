import { useState } from 'react'
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

const ORDER_STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  ACCEPTED: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',
  PROCESSING: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  DELIVERED: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  REJECTED: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
}

const MAX_ENTRIES = 10

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

  const upcomingOrders = [...orders]
    .filter((o) => o.status !== 'DELIVERED' && o.status !== 'REJECTED')
    .sort((a, b) => {
      const dateA = a.orderDate || format(a.createdAt?.toDate?.() ?? new Date(), 'yyyy-MM-dd')
      const dateB = b.orderDate || format(b.createdAt?.toDate?.() ?? new Date(), 'yyyy-MM-dd')
      if (dateA !== dateB) return dateA.localeCompare(dateB)
      return (TIME_SLOT_ORDER[a.timeSlot] ?? 0) - (TIME_SLOT_ORDER[b.timeSlot] ?? 0)
    })
    .slice(0, MAX_ENTRIES)

  const pendingPayments = [...bills]
    .filter((b) => b.remainingAmount > 0 && !b.movedToLedger)
    .sort((a, b) => b.remainingAmount - a.remainingAmount)
    .slice(0, MAX_ENTRIES)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
          Upcoming orders and pending payments at a glance.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Upcoming Orders */}
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
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : upcomingOrders.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-400">No upcoming orders</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-800">
                      <th className="text-left py-3 px-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Order #</th>
                      <th className="text-left py-3 px-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Customer</th>
                      <th className="text-left py-3 px-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                      <th className="text-left py-3 px-2 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Slot</th>
                      <th className="text-right py-3 px-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
                      <th className="text-center py-3 px-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcomingOrders.map((order) => (
                      <tr
                        key={order.orderId}
                        className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors cursor-pointer"
                        onClick={() => setViewOrder(order)}
                      >
                        <td className="py-3 px-2">
                          <button
                            type="button"
                            className="font-mono text-xs text-blue-600 hover:underline"
                            onClick={(e) => { e.stopPropagation(); setViewOrder(order) }}
                          >
                            {order.orderNumber}
                          </button>
                        </td>
                        <td className="py-3 px-2 font-medium">{order.customerInfo.name}</td>
                        <td className="py-3 px-2 text-gray-500">
                          {order.orderDate
                            ? format(new Date(order.orderDate), 'd MMM yyyy')
                            : (order.createdAt?.toDate ? formatDate(order.createdAt.toDate()) : '—')}
                        </td>
                        <td className="py-3 px-2 hidden sm:table-cell">
                          {order.timeSlot ? (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${TIME_SLOT_STYLE[order.timeSlot]}`}>
                              {TIME_SLOT_LABEL[order.timeSlot]}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="py-3 px-2 text-right font-medium">
                          {formatCurrency(order.estimatedAmount)}
                        </td>
                        <td className="py-3 px-2 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ORDER_STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-700'}`}>
                            {order.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pending Payments */}
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

      {/* Order View Dialog */}
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

      {/* Bill View Dialog */}
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
