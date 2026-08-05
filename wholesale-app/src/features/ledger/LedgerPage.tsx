import { useState, useMemo, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, startOfDay, parseISO, isValid } from 'date-fns'
import {
  Users,
  UserPlus,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Search,
  Phone,
  Receipt,
  TrendingDown,
  IndianRupee,
  ArrowDownLeft,
  ArrowUpRight,
  CreditCard,
  BookOpen,
  Loader2,
  Filter,
  Calendar,
  X,
  Share2,
  ShoppingBag,
  Download,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { billRepository } from '@/firebase/repositories/billRepository'
import { customerRepository } from '@/firebase/repositories/customerRepository'
import { transactionRepository } from '@/firebase/repositories/transactionRepository'
import { settingsRepository } from '@/firebase/repositories/settingsRepository'
import { purchaseRepository } from '@/firebase/repositories/purchaseRepository'
import { sharePdfBlob, downloadPdfBlob } from '@/lib/sharePdf'
import { createLedgerPdfBlob, type LedgerPdfRow } from '@/lib/ledgerPdf'
import InvoiceView from '@/features/billing/InvoiceView'
import PurchaseInvoiceView from '@/features/purchases/PurchaseInvoiceView'
import type { Bill, Customer, Transaction, PaymentMode, PurchaseInvoice } from '@/types'

const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'OTHER', label: 'Other' },
]

// Sentinel value used as billId for customer-level ledger payments
const LEDGER_PAYMENT_REF = 'LEDGER'

const PAGE_SIZE = 10

// ─── Types ─────────────────────────────────────────────────────────────────

type LedgerView = 'existing' | 'new' | 'vendors'
type PaymentFilter = 'all' | 'pending' | 'paid'

interface LedgerRow {
  id: string
  date: Date | undefined
  description: string
  type: 'bill' | 'payment' | 'purchase'
  debit: number
  credit: number
  balance: number
  paymentMode?: string
  reference: string
}

interface CustomerLedgerEntry {
  key: string
  name: string
  phone: string
  customerId?: string
  purchaseId?: string
  isRegistered: boolean
  billNumber?: string
  totalBills: number
  totalBilled: number
  totalPaid: number
  outstanding: number
  lastBillDate?: Date
  bills: Bill[]
  ledgerRows: LedgerRow[]
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function fmt(amount: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(amount)
}

function formatDate(date?: Date) {
  if (!date) return '—'
  try {
    return format(date, 'dd MMM yyyy')
  } catch {
    return '—'
  }
}

function toDate(ts: unknown): Date | undefined {
  if (!ts) return undefined
  if (ts instanceof Date) return ts
  if (typeof ts === 'object' && 'toDate' in (ts as object)) {
    return (ts as { toDate: () => Date }).toDate()
  }
  return undefined
}

function buildLedgerRows(
  bills: Bill[],
  transactions: Transaction[],
  customerId?: string,
  customerPurchases: PurchaseInvoice[] = []
): LedgerRow[] {
  const billIds = new Set(bills.map((b) => b.billId))
  const txByBill: Record<string, Transaction[]> = {}

  for (const tx of transactions) {
    // Include bill-level transactions for this customer's bills
    if (billIds.has(tx.billId)) {
      if (!txByBill[tx.billId]) txByBill[tx.billId] = []
      txByBill[tx.billId].push(tx)
    }
  }

  // Ledger-level payments (not tied to a specific bill)
  const ledgerPayments = customerId
    ? transactions.filter(
        (tx) => tx.billId === LEDGER_PAYMENT_REF && tx.customerId === customerId
      )
    : []

  type RawRow = Omit<LedgerRow, 'balance'>
  const rows: RawRow[] = []

  for (const bill of bills) {
    rows.push({
      id: `bill-${bill.billId}`,
      date: toDate(bill.createdAt),
      description: bill.movedToLedger
        ? `${bill.billNumber} (On Ledger)`
        : bill.billNumber,
      type: 'bill',
      debit: bill.grandTotal,
      credit: 0,
      reference: bill.billId,
    })

    const billTxs = txByBill[bill.billId] ?? []
    let txCredits = 0
    for (const tx of billTxs) {
      txCredits += tx.amount
      rows.push({
        id: `tx-${tx.transactionId}`,
        date: toDate(tx.createdAt),
        description: `Payment${tx.paymentMode ? ` · ${tx.paymentMode.replace('_', ' ')}` : ''}${tx.remarks ? ` — ${tx.remarks}` : ''}`,
        type: 'payment',
        debit: 0,
        credit: tx.amount,
        reference: tx.transactionId,
        paymentMode: tx.paymentMode,
      })
    }

    // Payments recorded on the bill itself (e.g. walk-in customers with no customerId / no tx row)
    const unrecordedPaid = bill.amountPaid - txCredits
    if (unrecordedPaid > 0.001) {
      rows.push({
        id: `bill-paid-${bill.billId}`,
        date: toDate(bill.createdAt),
        description: 'Payment received',
        type: 'payment',
        debit: 0,
        credit: unrecordedPaid,
        reference: bill.billId,
      })
    }
  }

  // Ledger-level payments (recorded from the Ledger page)
  for (const tx of ledgerPayments) {
    rows.push({
      id: `ledger-tx-${tx.transactionId}`,
      date: toDate(tx.createdAt),
      description: `Ledger Payment${tx.paymentMode ? ` · ${tx.paymentMode.replace('_', ' ')}` : ''}${tx.remarks ? ` — ${tx.remarks}` : ''}`,
      type: 'payment',
      debit: 0,
      credit: tx.amount,
      reference: tx.transactionId,
      paymentMode: tx.paymentMode,
    })
  }

  // Purchases from this customer reduce what they owe us (credit)
  for (const purchase of customerPurchases) {
    if (purchase.status !== 'SAVED') continue
    rows.push({
      id: `purchase-${purchase.purchaseId}`,
      date: toDate(purchase.createdAt),
      description: `Purchase · ${purchase.purchaseNumber ?? '—'}`,
      type: 'purchase',
      debit: 0,
      credit: purchase.grandTotal,
      reference: purchase.purchaseId,
    })
  }

  // Compute running balance chronologically (oldest first)
  rows.sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0))

  let balance = 0
  const withBalance = rows.map((row) => {
    balance += row.debit - row.credit
    return { ...row, balance }
  })

  // Display most recent at the top
  return withBalance.reverse()
}

function buildVendorPurchaseRows(
  purchase: PurchaseInvoice,
  transactions: Transaction[]
): LedgerRow[] {
  const purchaseTxs = transactions.filter(
    (tx) => tx.purchaseId === purchase.purchaseId || tx.billId === purchase.purchaseId
  )

  type RawRow = Omit<LedgerRow, 'balance'>
  const rows: RawRow[] = [{
    id: `purchase-${purchase.purchaseId}`,
    date: toDate(purchase.createdAt) ?? (purchase.purchaseDate ? new Date(purchase.purchaseDate) : undefined),
    description: `Purchase · ${purchase.purchaseNumber ?? '—'}`,
    type: 'purchase',
    debit: purchase.grandTotal,
    credit: 0,
    reference: purchase.purchaseId,
  }]

  let txCredits = 0
  for (const tx of purchaseTxs) {
    txCredits += tx.amount
    rows.push({
      id: `tx-${tx.transactionId}`,
      date: toDate(tx.createdAt),
      description: `Payment${tx.paymentMode ? ` · ${tx.paymentMode.replace('_', ' ')}` : ''}${tx.remarks ? ` — ${tx.remarks}` : ''}`,
      type: 'payment',
      debit: 0,
      credit: tx.amount,
      reference: tx.transactionId,
      paymentMode: tx.paymentMode,
    })
  }

  const unrecordedPaid = (purchase.amountPaid ?? 0) - txCredits
  if (unrecordedPaid > 0.001) {
    rows.push({
      id: `purchase-paid-${purchase.purchaseId}`,
      date: toDate(purchase.createdAt),
      description: 'Payment made',
      type: 'payment',
      debit: 0,
      credit: unrecordedPaid,
      reference: purchase.purchaseId,
    })
  }

  rows.sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0))

  let balance = 0
  const withBalance = rows.map((row) => {
    balance += row.debit - row.credit
    return { ...row, balance }
  })

  return withBalance.reverse()
}

function matchesLedgerSearch(entry: CustomerLedgerEntry, q: string): boolean {
  const name = (entry.name ?? '').toLowerCase()
  const phone = entry.phone ?? ''
  const phoneDigits = phone.replace(/\D/g, '')
  const qDigits = q.replace(/\D/g, '')
  const billMatch = entry.billNumber?.toLowerCase().includes(q)

  if (name.includes(q)) return true
  if (billMatch) return true
  if (qDigits.length >= 3) return phoneDigits.includes(qDigits)
  return phone.toLowerCase().includes(q)
}

function buildLedger(
  bills: Bill[],
  customers: Customer[],
  transactions: Transaction[],
  purchases: PurchaseInvoice[],
  view: LedgerView
): CustomerLedgerEntry[] {
  const registeredIds = new Set(customers.map((c) => c.customerId))

  if (view === 'existing') {
    const relevant = bills.filter((b) => b.customerId && registeredIds.has(b.customerId))
    const byId: Record<string, Bill[]> = {}
    for (const bill of relevant) {
      const id = bill.customerId!
      if (!byId[id]) byId[id] = []
      byId[id].push(bill)
    }

    const purchaseByCustomer: Record<string, PurchaseInvoice[]> = {}
    for (const p of purchases) {
      if (p.status !== 'SAVED' || !p.customerId) continue
      if (!purchaseByCustomer[p.customerId]) purchaseByCustomer[p.customerId] = []
      purchaseByCustomer[p.customerId].push(p)
    }

    const customerIds = new Set([...Object.keys(byId), ...Object.keys(purchaseByCustomer)])

    return customers
      .filter((c) => customerIds.has(c.customerId))
      .map((customer) => {
        const customerBills = byId[customer.customerId] ?? []
        const customerPurchases = purchaseByCustomer[customer.customerId] ?? []
        const totalBilled = customerBills.reduce((s, b) => s + b.grandTotal, 0)
        const billLevelPaid = customerBills.reduce((s, b) => s + b.amountPaid, 0)
        const ledgerLevelPaid = transactions
          .filter((tx) => tx.billId === LEDGER_PAYMENT_REF && tx.customerId === customer.customerId)
          .reduce((s, tx) => s + tx.amount, 0)
        const totalPaid = billLevelPaid + ledgerLevelPaid
        const ledgerRows = buildLedgerRows(customerBills, transactions, customer.customerId, customerPurchases)
        const finalBalance = ledgerRows[0]?.balance ?? 0
        const outstanding = Math.max(0, finalBalance)

        return {
          key: customer.customerId,
          name: customer.name,
          phone: customer.phone,
          customerId: customer.customerId,
          isRegistered: true,
          totalBills: customerBills.length,
          totalBilled,
          totalPaid,
          outstanding,
          lastBillDate: toDate(customerBills[0]?.createdAt) ?? toDate(customerPurchases[0]?.createdAt),
          bills: customerBills,
          ledgerRows,
        }
      })
      .sort((a, b) => b.outstanding - a.outstanding)
  }

  if (view === 'vendors') {
    return purchases
      .filter((p) => p.status === 'SAVED' && p.vendorType === 'new')
      .map((purchase) => {
        const ledgerRows = buildVendorPurchaseRows(purchase, transactions)
        const finalBalance = ledgerRows[0]?.balance ?? purchase.grandTotal
        const outstanding = Math.max(0, finalBalance)
        const totalPaid = purchase.amountPaid ?? purchase.grandTotal - outstanding

        return {
          key: purchase.purchaseId,
          purchaseId: purchase.purchaseId,
          name: purchase.vendorInfo?.name ?? 'Unknown Vendor',
          phone: purchase.vendorInfo?.phone || '—',
          billNumber: purchase.purchaseNumber,
          isRegistered: false,
          totalBills: 1,
          totalBilled: purchase.grandTotal,
          totalPaid,
          outstanding,
          lastBillDate: toDate(purchase.createdAt) ?? (purchase.purchaseDate ? new Date(purchase.purchaseDate) : undefined),
          bills: [],
          ledgerRows,
        }
      })
      .sort((a, b) => (b.lastBillDate?.getTime() ?? 0) - (a.lastBillDate?.getTime() ?? 0))
  }

  const relevant = bills.filter((b) => !b.customerId || !registeredIds.has(b.customerId))
  return relevant
    .map((bill) => ({
      key: bill.billId,
      name: bill.customerInfo?.name ?? 'Unknown Customer',
      phone: bill.customerInfo?.phone || '—',
      billNumber: bill.billNumber,
      isRegistered: false,
      totalBills: 1,
      totalBilled: bill.grandTotal,
      totalPaid: bill.amountPaid,
      outstanding: bill.remainingAmount,
      lastBillDate: toDate(bill.createdAt),
      bills: [bill],
      ledgerRows: buildLedgerRows([bill], transactions),
    }))
    .sort((a, b) => (b.lastBillDate?.getTime() ?? 0) - (a.lastBillDate?.getTime() ?? 0))
}

// ─── Ledger Table ─────────────────────────────────────────────────────────

function LedgerTable({
  rows,
  onViewRow,
}: {
  rows: LedgerRow[]
  onViewRow?: (row: LedgerRow) => void
}) {
  if (rows.length === 0) {
    return <p className="text-center text-sm text-gray-400 py-6">No transactions yet.</p>
  }

  const renderDescription = (row: LedgerRow) => {
    const isLink = (row.type === 'bill' || row.type === 'purchase') && !!onViewRow
    if (!isLink) {
      return (
        <span className="font-medium text-gray-800 dark:text-gray-200 font-mono text-xs">
          {row.description}
        </span>
      )
    }
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onViewRow(row) }}
        className="font-medium text-blue-600 dark:text-blue-400 font-mono text-xs hover:underline text-left"
      >
        {row.description}
      </button>
    )
  }

  return (
    <div className="overflow-x-auto">
      {/* Desktop table */}
      <table className="hidden sm:table w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-[#2a3040] text-xs text-gray-500 dark:text-gray-400">
            <th className="text-left py-2 px-3 font-semibold">Date</th>
            <th className="text-left py-2 px-3 font-semibold">Description</th>
            <th className="text-right py-2 px-3 font-semibold text-red-500">Debit (DR)</th>
            <th className="text-right py-2 px-3 font-semibold text-green-600">Credit (CR)</th>
            <th className="text-right py-2 px-3 font-semibold">Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className="border-b border-gray-100 dark:border-[#2a3040]/60 last:border-0 hover:bg-gray-50/50 dark:hover:bg-[#1e2330]/30 transition-colors"
            >
              <td className="py-2.5 px-3 text-xs text-gray-400 whitespace-nowrap">
                {formatDate(row.date)}
              </td>
              <td className="py-2.5 px-3">
                <div className="flex items-center gap-2">
                  {row.type === 'bill' ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 text-xs text-red-600 dark:text-red-400">
                      <ArrowDownLeft className="h-3 w-3" />
                      Bill
                    </span>
                  ) : row.type === 'purchase' ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 text-xs text-blue-600 dark:text-blue-400">
                      <ShoppingBag className="h-3 w-3" />
                      Purchase
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-50 dark:bg-green-900/20 px-1.5 py-0.5 text-xs text-green-600 dark:text-green-400">
                      <ArrowUpRight className="h-3 w-3" />
                      Payment
                    </span>
                  )}
                  {renderDescription(row)}
                </div>
              </td>
              <td className="py-2.5 px-3 text-right font-medium">
                {row.debit > 0 ? (
                  <span className="text-red-600 dark:text-red-400">₹{fmt(row.debit)}</span>
                ) : (
                  <span className="text-gray-300 dark:text-gray-600">—</span>
                )}
              </td>
              <td className="py-2.5 px-3 text-right font-medium">
                {row.credit > 0 ? (
                  <span className="text-green-600 dark:text-green-400">₹{fmt(row.credit)}</span>
                ) : (
                  <span className="text-gray-300 dark:text-gray-600">—</span>
                )}
              </td>
              <td className="py-2.5 px-3 text-right font-semibold">
                <span
                  className={
                    row.balance > 0
                      ? 'text-red-600 dark:text-red-400'
                      : row.balance < 0
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-gray-500 dark:text-gray-400'
                  }
                >
                  ₹{fmt(Math.abs(row.balance))}
                  {row.balance > 0 && (
                    <span className="ml-1 text-xs font-normal text-red-400">DR</span>
                  )}
                  {row.balance < 0 && (
                    <span className="ml-1 text-xs font-normal text-green-500">CR</span>
                  )}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-2 px-1 py-2">
        {rows.map((row) => (
          <div
            key={row.id}
            className="rounded-lg border border-gray-100 dark:border-[#2a3040] bg-white dark:bg-[#1e2330]/60 p-3 flex items-start gap-3"
          >
            <div
              className={cn(
                'mt-0.5 rounded-full p-1.5 shrink-0',
                row.type === 'bill'
                  ? 'bg-red-50 dark:bg-red-900/20'
                  : row.type === 'purchase'
                    ? 'bg-blue-50 dark:bg-blue-900/20'
                    : 'bg-green-50 dark:bg-green-900/20'
              )}
            >
              {row.type === 'bill' ? (
                <ArrowDownLeft className="h-3.5 w-3.5 text-red-500" />
              ) : row.type === 'purchase' ? (
                <ShoppingBag className="h-3.5 w-3.5 text-blue-500" />
              ) : (
                <ArrowUpRight className="h-3.5 w-3.5 text-green-600" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 truncate">{renderDescription(row)}</div>
                <span
                  className={cn(
                    'font-bold text-sm shrink-0',
                    row.type === 'bill'
                      ? 'text-red-600 dark:text-red-400'
                      : row.type === 'purchase' && row.debit > 0
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-green-600 dark:text-green-400'
                  )}
                >
                  {row.credit > 0 ? '+' : '−'}₹{fmt(row.credit > 0 ? row.credit : row.debit)}
                </span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-gray-400">{formatDate(row.date)}</span>
                <span
                  className={cn(
                    'text-xs font-medium',
                    row.balance > 0
                      ? 'text-red-500'
                      : row.balance < 0
                        ? 'text-green-500'
                        : 'text-gray-400'
                  )}
                >
                  Bal: ₹{fmt(Math.abs(row.balance))}
                  {row.balance > 0 ? ' DR' : row.balance < 0 ? ' CR' : ''}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Ledger Card ─────────────────────────────────────────────────────────

function LedgerCard({
  entry,
  onRecordPayment,
  onShareLedger,
  onViewRow,
}: {
  entry: CustomerLedgerEntry
  onRecordPayment: (entry: CustomerLedgerEntry) => void
  onShareLedger: (entry: CustomerLedgerEntry) => void
  onViewRow?: (row: LedgerRow) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const ledgerBalance = entry.ledgerRows[0]?.balance ?? entry.outstanding
  const dueAmount = entry.outstanding
  const hasOutstanding = dueAmount > 0

  return (
    <div className="rounded-xl border border-gray-200 dark:border-[#2a3040] bg-white dark:bg-[#252d3d]/60 overflow-hidden">
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full text-left px-5 py-4 hover:bg-gray-50 dark:hover:bg-[#2a3348]/60 transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          {/* Left */}
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-semibold text-gray-900 dark:text-white truncate">
                {entry.name}
              </span>
              {!entry.isRegistered && entry.billNumber && (
                <Badge variant="outline" className="font-mono text-xs shrink-0">
                  {entry.billNumber}
                </Badge>
              )}
              {!entry.isRegistered && entry.outstanding <= 0 && (
                <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0 text-xs shrink-0">
                  Paid
                </Badge>
              )}
              {!entry.isRegistered && entry.outstanding > 0 && (
                <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0 text-xs shrink-0">
                  Pending
                </Badge>
              )}
              {entry.isRegistered && !hasOutstanding && entry.totalBills > 0 && (
                <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0 text-xs shrink-0">
                  Cleared
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {entry.phone}
              </span>
              {entry.isRegistered ? (
                <>
                  <span className="flex items-center gap-1">
                    <Receipt className="h-3 w-3" />
                    {entry.totalBills} {entry.totalBills === 1 ? 'bill' : 'bills'}
                  </span>
                  <span>Last: {formatDate(entry.lastBillDate)}</span>
                </>
              ) : (
                <span>Bill date: {formatDate(entry.lastBillDate)}</span>
              )}
            </div>
          </div>

          {/* Right: outstanding */}
          <div className="text-right shrink-0">
            <div
              className={cn(
                'text-lg font-bold',
                dueAmount > 0
                  ? 'text-red-600 dark:text-red-400'
                  : ledgerBalance < 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-gray-500'
              )}
            >
              ₹{fmt(dueAmount > 0 ? dueAmount : Math.abs(ledgerBalance))}
            </div>
            <div className="text-xs text-gray-400">
              {dueAmount > 0 ? 'outstanding' : ledgerBalance < 0 ? 'credit' : 'cleared'}
            </div>
          </div>
        </div>

        {/* Summary bar */}
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-lg bg-gray-50 dark:bg-[#1e2330]/60 px-3 py-2">
            <div className="text-gray-400 mb-0.5">Billed</div>
            <div className="font-semibold text-gray-800 dark:text-gray-200">₹{fmt(entry.totalBilled)}</div>
          </div>
          <div className="rounded-lg bg-gray-50 dark:bg-[#1e2330]/60 px-3 py-2">
            <div className="text-gray-400 mb-0.5">Paid</div>
            <div className="font-semibold text-green-700 dark:text-green-400">₹{fmt(entry.totalPaid)}</div>
          </div>
          <div className="rounded-lg bg-gray-50 dark:bg-[#1e2330]/60 px-3 py-2">
            <div className="text-gray-400 mb-0.5">{ledgerBalance < 0 && dueAmount <= 0 ? 'Credit' : 'Due'}</div>
            <div className={cn('font-semibold', dueAmount > 0 ? 'text-red-600 dark:text-red-400' : ledgerBalance < 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-500')}>
              ₹{fmt(dueAmount > 0 ? dueAmount : Math.abs(ledgerBalance))}
            </div>
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            {/* Record Ledger Payment — only for registered customers with a positive ledger balance */}
            {entry.isRegistered && hasOutstanding && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRecordPayment(entry) }}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border border-indigo-200 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950/40 transition-colors"
              >
                <CreditCard className="h-3.5 w-3.5" />
                Record Payment
              </button>
            )}
            {entry.purchaseId && hasOutstanding && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRecordPayment(entry) }}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border border-indigo-200 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950/40 transition-colors"
              >
                <CreditCard className="h-3.5 w-3.5" />
                Record Payment
              </button>
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onShareLedger(entry) }}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950/40 transition-colors"
            >
              <Share2 className="h-3.5 w-3.5" />
              Share Ledger
            </button>
          </div>
          <span className="flex items-center gap-1 text-xs text-indigo-500 dark:text-indigo-400">
            {expanded ? (
              <>Hide ledger <ChevronUp className="h-3.5 w-3.5" /></>
            ) : (
              <>View ledger <ChevronDown className="h-3.5 w-3.5" /></>
            )}
          </span>
        </div>
      </button>

      {/* Expanded ledger table */}
      {expanded && (
        <div className="border-t border-gray-100 dark:border-[#2a3040] bg-gray-50/40 dark:bg-[#1e2330]/30">
          {/* Legend */}
          <div className="flex items-center gap-4 px-4 pt-3 pb-1 text-xs text-gray-400 border-b border-gray-100 dark:border-[#2a3040]">
            <span className="flex items-center gap-1">
              <ArrowDownLeft className="h-3 w-3 text-red-500" />
              Debit (DR) = Bill raised
            </span>
            <span className="flex items-center gap-1">
              <ArrowUpRight className="h-3 w-3 text-green-500" />
              Credit (CR) = Payment / Purchase from customer
            </span>
          </div>
          <LedgerTable rows={entry.ledgerRows} onViewRow={onViewRow} />
        </div>
      )}
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function LedgerPage() {
  const location = useLocation()
  const queryClient = useQueryClient()
  const [view, setView] = useState<LedgerView>(
    location.pathname.endsWith('/new') ? 'new' : 'existing'
  )
  const [search, setSearch] = useState('')
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('pending')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [page, setPage] = useState(1)

  // Ledger payment dialog
  const [payEntry, setPayEntry] = useState<CustomerLedgerEntry | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMode, setPayMode] = useState<PaymentMode>('CASH')
  const [payRemarks, setPayRemarks] = useState('')

  // Share ledger dialog
  const [shareLedgerEntry, setShareLedgerEntry] = useState<CustomerLedgerEntry | null>(null)
  const [shareFrom, setShareFrom] = useState('')
  const [shareTo, setShareTo] = useState('')
  const [isSharing, setIsSharing] = useState(false)

  // View dialogs
  const [viewBill, setViewBill] = useState<Bill | null>(null)
  const [viewPurchase, setViewPurchase] = useState<PurchaseInvoice | null>(null)

  const ledgerPayMutation = useMutation({
    mutationFn: async ({ entry, amount, mode, remarks }: {
      entry: CustomerLedgerEntry
      amount: number
      mode: PaymentMode
      remarks: string
    }) => {
      if (entry.purchaseId) {
        const purchase = purchases.find((p) => p.purchaseId === entry.purchaseId)
        if (!purchase) throw new Error('Purchase not found')
        const currentPaid = purchase.amountPaid ?? 0
        const newAmountPaid = currentPaid + amount
        const newRemaining = Math.max(0, purchase.grandTotal - newAmountPaid)
        await purchaseRepository.update(entry.purchaseId, {
          amountPaid: newAmountPaid,
          remainingAmount: newRemaining,
        })
        await transactionRepository.create({
          billId: entry.purchaseId,
          purchaseId: entry.purchaseId,
          amount,
          paymentMode: mode,
          remarks: remarks || undefined,
        })
        return
      }

      await transactionRepository.create({
        billId: LEDGER_PAYMENT_REF,
        customerId: entry.customerId!,
        amount,
        paymentMode: mode,
        remarks: remarks || undefined,
      })
    },
    onSuccess: (_, { entry }) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      if (entry.purchaseId) {
        queryClient.invalidateQueries({ queryKey: ['purchases'] })
      }
      toast.success(entry.purchaseId ? 'Vendor payment recorded' : 'Ledger payment recorded')
      setPayEntry(null)
      setPayAmount('')
      setPayRemarks('')
    },
    onError: () => toast.error('Failed to record payment'),
  })

  const handleLedgerPay = () => {
    const amount = Number(payAmount)
    if (!amount || amount <= 0) { toast.error('Enter a valid amount'); return }
    if (!payEntry) return
    if (amount > payEntry.outstanding + 0.01) {
      toast.error(`Amount cannot exceed due: ₹${fmt(payEntry.outstanding)}`)
      return
    }
    ledgerPayMutation.mutate({ entry: payEntry, amount, mode: payMode, remarks: payRemarks })
  }

  const { data: bills = [], isLoading: billsLoading } = useQuery({
    queryKey: ['bills'],
    queryFn: () => billRepository.getAll(),
    refetchOnMount: 'always',
  })

  const { data: customers = [], isLoading: customersLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: () => customerRepository.getAll(),
    refetchOnMount: 'always',
  })

  const { data: transactions = [], isLoading: txLoading } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => transactionRepository.getAll(),
    refetchOnMount: 'always',
  })

  const { data: purchases = [], isLoading: purchasesLoading } = useQuery({
    queryKey: ['purchases'],
    queryFn: () => purchaseRepository.getAll(),
    refetchOnMount: 'always',
  })

  const isLoading = billsLoading || customersLoading || txLoading || purchasesLoading

  const { data: shopProfile } = useQuery({
    queryKey: ['shopProfile'],
    queryFn: () => settingsRepository.getShopProfile(),
    staleTime: 5 * 60 * 1000,
  })

  const shareRows = useMemo(() => {
    if (!shareLedgerEntry) return []
    return shareLedgerEntry.ledgerRows.filter((row) => {
      if (!row.date) return true
      const rowDay = startOfDay(row.date)
      if (shareFrom) {
        const from = parseISO(shareFrom)
        if (isValid(from) && rowDay < startOfDay(from)) return false
      }
      if (shareTo) {
        const to = parseISO(shareTo)
        if (isValid(to) && rowDay > startOfDay(to)) return false
      }
      return true
    })
  }, [shareLedgerEntry, shareFrom, shareTo])

  const enrichRowsForPdf = (rows: LedgerRow[]): LedgerPdfRow[] =>
    rows.map((row) => {
      if (row.type === 'bill') {
        const bill =
          bills.find((b) => b.billId === row.reference) ??
          shareLedgerEntry?.bills.find((b) => b.billId === row.reference)
        if (!bill?.items?.length) return row
        return {
          ...row,
          items: bill.items.map((item) => ({
            productName: item.productName,
            quantity: item.quantity,
            unitRate: item.unitRate,
            total: item.total,
          })),
        }
      }
      if (row.type === 'purchase') {
        const purchase = purchases.find((p) => p.purchaseId === row.reference)
        if (!purchase?.items?.length) return row
        return {
          ...row,
          items: purchase.items.map((item) => ({
            productName: item.productName,
            quantity: item.quantity,
            unitRate: item.unitRate,
            total: item.total,
          })),
        }
      }
      return row
    })

  const handleViewLedgerRow = (row: LedgerRow) => {
    if (row.type === 'bill') {
      const bill = bills.find((b) => b.billId === row.reference)
      if (bill) setViewBill(bill)
      return
    }
    if (row.type === 'purchase') {
      const purchase = purchases.find((p) => p.purchaseId === row.reference)
      if (purchase) setViewPurchase(purchase)
    }
  }

  const ledger = useMemo(
    () => buildLedger(bills, customers, transactions, purchases, view),
    [bills, customers, transactions, purchases, view]
  )

  const filtered = useMemo(() => {
    let result = ledger
    if (search.trim()) {
      const q = search.toLowerCase().trim()
      result = result.filter((e) => matchesLedgerSearch(e, q))
    }
    if (paymentFilter === 'pending') result = result.filter((e) => e.outstanding > 0)
    if (paymentFilter === 'paid') result = result.filter((e) => e.outstanding <= 0)

    if (view === 'new' && (filterFrom || filterTo)) {
      result = result.filter((e) => {
        if (!e.lastBillDate) return false
        const billDay = startOfDay(e.lastBillDate)
        if (filterFrom) {
          const from = parseISO(filterFrom)
          if (isValid(from) && billDay.getTime() < startOfDay(from).getTime()) return false
        }
        if (filterTo) {
          const to = parseISO(filterTo)
          if (isValid(to) && billDay.getTime() > startOfDay(to).getTime()) return false
        }
        return true
      })
    }

    return result
  }, [ledger, search, paymentFilter, view, filterFrom, filterTo])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))

  useEffect(() => {
    setPage(1)
  }, [view, search, paymentFilter, filterFrom, filterTo])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const paginated = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  )

  const totalOutstanding = useMemo(() => ledger.reduce((s, e) => s + e.outstanding, 0), [ledger])
  const totalBilled = useMemo(() => ledger.reduce((s, e) => s + e.totalBilled, 0), [ledger])

  const existingCount = useMemo(() => buildLedger(bills, customers, transactions, purchases, 'existing').length, [bills, customers, transactions, purchases])
  const newCount = useMemo(() => bills.filter((b) => !b.customerId || !customers.find((c) => c.customerId === b.customerId)).length, [bills, customers])
  const vendorsCount = useMemo(() => purchases.filter((p) => p.status === 'SAVED' && p.vendorType === 'new').length, [purchases])
  const pendingCount = useMemo(() => ledger.filter((e) => e.outstanding > 0).length, [ledger])
  const paidCount = useMemo(() => ledger.filter((e) => e.outstanding <= 0).length, [ledger])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Customer Ledger</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Complete debit/credit ledger per customer
          </p>
        </div>

        {!isLoading && (
          <div className="flex gap-3 flex-wrap">
            <div className="flex items-center gap-2 rounded-lg bg-white dark:bg-[#252d3d]/60 border border-gray-200 dark:border-[#2a3040] px-3 py-2">
              <IndianRupee className="h-4 w-4 text-gray-400" />
              <div>
                <div className="text-xs text-gray-400">Total Billed</div>
                <div className="font-semibold text-sm text-gray-800 dark:text-white">₹{fmt(totalBilled)}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-white dark:bg-[#252d3d]/60 border border-gray-200 dark:border-[#2a3040] px-3 py-2">
              <TrendingDown className="h-4 w-4 text-red-400" />
              <div>
                <div className="text-xs text-gray-400">Total Outstanding</div>
                <div className="font-semibold text-sm text-red-600 dark:text-red-400">₹{fmt(totalOutstanding)}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Toggle */}
      <div className="flex rounded-xl border border-gray-200 dark:border-[#2a3040] bg-white dark:bg-[#252d3d]/60 p-1 w-fit">
        <button
          onClick={() => { setView('existing'); setSearch(''); setPaymentFilter('pending'); setFilterFrom(''); setFilterTo('') }}
          className={cn(
            'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all',
            view === 'existing'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          )}
        >
          <Users className="h-4 w-4" />
          Existing Customers
          <span className={cn('rounded-full px-1.5 py-0.5 text-xs font-semibold', view === 'existing' ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-[#1e2330] text-gray-600 dark:text-gray-400')}>
            {existingCount}
          </span>
        </button>
        <button
          onClick={() => { setView('new'); setSearch(''); setPaymentFilter('pending'); setFilterFrom(''); setFilterTo('') }}
          className={cn(
            'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all',
            view === 'new'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          )}
        >
          <UserPlus className="h-4 w-4" />
          New Customers
          <span className={cn('rounded-full px-1.5 py-0.5 text-xs font-semibold', view === 'new' ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-[#1e2330] text-gray-600 dark:text-gray-400')}>
            {newCount}
          </span>
        </button>
        <button
          onClick={() => { setView('vendors'); setSearch(''); setPaymentFilter('all'); setFilterFrom(''); setFilterTo('') }}
          className={cn(
            'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all',
            view === 'vendors'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          )}
        >
          <ShoppingBag className="h-4 w-4" />
          Vendor Purchases
          <span className={cn('rounded-full px-1.5 py-0.5 text-xs font-semibold', view === 'vendors' ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-[#1e2330] text-gray-600 dark:text-gray-400')}>
            {vendorsCount}
          </span>
        </button>
      </div>

      {/* Search + payment filter */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <Input
            placeholder={
              view === 'new'
                ? 'Search by name, phone or bill no…'
                : view === 'vendors'
                  ? 'Search by vendor, phone or purchase no…'
                  : 'Search by name or phone…'
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-gray-400 shrink-0" />
          {([
            { value: 'all', label: 'All', count: ledger.length },
            { value: 'pending', label: 'Pending', count: pendingCount },
            { value: 'paid', label: 'Paid', count: paidCount },
          ] as const).map(({ value, label, count }) => (
            <button
              key={value}
              type="button"
              onClick={() => setPaymentFilter(value)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors',
                paymentFilter === value
                  ? value === 'pending'
                    ? 'bg-amber-600 text-white border-amber-600'
                    : value === 'paid'
                      ? 'bg-green-600 text-white border-green-600'
                      : 'bg-indigo-600 text-white border-indigo-600'
                  : 'border-gray-200 dark:border-[#2a3040] text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#2a3348]/60'
              )}
            >
              {label}
              <span className={cn(
                'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                paymentFilter === value ? 'bg-white/20' : 'bg-gray-100 dark:bg-[#1e2330]'
              )}>
                {count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {view === 'new' && (
        <div className="flex flex-col sm:flex-row sm:items-end gap-3 rounded-xl border border-gray-200 dark:border-[#2a3040] bg-white dark:bg-[#252d3d]/60 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200 shrink-0">
            <Calendar className="h-4 w-4 text-gray-400" />
            Bill date (optional)
          </div>
          <div className="flex flex-col sm:flex-row gap-3 flex-1">
            <div className="space-y-1 flex-1 max-w-xs">
              <Label className="text-xs text-gray-500">From</Label>
              <Input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
            </div>
            <div className="space-y-1 flex-1 max-w-xs">
              <Label className="text-xs text-gray-500">To</Label>
              <Input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
            </div>
          </div>
          {(filterFrom || filterTo) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0 text-gray-500"
              onClick={() => { setFilterFrom(''); setFilterTo('') }}
            >
              <X className="h-4 w-4" />
              Clear dates
            </Button>
          )}
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <p className="text-xs text-gray-400">
          Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
          {paymentFilter !== 'all' && ` · ${paymentFilter === 'pending' ? 'Pending' : 'Paid'}`}
          {view === 'new' && (filterFrom || filterTo) && ' · date filtered'}
        </p>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-36 rounded-xl bg-gray-100 dark:bg-[#252d3d]/40 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          {view === 'existing' ? (
            <Users className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-4" />
          ) : view === 'vendors' ? (
            <ShoppingBag className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-4" />
          ) : (
            <UserPlus className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-4" />
          )}
          <p className="text-gray-500 dark:text-gray-400 font-medium">
            {search
              ? 'No entries match your search.'
              : view === 'new' && (filterFrom || filterTo)
                ? 'No bills found for the selected date range.'
              : paymentFilter === 'pending'
                ? view === 'vendors' ? 'No vendor purchases found.' : 'No pending bills found.'
                : paymentFilter === 'paid'
                  ? 'No paid bills found.'
                  : view === 'existing'
                    ? 'No registered customers have bills yet.'
                    : view === 'vendors'
                      ? 'No vendor purchases recorded yet.'
                      : 'No walk-in customer bills found.'}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {paginated.map((entry) => (
              <LedgerCard
                key={entry.key}
                entry={entry}
                onRecordPayment={setPayEntry}
                onShareLedger={(e) => { setShareFrom(''); setShareTo(''); setShareLedgerEntry(e) }}
                onViewRow={handleViewLedgerRow}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}

      {/* ── Share Ledger Dialog ── */}
      <Dialog
        open={!!shareLedgerEntry}
        onOpenChange={(open) => { if (!open) { setShareLedgerEntry(null); setShareFrom(''); setShareTo('') } }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="h-4 w-4 text-blue-500" />
              Share Ledger Statement
            </DialogTitle>
          </DialogHeader>
          {shareLedgerEntry && (
            <div className="space-y-4">
              <div className="rounded-lg border border-gray-200 dark:border-[#2a3040] bg-gray-50 dark:bg-[#1e2330]/60 p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500">Customer</span>
                  <span className="font-semibold text-gray-900 dark:text-white">{shareLedgerEntry.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Phone</span>
                  <span className="text-gray-700 dark:text-gray-300">{shareLedgerEntry.phone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Total Transactions</span>
                  <span className="font-medium">{shareLedgerEntry.ledgerRows.length}</span>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Date Range (optional)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-500">From</Label>
                    <Input
                      type="date"
                      value={shareFrom}
                      onChange={(e) => setShareFrom(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-500">To</Label>
                    <Input
                      type="date"
                      value={shareTo}
                      onChange={(e) => setShareTo(e.target.value)}
                    />
                  </div>
                </div>
                {(shareFrom || shareTo) && (
                  <button
                    type="button"
                    onClick={() => { setShareFrom(''); setShareTo('') }}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X className="h-3 w-3" />
                    Clear date range
                  </button>
                )}
                <p className="text-xs text-gray-400">
                  {shareRows.length} transaction{shareRows.length !== 1 ? 's' : ''} will be included
                  {!shareFrom && !shareTo ? ' (all time)' : ''}
                </p>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => { setShareLedgerEntry(null); setShareFrom(''); setShareTo('') }}
              disabled={isSharing}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                if (!shareLedgerEntry) return
                setIsSharing(true)
                try {
                  const blob = await createLedgerPdfBlob(
                    shareLedgerEntry,
                    enrichRowsForPdf(shareRows),
                    shopProfile,
                    shareFrom,
                    shareTo
                  )
                  await downloadPdfBlob({
                    blob,
                    filename: `ledger-${shareLedgerEntry.name.replace(/\s+/g, '-')}.pdf`,
                    onFallback: (msg) => toast.info(msg),
                  })
                } catch {
                  toast.error('Failed to download ledger')
                } finally {
                  setIsSharing(false)
                }
              }}
              disabled={isSharing || shareRows.length === 0}
            >
              {isSharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download PDF
            </Button>
            <Button
              onClick={async () => {
                if (!shareLedgerEntry) return
                setIsSharing(true)
                try {
                  const blob = await createLedgerPdfBlob(
                    shareLedgerEntry,
                    enrichRowsForPdf(shareRows),
                    shopProfile,
                    shareFrom,
                    shareTo
                  )
                  await sharePdfBlob({
                    blob,
                    filename: `ledger-${shareLedgerEntry.name.replace(/\s+/g, '-')}.pdf`,
                    title: `Ledger — ${shareLedgerEntry.name}`,
                    onFallback: (msg) => toast.info(msg),
                  })
                } catch (err) {
                  if (err instanceof Error && err.name !== 'AbortError') {
                    toast.error('Failed to share ledger')
                  }
                } finally {
                  setIsSharing(false)
                }
              }}
              disabled={isSharing || shareRows.length === 0}
            >
              {isSharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
              {isSharing ? 'Generating…' : 'Share PDF'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Ledger Payment Dialog ── */}
      <Dialog open={!!payEntry} onOpenChange={(open) => { if (!open) { setPayEntry(null); setPayAmount(''); setPayRemarks('') } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-indigo-500" />
              {payEntry?.purchaseId ? 'Record Vendor Payment' : 'Record Ledger Payment'}
            </DialogTitle>
          </DialogHeader>
          {payEntry && (
            <div className="space-y-4">
              <div className="rounded-lg border border-gray-200 dark:border-[#2a3040] bg-gray-50 dark:bg-[#1e2330]/60 p-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">{payEntry.purchaseId ? 'Vendor' : 'Customer'}</span>
                  <span className="font-semibold text-gray-900 dark:text-white">{payEntry.name}</span>
                </div>
                {payEntry.billNumber && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Invoice</span>
                    <span className="font-mono text-xs">{payEntry.billNumber}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500">{payEntry.purchaseId ? 'Amount Due' : 'Ledger Balance'}</span>
                  <span className="font-bold text-red-600 dark:text-red-400">
                    ₹{new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(
                      payEntry.ledgerRows[0]?.balance ?? payEntry.outstanding
                    )}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Payment Amount (₹) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="Enter amount"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <Label>Payment Mode *</Label>
                <select
                  value={payMode}
                  onChange={(e) => setPayMode(e.target.value as PaymentMode)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {PAYMENT_MODES.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label>Remarks <span className="text-gray-400 text-xs">(optional)</span></Label>
                <Input
                  placeholder="e.g. UPI ref: 12345"
                  value={payRemarks}
                  onChange={(e) => setPayRemarks(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayEntry(null)} disabled={ledgerPayMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={handleLedgerPay} disabled={ledgerPayMutation.isPending || !payAmount}>
              {ledgerPayMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Bill View Dialog ── */}
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

      {/* ── Purchase View Dialog ── */}
      {viewPurchase && (
        <Dialog open={!!viewPurchase} onOpenChange={() => setViewPurchase(null)}>
          <DialogContent className="max-w-2xl max-h-[95vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Purchase — {viewPurchase.purchaseNumber ?? 'Draft'}
              </DialogTitle>
            </DialogHeader>
            <PurchaseInvoiceView purchase={viewPurchase} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
