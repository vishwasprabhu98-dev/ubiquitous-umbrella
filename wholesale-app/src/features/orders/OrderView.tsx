import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { Loader2 } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { settingsRepository } from '@/firebase/repositories/settingsRepository'
import type { Order, OrderStatus } from '@/types'

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  NEW: 'New',
  ACCEPTED: 'Accepted',
  PROCESSING: 'Processing',
  DELIVERED: 'Delivered',
  REJECTED: 'Rejected',
}

const TIME_SLOT_LABELS = {
  MORNING: 'Morning',
  AFTERNOON: 'Afternoon',
  EVENING: 'Evening',
} as const

interface OrderViewProps {
  order: Order
}

export default function OrderView({ order }: OrderViewProps) {
  const { data: shopProfile, isLoading } = useQuery({
    queryKey: ['shopProfile'],
    queryFn: () => settingsRepository.getShopProfile(),
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    )
  }

  const addressParts = [
    shopProfile?.address,
    shopProfile?.city,
    shopProfile?.state,
    shopProfile?.pincode,
  ].filter(Boolean)
  const fullAddress = addressParts.join(', ')

  const orderDateLabel = order.orderDate
    ? format(parseISO(order.orderDate), 'dd MMM yyyy')
    : (order.createdAt?.toDate ? formatDate(order.createdAt.toDate()) : '—')

  return (
    <div className="print-document p-6" id="order-print">
      <div className="flex justify-between items-start border-b-2 pd-border pb-4 mb-4">
        <div>
          <h1 className="text-2xl pd-bold pd-primary">
            {shopProfile?.name || 'Your Business Name'}
          </h1>
          {fullAddress && <p className="pd-muted text-xs mt-1">{fullAddress}</p>}
          {shopProfile?.phone && <p className="pd-muted text-xs">Ph: {shopProfile.phone}</p>}
        </div>
        <div className="text-right">
          <h2 className="text-xl pd-bold pd-heading">ORDER</h2>
          <p className="pd-mono pd-primary pd-semibold mt-1">{order.orderNumber}</p>
          <p className="pd-muted text-xs mt-1">Date: {orderDateLabel}</p>
          <span className="inline-block mt-1 px-2 py-0.5 rounded text-xs pd-semibold pd-blue-bg pd-primary">
            {ORDER_STATUS_LABELS[order.status]}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <h3 className="text-xs pd-semibold pd-muted uppercase tracking-wide mb-1">Customer</h3>
          <p className="pd-semibold">{order.customerInfo.name}</p>
          <p className="pd-muted text-xs">{order.customerInfo.phone}</p>
          {order.customerInfo.gstNumber && (
            <p className="pd-muted text-xs">GST: {order.customerInfo.gstNumber}</p>
          )}
        </div>
        <div>
          <h3 className="text-xs pd-semibold pd-muted uppercase tracking-wide mb-1">Schedule</h3>
          <p className="pd-semibold">{orderDateLabel}</p>
          {order.timeSlot && (
            <p className="pd-muted text-xs">{TIME_SLOT_LABELS[order.timeSlot]}</p>
          )}
        </div>
      </div>

      <table className="w-full text-sm mb-4">
        <thead>
          <tr className="pd-blue-bg border-y pd-border-light">
            <th className="text-left py-2 px-2 text-xs pd-semibold pd-muted">#</th>
            <th className="text-left py-2 px-2 text-xs pd-semibold pd-muted">Product</th>
            <th className="text-center py-2 px-2 text-xs pd-semibold pd-muted">Qty</th>
            <th className="text-right py-2 px-2 text-xs pd-semibold pd-muted">Rate</th>
            <th className="text-right py-2 px-2 text-xs pd-semibold pd-muted">Total</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item, i) => (
            <tr key={i} className="border-b pd-border-light">
              <td className="py-2 px-2 pd-muted">{i + 1}</td>
              <td className="py-2 px-2 pd-semibold">{item.productName}</td>
              <td className="py-2 px-2 text-center">{item.quantity}</td>
              <td className="py-2 px-2 text-right">{formatCurrency(item.unitRate)}</td>
              <td className="py-2 px-2 text-right pd-semibold">{formatCurrency(item.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-end">
        <div className="w-64 text-sm">
          <div className="flex justify-between pd-bold text-base border-t pd-border-light pt-2">
            <span>Estimated Total</span>
            <span className="pd-primary">{formatCurrency(order.estimatedAmount)}</span>
          </div>
        </div>
      </div>

      {order.comment && (
        <div className="mt-4 p-3 rounded border pd-border-light" style={{ background: '#f9fafb' }}>
          <p className="text-xs pd-semibold pd-muted uppercase tracking-wide mb-1">Notes</p>
          <p className="text-sm whitespace-pre-line">{order.comment}</p>
        </div>
      )}

      <div className="mt-6 pt-4 border-t pd-border-light text-center text-xs pd-muted">
        <p>Thank you for your order!</p>
      </div>
    </div>
  )
}
