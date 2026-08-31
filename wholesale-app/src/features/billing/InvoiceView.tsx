import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { getBillDateString, istDayStart } from '@/lib/istDate'
import { settingsRepository } from '@/firebase/repositories/settingsRepository'
import type { Bill } from '@/types'

interface InvoiceViewProps {
  bill: Bill
  /** Hide Balance Due (e.g. WhatsApp share for registered customers). */
  hideBalanceDue?: boolean
}

export default function InvoiceView({ bill, hideBalanceDue = false }: InvoiceViewProps) {
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
  const itemDiscountTotal = bill.items.reduce((sum, item) => sum + (item.itemDiscount ?? 0), 0)
  const billDiscount = bill.discount ?? 0
  const totalDiscount = itemDiscountTotal + billDiscount
  const hasItemDiscount = itemDiscountTotal > 0
  const hasBillDiscount = billDiscount > 0
  const hasAnyDiscount = totalDiscount > 0
  const grossAmount = bill.items.reduce(
    (sum, item) => sum + item.quantity * item.unitRate,
    0
  )
  const billDay = getBillDateString(bill)
  const invoiceDateLabel = billDay ? formatDate(istDayStart(billDay)) : '—'

  return (
    <div className="print-document p-6" id="invoice-print">
      <div className="flex justify-between items-start border-b-2 pd-border pb-4 mb-4">
        <div>
          <h1 className="text-2xl pd-bold pd-primary">
            {shopProfile?.name || 'Your Business Name'}
          </h1>
          {fullAddress && <p className="pd-muted text-xs mt-1">{fullAddress}</p>}
          {shopProfile?.gstNumber && <p className="pd-muted text-xs">GST: {shopProfile.gstNumber}</p>}
          {shopProfile?.phone && <p className="pd-muted text-xs">Ph: {shopProfile.phone}</p>}
          {shopProfile?.email && <p className="pd-muted text-xs">{shopProfile.email}</p>}
        </div>
        <div className="text-right">
          <h2 className="text-xl pd-bold pd-heading">TAX INVOICE</h2>
          <p className="pd-mono pd-primary pd-semibold mt-1">{bill.billNumber}</p>
          <p className="pd-muted text-xs mt-1">
            Date: {invoiceDateLabel}
          </p>
          <span
            className={`inline-block mt-1 px-2 py-0.5 rounded text-xs pd-semibold ${
              bill.paymentStatus === 'PAID' ? 'pd-success-bg' : 'pd-warn-bg'
            }`}
          >
            {bill.paymentStatus === 'PAID'
              ? 'Paid'
              : bill.paymentStatus === 'PARTIAL'
                ? 'Partial'
                : 'Unpaid'}
          </span>
        </div>
      </div>

      <div className="mb-4">
        <h3 className="text-xs pd-semibold pd-muted uppercase tracking-wide mb-1">Bill To</h3>
        <p className="pd-semibold">{bill.customerInfo.name}</p>
        <p className="pd-muted text-xs">{bill.customerInfo.phone}</p>
        {bill.customerInfo.gstNumber && (
          <p className="pd-muted text-xs">GST: {bill.customerInfo.gstNumber}</p>
        )}
        {bill.customerInfo.address && (
          <p className="pd-muted text-xs">{bill.customerInfo.address}</p>
        )}
      </div>

      <table className="w-full text-sm mb-4">
        <thead>
          <tr className="pd-blue-bg border-y pd-border-light">
            <th className="text-left py-2 px-2 text-xs pd-semibold pd-muted">#</th>
            <th className="text-left py-2 px-2 text-xs pd-semibold pd-muted">Description</th>
            <th className="text-center py-2 px-2 text-xs pd-semibold pd-muted">Qty</th>
            <th className="text-right py-2 px-2 text-xs pd-semibold pd-muted">Rate</th>
            {hasItemDiscount && (
              <th className="text-right py-2 px-2 text-xs pd-semibold pd-muted">Disc</th>
            )}
            <th className="text-right py-2 px-2 text-xs pd-semibold pd-muted">Total</th>
          </tr>
        </thead>
        <tbody>
          {bill.items.map((item, i) => {
            const lineBase = item.quantity * item.unitRate - item.itemDiscount
            return (
              <tr key={i} className="border-b pd-border-light">
                <td className="py-2 px-2 pd-muted">{i + 1}</td>
                <td className="py-2 px-2 pd-semibold">{item.productName}</td>
                <td className="py-2 px-2 text-center">{item.quantity}</td>
                <td className="py-2 px-2 text-right">{formatCurrency(item.unitRate)}</td>
                {hasItemDiscount && (
                  <td className="py-2 px-2 text-right pd-muted">{formatCurrency(item.itemDiscount)}</td>
                )}
                <td className="py-2 px-2 text-right pd-semibold">{formatCurrency(lineBase)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="flex justify-end">
        <div className="w-64 space-y-1.5 text-sm">
          {hasAnyDiscount && (
            <div className="flex justify-between">
              <span className="pd-muted">Gross Amount</span>
              <span>{formatCurrency(grossAmount)}</span>
            </div>
          )}
          {hasItemDiscount && (
            <div className="flex justify-between pd-danger">
              <span>Item Discount</span>
              <span>- {formatCurrency(itemDiscountTotal)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="pd-muted">Subtotal</span>
            <span>{formatCurrency(bill.subtotal)}</span>
          </div>
          {hasBillDiscount && (
            <div className="flex justify-between pd-danger">
              <span>Bill Discount</span>
              <span>- {formatCurrency(billDiscount)}</span>
            </div>
          )}
          {hasAnyDiscount && (
            <div className="flex justify-between pd-danger pd-semibold">
              <span>Total Discount</span>
              <span>- {formatCurrency(totalDiscount)}</span>
            </div>
          )}
          {bill.isGstBill && bill.gstAmount > 0 && (
            <div className="flex justify-between pd-primary">
              <span>Composition GST</span>
              <span>{formatCurrency(bill.gstAmount)}</span>
            </div>
          )}
          <div className="flex justify-between pd-bold text-base border-t pd-border-light pt-2 mt-2">
            <span>Grand Total</span>
            <span className="pd-primary">{formatCurrency(bill.grandTotal)}</span>
          </div>
          <div className="flex justify-between pd-success">
            <span>Amount Paid</span>
            <span>{formatCurrency(bill.amountPaid)}</span>
          </div>
          {bill.remainingAmount > 0 && !bill.movedToLedger && !hideBalanceDue && (
            <div className="flex justify-between pd-semibold pd-danger border-t pt-1">
              <span>Balance Due</span>
              <span>{formatCurrency(bill.remainingAmount)}</span>
            </div>
          )}
        </div>
      </div>

      {bill.comment && (
        <div className="mt-4 p-3 rounded border pd-border-light" style={{ background: '#f9fafb' }}>
          <p className="text-xs pd-semibold pd-muted uppercase tracking-wide mb-1">Notes</p>
          <p className="text-sm whitespace-pre-line">{bill.comment}</p>
        </div>
      )}

      <div className="mt-6 pt-4 border-t pd-border-light text-center text-xs pd-muted">
        <p>Thank you for your business!</p>
      </div>
    </div>
  )
}
