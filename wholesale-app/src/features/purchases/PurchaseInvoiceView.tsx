import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { settingsRepository } from '@/firebase/repositories/settingsRepository'
import type { PurchaseInvoice } from '@/types'

interface PurchaseInvoiceViewProps {
  purchase: PurchaseInvoice
}

function formatPurchaseDate(dateStr?: string) {
  if (!dateStr) return '—'
  try {
    const [y, m, d] = dateStr.split('-').map(Number)
    if (!y || !m || !d) return dateStr
    return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

export default function PurchaseInvoiceView({ purchase }: PurchaseInvoiceViewProps) {
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

  const amountPaid = purchase.amountPaid ?? 0
  const remaining = purchase.remainingAmount ?? Math.max(0, purchase.grandTotal - amountPaid)
  const isPaid = remaining <= 0.001

  return (
    <div className="print-document p-6" id="purchase-invoice-print">
      <div className="flex justify-between items-start border-b-2 pd-border pb-4 mb-4">
        <div>
          <h1 className="text-2xl pd-bold pd-primary">
            {shopProfile?.name || 'Your Business Name'}
          </h1>
          {fullAddress && <p className="pd-muted text-xs mt-1">{fullAddress}</p>}
          {shopProfile?.gstNumber && <p className="pd-muted text-xs">GST: {shopProfile.gstNumber}</p>}
          {shopProfile?.phone && <p className="pd-muted text-xs">Ph: {shopProfile.phone}</p>}
        </div>
        <div className="text-right">
          <h2 className="text-xl pd-bold pd-heading">PURCHASE INVOICE</h2>
          <p className="pd-mono pd-primary pd-semibold mt-1">
            {purchase.purchaseNumber ?? 'Draft'}
          </p>
          <p className="pd-muted text-xs mt-1">Date: {formatPurchaseDate(purchase.purchaseDate)}</p>
          <span
            className={`inline-block mt-1 px-2 py-0.5 rounded text-xs pd-semibold ${
              purchase.status === 'SAVED' ? (isPaid ? 'pd-success-bg' : 'pd-warn-bg') : 'pd-warn-bg'
            }`}
          >
            {purchase.status === 'DRAFT' ? 'DRAFT' : isPaid ? 'PAID' : 'PENDING'}
          </span>
        </div>
      </div>

      <div className="mb-4">
        <h3 className="text-xs pd-semibold pd-muted uppercase tracking-wide mb-1">Vendor</h3>
        <p className="pd-semibold">{purchase.vendorInfo.name}</p>
        <p className="pd-muted text-xs">{purchase.vendorInfo.phone}</p>
        {purchase.vendorInfo.gstNumber && (
          <p className="pd-muted text-xs">GST: {purchase.vendorInfo.gstNumber}</p>
        )}
        {purchase.vendorInfo.address && (
          <p className="pd-muted text-xs">{purchase.vendorInfo.address}</p>
        )}
        <p className="pd-muted text-xs mt-1">
          Type: {purchase.vendorType === 'customer' ? 'Existing Customer' : 'New Vendor'}
        </p>
      </div>

      <table className="w-full text-sm mb-4">
        <thead>
          <tr className="pd-blue-bg border-y pd-border-light">
            <th className="text-left py-2 px-2 text-xs pd-semibold pd-muted">#</th>
            <th className="text-left py-2 px-2 text-xs pd-semibold pd-muted">Description</th>
            <th className="text-center py-2 px-2 text-xs pd-semibold pd-muted">Qty</th>
            <th className="text-right py-2 px-2 text-xs pd-semibold pd-muted">Rate</th>
            <th className="text-right py-2 px-2 text-xs pd-semibold pd-muted">Total</th>
          </tr>
        </thead>
        <tbody>
          {purchase.items.map((item, i) => (
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
        <div className="w-64 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="pd-muted">Subtotal</span>
            <span>{formatCurrency(purchase.subtotal)}</span>
          </div>
          {purchase.discount > 0 && (
            <div className="flex justify-between pd-danger">
              <span>Discount</span>
              <span>- {formatCurrency(purchase.discount)}</span>
            </div>
          )}
          <div className="flex justify-between pd-bold text-base border-t pd-border-light pt-2 mt-2">
            <span>Grand Total</span>
            <span className="pd-primary">{formatCurrency(purchase.grandTotal)}</span>
          </div>
          {purchase.status === 'SAVED' && (
            <>
              <div className="flex justify-between pd-success">
                <span>Amount Paid</span>
                <span>{formatCurrency(amountPaid)}</span>
              </div>
              {remaining > 0.001 && (
                <div className="flex justify-between pd-semibold pd-danger border-t pt-1">
                  <span>Balance Due</span>
                  <span>{formatCurrency(remaining)}</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {purchase.comment && (
        <div className="mt-4 p-3 rounded border pd-border-light" style={{ background: '#f9fafb' }}>
          <p className="text-xs pd-semibold pd-muted uppercase tracking-wide mb-1">Notes</p>
          <p className="text-sm whitespace-pre-line">{purchase.comment}</p>
        </div>
      )}

      <div className="mt-6 pt-4 border-t pd-border-light text-center text-xs pd-muted">
        <p>Purchase invoice for internal records.</p>
      </div>
    </div>
  )
}
