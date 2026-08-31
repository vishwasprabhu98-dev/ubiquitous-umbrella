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
import {
  customerBalanceRepository,
  LEDGER_PAYMENT_REF,
} from '@/firebase/repositories/customerBalanceRepository'
import { sharePdfBlob, downloadPdfBlob } from '@/lib/sharePdf'
import { createLedgerPdfBlob, type LedgerPdfRow } from '@/lib/ledgerPdf'
import {
  buildExistingLedgerFromBalances,
  buildNewCustomerLedger,
  buildVendorLedger,
  matchesLedgerSearch,
  periodMetricsFromRows,
  type CustomerLedgerEntry,
  type LedgerRow,
} from '@/lib/ledgerBuild'
import {
  ledgerDetailQueryKey,
  loadLedgerDetail,
  mergeEntryWithDetail,
} from '@/lib/ledgerDetail'
import {
  MONTH_LABELS,
  currentIstMonthKey,
  formatMonthKey,
  istMonthBounds,
  parseMonthKey,
} from '@/lib/istDate'
import InvoiceView from '@/features/billing/InvoiceView'
import PurchaseInvoiceView from '@/features/purchases/PurchaseInvoiceView'
import type { Bill, PaymentMode, PurchaseInvoice } from '@/types'

const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'OTHER', label: 'Other' },
]

const PAGE_SIZE = 10
const RANGE_PAGE_SIZE = 100

type LedgerView = 'existing' | 'new' | 'vendors'
type PaymentFilter = 'all' | 'pending' | 'paid' | 'credit'

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

function purchaseEntryFromInvoice(purchase: PurchaseInvoice): CustomerLedgerEntry {
  const outstanding = purchase.remainingAmount ?? Math.max(0, purchase.grandTotal - (purchase.amountPaid ?? 0))
  return {
    key: purchase.purchaseId,
    purchaseId: purchase.purchaseId,
    name: purchase.vendorInfo.name,
    phone: purchase.vendorInfo.phone || '—',
    billNumber: purchase.purchaseNumber,
    isRegistered: false,
    totalBills: 1,
    totalBilled: purchase.grandTotal,
    totalPaid: purchase.amountPaid ?? 0,
    outstanding,
    lastBillDate: purchase.createdAt?.toDate ? purchase.createdAt.toDate() : purchase.purchaseDate ? new Date(purchase.purchaseDate) : undefined,
    bills: [],
    purchases: [purchase],
    ledgerRows: [],
  }
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
        onClick={(e) => {
          e.stopPropagation()
          onViewRow(row)
        }}
        className="font-medium text-blue-600 dark:text-blue-400 font-mono text-xs hover:underline text-left"
      >
        {row.description}
      </button>
    )
  }

  const renderTypeBadge = (row: LedgerRow) => {
    if (row.type === 'bill') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 text-xs text-red-600 dark:text-red-400">
          <ArrowDownLeft className="h-3 w-3" />
          Bill
        </span>
      )
    }
    if (row.type === 'opening') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 text-xs text-amber-700 dark:text-amber-400">
          <ArrowDownLeft className="h-3 w-3" />
          Opening
        </span>
      )
    }
    if (row.type === 'purchase') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 text-xs text-blue-600 dark:text-blue-400">
          <ShoppingBag className="h-3 w-3" />
          Purchase
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 dark:bg-green-900/20 px-1.5 py-0.5 text-xs text-green-600 dark:text-green-400">
        <ArrowUpRight className="h-3 w-3" />
        Payment
      </span>
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
                  {renderTypeBadge(row)}
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
                row.type === 'bill' || row.type === 'opening'
                  ? 'bg-red-50 dark:bg-red-900/20'
                  : row.type === 'purchase'
                    ? 'bg-blue-50 dark:bg-blue-900/20'
                    : 'bg-green-50 dark:bg-green-900/20'
              )}
            >
              {row.type === 'bill' || row.type === 'opening' ? (
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
                    row.type === 'bill' || row.type === 'opening'
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
  monthKey,
  onRecordPayment,
  onShareLedger,
  onViewRow,
}: {
  entry: CustomerLedgerEntry
  monthKey?: string
  onRecordPayment: (entry: CustomerLedgerEntry) => void
  onShareLedger: (entry: CustomerLedgerEntry) => void
  onViewRow?: (row: LedgerRow, detailBills: Bill[], detailPurchases: PurchaseInvoice[]) => void
}) {
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [sharingBusy, setSharingBusy] = useState(false)

  const { data: detail, isLoading: detailLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ledgerDetailQueryKey(entry, monthKey),
    queryFn: () => loadLedgerDetail(entry, monthKey ? { monthKey } : undefined),
    enabled: expanded,
    staleTime: 30_000,
    retry: 1,
  })

  const rows = detail?.ledgerRows ?? entry.ledgerRows
  const usePeriodMetrics = Boolean(monthKey && detail && entry.isRegistered)
  const periodMetrics = usePeriodMetrics ? periodMetricsFromRows(rows) : null

  const billedAmount = periodMetrics?.billed ?? entry.totalBilled
  const paidAmount = periodMetrics?.paid ?? entry.totalPaid
  const ledgerBalance = periodMetrics?.closing ?? rows[0]?.balance ?? entry.outstanding
  const dueAmount = usePeriodMetrics ? ledgerBalance : entry.outstanding
  const hasOutstanding = dueAmount > 0
  const hasCredit = dueAmount < -0.001
  const creditAmount = hasCredit ? Math.abs(dueAmount) : 0

  const ensureDetail = async () => {
    const cached = queryClient.getQueryData(
      ledgerDetailQueryKey(entry, monthKey)
    ) as Awaited<ReturnType<typeof loadLedgerDetail>> | undefined
    if (cached) return mergeEntryWithDetail(entry, cached)
    const loaded = await queryClient.fetchQuery({
      queryKey: ledgerDetailQueryKey(entry, monthKey),
      queryFn: () => loadLedgerDetail(entry, monthKey ? { monthKey } : undefined),
      staleTime: 30_000,
    })
    return mergeEntryWithDetail(entry, loaded)
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-[#2a3040] bg-white dark:bg-[#252d3d]/60 overflow-hidden">
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full text-left px-5 py-4 hover:bg-gray-50 dark:hover:bg-[#2a3348]/60 transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
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
              {entry.isRegistered && !hasOutstanding && !hasCredit && entry.totalBills > 0 && (
                <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0 text-xs shrink-0">
                  Cleared
                </Badge>
              )}
              {entry.isRegistered && hasCredit && (
                <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0 text-xs shrink-0">
                  Excess
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

          <div className="text-right shrink-0">
            <div
              className={cn(
                'text-lg font-bold',
                dueAmount > 0
                  ? 'text-red-600 dark:text-red-400'
                  : hasCredit || ledgerBalance < 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-gray-500'
              )}
            >
              ₹{fmt(dueAmount > 0 ? dueAmount : hasCredit ? creditAmount : Math.abs(ledgerBalance))}
            </div>
            <div className="text-xs text-gray-400">
              {dueAmount > 0 ? 'outstanding' : hasCredit || ledgerBalance < 0 ? 'excess credit' : 'cleared'}
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-lg bg-gray-50 dark:bg-[#1e2330]/60 px-3 py-2">
            <div className="text-gray-400 mb-0.5">Billed</div>
            <div className="font-semibold text-gray-800 dark:text-gray-200">₹{fmt(billedAmount)}</div>
          </div>
          <div className="rounded-lg bg-gray-50 dark:bg-[#1e2330]/60 px-3 py-2">
            <div className="text-gray-400 mb-0.5">Paid</div>
            <div className="font-semibold text-green-700 dark:text-green-400">₹{fmt(paidAmount)}</div>
          </div>
          <div className="rounded-lg bg-gray-50 dark:bg-[#1e2330]/60 px-3 py-2">
            <div className="text-gray-400 mb-0.5">{hasCredit || (ledgerBalance < 0 && dueAmount <= 0) ? 'Excess' : 'Due'}</div>
            <div className={cn('font-semibold', dueAmount > 0 ? 'text-red-600 dark:text-red-400' : hasCredit || ledgerBalance < 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-500')}>
              ₹{fmt(dueAmount > 0 ? dueAmount : hasCredit ? creditAmount : Math.abs(ledgerBalance))}
            </div>
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
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
            {entry.isRegistered && hasCredit && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRecordPayment(entry) }}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/40 transition-colors"
              >
                <CreditCard className="h-3.5 w-3.5" />
                Pay Credit
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
              onClick={async (e) => {
                e.stopPropagation()
                setSharingBusy(true)
                try {
                  const full = await ensureDetail()
                  onShareLedger(full)
                } catch {
                  toast.error('Failed to load ledger for sharing')
                } finally {
                  setSharingBusy(false)
                }
              }}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950/40 transition-colors"
            >
              {sharingBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
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

      {expanded && (
        <div className="border-t border-gray-100 dark:border-[#2a3040] bg-gray-50/40 dark:bg-[#1e2330]/30">
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
          {detailLoading || isFetching ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading ledger…
            </div>
          ) : isError ? (
            <div className="px-4 py-6 text-center space-y-2">
              <p className="text-sm text-red-500">
                Could not load transactions{error instanceof Error ? `: ${error.message}` : '.'}
              </p>
              <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          ) : (
            <LedgerTable
              rows={rows}
              onViewRow={
                onViewRow
                  ? (row) => onViewRow(row, detail?.bills ?? [], detail?.purchases ?? [])
                  : undefined
              }
            />
          )}
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
  const [monthKey, setMonthKey] = useState(() => currentIstMonthKey())
  const [page, setPage] = useState(1)
  const [rangeCursor, setRangeCursor] = useState(RANGE_PAGE_SIZE)
  const [periodDialogOpen, setPeriodDialogOpen] = useState(false)

  const [payEntry, setPayEntry] = useState<CustomerLedgerEntry | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMode, setPayMode] = useState<PaymentMode>('CASH')
  const [payRemarks, setPayRemarks] = useState('')

  const [shareLedgerEntry, setShareLedgerEntry] = useState<CustomerLedgerEntry | null>(null)
  const [shareFrom, setShareFrom] = useState('')
  const [shareTo, setShareTo] = useState('')
  const [isSharing, setIsSharing] = useState(false)

  const [viewBill, setViewBill] = useState<Bill | null>(null)
  const [viewPurchase, setViewPurchase] = useState<PurchaseInvoice | null>(null)

  const periodParts = useMemo(() => parseMonthKey(monthKey), [monthKey])
  const yearOptions = useMemo(() => {
    const y = periodParts?.year ?? new Date().getFullYear()
    return Array.from({ length: 8 }, (_, i) => y - 5 + i)
  }, [periodParts?.year])

  const { data: customers = [], isLoading: customersLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: () => customerRepository.getAll(),
    staleTime: 60_000,
  })

  const {
    data: balances = [],
    isLoading: balancesLoading,
  } = useQuery({
    queryKey: ['customerBalances'],
    queryFn: () => customerBalanceRepository.getAll(),
    staleTime: 30_000,
  })

  const { data: rangeBills = [], isLoading: rangeBillsLoading } = useQuery({
    queryKey: ['bills', 'month', monthKey],
    queryFn: async () => {
      const bounds = istMonthBounds(monthKey)
      if (!bounds) return []
      return billRepository.getByDateRange(bounds.from, bounds.to)
    },
    staleTime: 30_000,
    enabled: view === 'new',
  })

  const { data: rangePurchases = [], isLoading: rangePurchasesLoading } = useQuery({
    queryKey: ['purchases', 'vendors-month', monthKey],
    queryFn: async () => {
      const bounds = istMonthBounds(monthKey)
      if (!bounds) return []
      return purchaseRepository.getVendorPurchasesByDateRange(bounds.from, bounds.to)
    },
    staleTime: 30_000,
    enabled: view === 'vendors',
  })

  const { data: shopProfile } = useQuery({
    queryKey: ['shopProfile'],
    queryFn: () => settingsRepository.getShopProfile(),
    staleTime: 5 * 60 * 1000,
  })

  const isLoading =
    customersLoading ||
    (view === 'existing' ? balancesLoading : view === 'new' ? rangeBillsLoading : rangePurchasesLoading)

  const ledgerPayMutation = useMutation({
    mutationFn: async ({ entry, amount, mode, remarks }: {
      entry: CustomerLedgerEntry
      amount: number
      mode: PaymentMode
      remarks: string
    }) => {
      if (entry.purchaseId) {
        const purchase = await purchaseRepository.getById(entry.purchaseId)
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

      // Credit balance: settle by paying against open customer-vendor purchases
      if (entry.customerId && entry.outstanding < -0.001) {
        const purchases = await purchaseRepository.getByCustomer(entry.customerId)
        const open = purchases
          .filter((p) => p.status === 'SAVED')
          .map((p) => ({
            purchase: p,
            remaining: p.remainingAmount ?? Math.max(0, p.grandTotal - (p.amountPaid ?? 0)),
          }))
          .filter((p) => p.remaining > 0.001)
          .sort((a, b) => {
            const da = a.purchase.createdAt?.toMillis?.() ?? 0
            const db = b.purchase.createdAt?.toMillis?.() ?? 0
            return da - db
          })

        let left = amount
        for (const { purchase, remaining } of open) {
          if (left <= 0.001) break
          const pay = Math.min(left, remaining)
          const currentPaid = purchase.amountPaid ?? 0
          await purchaseRepository.update(purchase.purchaseId, {
            amountPaid: currentPaid + pay,
            remainingAmount: Math.max(0, remaining - pay),
          })
          await transactionRepository.create({
            billId: purchase.purchaseId,
            purchaseId: purchase.purchaseId,
            customerId: entry.customerId,
            amount: pay,
            paymentMode: mode,
            remarks: remarks || undefined,
          })
          left -= pay
        }
        if (left > 0.01) {
          throw new Error(`Could not allocate ₹${fmt(left)} — no open purchase credit left`)
        }
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
      queryClient.invalidateQueries({ queryKey: ['customerBalances'] })
      queryClient.invalidateQueries({ queryKey: ['ledger-detail'] })
      queryClient.invalidateQueries({ queryKey: ['purchases'] })
      queryClient.invalidateQueries({ queryKey: ['purchases', 'vendors-month'] })
      queryClient.invalidateQueries({ queryKey: ['transactions', 'balance-sheet'] })
      queryClient.invalidateQueries({ queryKey: ['bills', 'balance-sheet'] })
      toast.success(
        entry.purchaseId
          ? 'Vendor payment recorded'
          : entry.outstanding < 0
            ? 'Credit payment recorded'
            : 'Ledger payment recorded'
      )
      setPayEntry(null)
      setPayAmount('')
      setPayRemarks('')
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to record payment')
    },
  })

  const handleLedgerPay = () => {
    const amount = Number(payAmount)
    if (!amount || amount <= 0) { toast.error('Enter a valid amount'); return }
    if (!payEntry) return
    const maxDue = Math.abs(payEntry.outstanding)
    if (amount > maxDue + 0.01) {
      toast.error(
        payEntry.outstanding < 0
          ? `Amount cannot exceed credit: ₹${fmt(maxDue)}`
          : `Amount cannot exceed due: ₹${fmt(maxDue)}`
      )
      return
    }
    ledgerPayMutation.mutate({ entry: payEntry, amount, mode: payMode, remarks: payRemarks })
  }

  const registeredIds = useMemo(
    () => new Set(customers.map((c) => c.customerId)),
    [customers]
  )

  const ledger = useMemo(() => {
    if (view === 'existing') {
      return buildExistingLedgerFromBalances(customers, balances, monthKey)
    }
    if (view === 'vendors') {
      return buildVendorLedger(rangePurchases)
    }
    return buildNewCustomerLedger(rangeBills, registeredIds)
  }, [view, customers, balances, rangeBills, rangePurchases, registeredIds, monthKey])

  const filtered = useMemo(() => {
    let result = ledger
    if (search.trim()) {
      const q = search.toLowerCase().trim()
      result = result.filter((e) => matchesLedgerSearch(e, q))
    }
    if (paymentFilter === 'pending') result = result.filter((e) => e.outstanding > 0.001)
    if (paymentFilter === 'paid') result = result.filter((e) => Math.abs(e.outstanding) < 0.001)
    if (paymentFilter === 'credit') result = result.filter((e) => e.outstanding < -0.001)
    return result
  }, [ledger, search, paymentFilter])

  // Client window over server-fetched range (cursor-style load more)
  const rangedFiltered = useMemo(() => {
    if (view === 'existing') return filtered
    return filtered.slice(0, rangeCursor)
  }, [filtered, rangeCursor, view])

  const hasMoreRange = view !== 'existing' && filtered.length > rangeCursor

  const totalPages = Math.max(1, Math.ceil(rangedFiltered.length / PAGE_SIZE))

  useEffect(() => {
    setPage(1)
    setRangeCursor(RANGE_PAGE_SIZE)
  }, [view, search, paymentFilter, monthKey])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const paginated = useMemo(
    () => rangedFiltered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [rangedFiltered, page]
  )

  const totalOutstanding = useMemo(
    () => ledger.reduce((s, e) => s + Math.max(0, e.outstanding), 0),
    [ledger]
  )
  const totalBilled = useMemo(() => ledger.reduce((s, e) => s + e.totalBilled, 0), [ledger])
  const totalCredit = useMemo(
    () => ledger.reduce((s, e) => s + (e.outstanding < 0 ? Math.abs(e.outstanding) : 0), 0),
    [ledger]
  )

  const existingCount = balances.length
  const newCount = rangeBills.filter((b) => !b.customerId || !registeredIds.has(b.customerId)).length
  const vendorsCount = rangePurchases.length
  const pendingCount = useMemo(() => ledger.filter((e) => e.outstanding > 0.001).length, [ledger])
  const paidCount = useMemo(() => ledger.filter((e) => Math.abs(e.outstanding) < 0.001).length, [ledger])
  const creditCount = useMemo(() => ledger.filter((e) => e.outstanding < -0.001).length, [ledger])

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
        const bill = shareLedgerEntry?.bills.find((b) => b.billId === row.reference)
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
        const purchase = shareLedgerEntry?.purchases?.find((p) => p.purchaseId === row.reference)
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

  const handleViewLedgerRow = async (
    row: LedgerRow,
    detailBills: Bill[],
    detailPurchases: PurchaseInvoice[]
  ) => {
    if (row.type === 'bill') {
      const bill =
        detailBills.find((b) => b.billId === row.reference) ??
        (await billRepository.getById(row.reference))
      if (bill) setViewBill(bill)
      return
    }
    if (row.type === 'purchase') {
      const purchase =
        detailPurchases.find((p) => p.purchaseId === row.reference) ??
        (await purchaseRepository.getById(row.reference))
      if (purchase) setViewPurchase(purchase)
    }
  }

  const resetPeriod = () => {
    setMonthKey(currentIstMonthKey())
  }

  const switchView = (next: LedgerView) => {
    setView(next)
    setSearch('')
    setPaymentFilter(next === 'vendors' ? 'all' : 'pending')
    resetPeriod()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Customer Ledger</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Summaries load fast; full history opens per customer
          </p>
        </div>

        {!isLoading && (
          <div className="flex gap-2 sm:gap-3 w-full sm:w-auto">
            <div
              className="flex flex-1 sm:flex-none items-center justify-center sm:justify-start gap-1.5 sm:gap-2 rounded-lg bg-white dark:bg-[#252d3d]/60 border border-gray-200 dark:border-[#2a3040] px-2 py-2 sm:px-3"
              title="Billed"
            >
              <IndianRupee className="h-4 w-4 text-gray-400 shrink-0" />
              <div className="min-w-0 text-center sm:text-left">
                <div className="hidden sm:block text-xs text-gray-400">Billed</div>
                <div className="font-semibold text-xs sm:text-sm text-gray-800 dark:text-white truncate">
                  ₹{fmt(totalBilled)}
                </div>
              </div>
            </div>
            <div
              className="flex flex-1 sm:flex-none items-center justify-center sm:justify-start gap-1.5 sm:gap-2 rounded-lg bg-white dark:bg-[#252d3d]/60 border border-gray-200 dark:border-[#2a3040] px-2 py-2 sm:px-3"
              title="Outstanding"
            >
              <TrendingDown className="h-4 w-4 text-red-400 shrink-0" />
              <div className="min-w-0 text-center sm:text-left">
                <div className="hidden sm:block text-xs text-gray-400">Outstanding</div>
                <div className="font-semibold text-xs sm:text-sm text-red-600 dark:text-red-400 truncate">
                  ₹{fmt(totalOutstanding)}
                </div>
              </div>
            </div>
            {totalCredit > 0 && (
              <div
                className="flex flex-1 sm:flex-none items-center justify-center sm:justify-start gap-1.5 sm:gap-2 rounded-lg bg-white dark:bg-[#252d3d]/60 border border-gray-200 dark:border-[#2a3040] px-2 py-2 sm:px-3"
                title="Credit"
              >
                <ArrowUpRight className="h-4 w-4 text-green-500 shrink-0" />
                <div className="min-w-0 text-center sm:text-left">
                  <div className="hidden sm:block text-xs text-gray-400">Credit</div>
                  <div className="font-semibold text-xs sm:text-sm text-green-600 dark:text-green-400 truncate">
                    ₹{fmt(totalCredit)}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex rounded-xl border border-gray-200 dark:border-[#2a3040] bg-white dark:bg-[#252d3d]/60 p-1 w-full sm:w-fit">
        <button
          onClick={() => switchView('existing')}
          title="Existing Customers"
          className={cn(
            'flex flex-1 sm:flex-none items-center justify-center sm:justify-start gap-1.5 sm:gap-2 rounded-lg px-2.5 py-2 sm:px-4 text-sm font-medium transition-all',
            view === 'existing'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          )}
        >
          <Users className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">Existing Customers</span>
          <span className={cn('rounded-full px-1.5 py-0.5 text-xs font-semibold', view === 'existing' ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-[#1e2330] text-gray-600 dark:text-gray-400')}>
            {existingCount}
          </span>
        </button>
        <button
          onClick={() => switchView('new')}
          title="New Customers"
          className={cn(
            'flex flex-1 sm:flex-none items-center justify-center sm:justify-start gap-1.5 sm:gap-2 rounded-lg px-2.5 py-2 sm:px-4 text-sm font-medium transition-all',
            view === 'new'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          )}
        >
          <UserPlus className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">New Customers</span>
          <span className={cn('rounded-full px-1.5 py-0.5 text-xs font-semibold', view === 'new' ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-[#1e2330] text-gray-600 dark:text-gray-400')}>
            {newCount}
          </span>
        </button>
        <button
          onClick={() => switchView('vendors')}
          title="Vendor Purchases"
          className={cn(
            'flex flex-1 sm:flex-none items-center justify-center sm:justify-start gap-1.5 sm:gap-2 rounded-lg px-2.5 py-2 sm:px-4 text-sm font-medium transition-all',
            view === 'vendors'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          )}
        >
          <ShoppingBag className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">Vendor Purchases</span>
          <span className={cn('rounded-full px-1.5 py-0.5 text-xs font-semibold', view === 'vendors' ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-[#1e2330] text-gray-600 dark:text-gray-400')}>
            {vendorsCount}
          </span>
        </button>
      </div>

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
            { value: 'credit', label: 'Credit', count: creditCount },
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
                      : value === 'credit'
                        ? 'bg-emerald-600 text-white border-emerald-600'
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

      <div className="sm:hidden">
        <Button type="button" variant="outline" className="w-full justify-start" onClick={() => setPeriodDialogOpen(true)}>
          <Calendar className="h-4 w-4" />
          {view === 'existing' ? 'Activity period' : view === 'vendors' ? 'Purchase month' : 'Bill month'}: {MONTH_LABELS[(periodParts?.month ?? 1) - 1]} {periodParts?.year ?? new Date().getFullYear()}
        </Button>
      </div>

      <div className="hidden sm:flex flex-col sm:flex-row sm:items-end gap-3 rounded-xl border border-gray-200 dark:border-[#2a3040] bg-white dark:bg-[#252d3d]/60 p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200 shrink-0">
          <Calendar className="h-4 w-4 text-gray-400" />
          {view === 'existing' ? 'Activity period' : view === 'vendors' ? 'Purchase month' : 'Bill month'}
          <span className="text-xs font-normal text-gray-400">(IST)</span>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 flex-1">
          <div className="space-y-1 flex-1 max-w-xs">
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
                <option key={label} value={i + 1}>{label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1 flex-1 max-w-xs">
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
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" className="shrink-0 text-gray-500" onClick={resetPeriod}>
          <X className="h-4 w-4" />
          This month
        </Button>
      </div>
      {view === 'existing' && (
        <p className="text-xs text-gray-400 -mt-3">
          Customers with outstanding dues always appear. Expanded ledger loads only this month’s rows;
          earlier dues show as Brought Forward from monthly snapshots.
        </p>
      )}

      <Dialog open={periodDialogOpen} onOpenChange={setPeriodDialogOpen}>
        <DialogContent className="sm:hidden max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {view === 'existing' ? 'Activity period' : view === 'vendors' ? 'Purchase month' : 'Bill month'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Month</Label>
              <select
                value={periodParts?.month ?? 1}
                onChange={(e) => {
                  const m = Number(e.target.value)
                  const y = periodParts?.year ?? new Date().getFullYear()
                  setMonthKey(formatMonthKey(y, m))
                }}
                className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {MONTH_LABELS.map((label, i) => (
                  <option key={label} value={i + 1}>{label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Year</Label>
              <select
                value={periodParts?.year ?? new Date().getFullYear()}
                onChange={(e) => {
                  const y = Number(e.target.value)
                  const m = periodParts?.month ?? 1
                  setMonthKey(formatMonthKey(y, m))
                }}
                className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={resetPeriod}>
              This month
            </Button>
            <Button type="button" onClick={() => setPeriodDialogOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!isLoading && rangedFiltered.length > 0 && (
        <p className="text-xs text-gray-400">
          Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, rangedFiltered.length)} of {rangedFiltered.length}
          {filtered.length !== rangedFiltered.length ? ` (loaded ${rangedFiltered.length} of ${filtered.length})` : ''}
          {paymentFilter !== 'all' && ` · ${paymentFilter === 'pending' ? 'Pending' : paymentFilter === 'paid' ? 'Paid' : 'Credit'}`}
        </p>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-36 rounded-xl bg-gray-100 dark:bg-[#252d3d]/40 animate-pulse" />
          ))}
        </div>
      ) : rangedFiltered.length === 0 ? (
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
              : paymentFilter === 'pending'
                ? view === 'vendors' ? 'No vendor purchases found.' : 'No pending bills found.'
                : paymentFilter === 'paid'
                  ? 'No paid bills found.'
                  : paymentFilter === 'credit'
                    ? 'No credit balances found.'
                  : view === 'existing'
                    ? 'No customer balances for this period.'
                    : view === 'vendors'
                      ? 'No vendor purchases in this date range.'
                      : 'No walk-in customer bills in this date range.'}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {paginated.map((entry) => (
              <LedgerCard
                key={entry.key}
                entry={entry}
                monthKey={view === 'existing' ? monthKey : undefined}
                onRecordPayment={setPayEntry}
                onShareLedger={(e) => { setShareFrom(''); setShareTo(''); setShareLedgerEntry(e) }}
                onViewRow={handleViewLedgerRow}
              />
            ))}
          </div>

          {hasMoreRange && (
            <div className="flex justify-center">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRangeCursor((c) => c + RANGE_PAGE_SIZE)}
              >
                Load more ({filtered.length - rangedFiltered.length} remaining)
              </Button>
            </div>
          )}

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
                    <Input type="date" value={shareFrom} onChange={(e) => setShareFrom(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-500">To</Label>
                    <Input type="date" value={shareTo} onChange={(e) => setShareTo(e.target.value)} />
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

      <Dialog open={!!payEntry} onOpenChange={(open) => { if (!open) { setPayEntry(null); setPayAmount(''); setPayRemarks('') } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-indigo-500" />
              {payEntry?.purchaseId
                ? 'Record Vendor Payment'
                : payEntry && payEntry.outstanding < 0
                  ? 'Pay Credit'
                  : 'Record Ledger Payment'}
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
                  <span className="text-gray-500">
                    {payEntry.purchaseId
                      ? 'Amount Due'
                      : payEntry.outstanding < 0
                        ? 'Credit Balance'
                        : 'Ledger Balance'}
                  </span>
                  <span className={cn(
                    'font-bold',
                    payEntry.outstanding < 0
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  )}>
                    ₹{fmt(Math.abs(payEntry.outstanding))}
                  </span>
                </div>
              </div>

              {payEntry.outstanding < 0 && !payEntry.purchaseId && (
                <p className="text-xs text-gray-500">
                  This settles open purchase credits for this customer (FIFO).
                </p>
              )}

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
              {payEntry && payEntry.outstanding < 0 && !payEntry.purchaseId ? 'Pay Credit' : 'Record Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {viewPurchase && (
        <Dialog open={!!viewPurchase} onOpenChange={() => setViewPurchase(null)}>
          <DialogContent className="max-w-2xl max-h-[95vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Purchase — {viewPurchase.purchaseNumber ?? 'Draft'}
              </DialogTitle>
            </DialogHeader>
            <PurchaseInvoiceView purchase={viewPurchase} />
            <DialogFooter>
              {(viewPurchase.remainingAmount ?? Math.max(0, viewPurchase.grandTotal - (viewPurchase.amountPaid ?? 0))) > 0.001 && (
                <Button
                  onClick={() => {
                    setViewPurchase(null)
                    setPayEntry(purchaseEntryFromInvoice(viewPurchase))
                  }}
                >
                  <CreditCard className="h-4 w-4" />
                  Pay Invoice
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
