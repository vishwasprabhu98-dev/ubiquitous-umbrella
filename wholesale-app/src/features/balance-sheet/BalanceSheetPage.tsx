import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import {
  Download,
  FileSpreadsheet,
  TrendingUp,
  ShoppingBag,
  Clock,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { format, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths } from 'date-fns'
import { toast } from 'sonner'
import { billRepository } from '@/firebase/repositories/billRepository'
import { customerRepository } from '@/firebase/repositories/customerRepository'
import { purchaseRepository } from '@/firebase/repositories/purchaseRepository'
import {
  LEDGER_PAYMENT_REF,
} from '@/firebase/repositories/customerBalanceRepository'
import { transactionRepository } from '@/firebase/repositories/transactionRepository'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency, cn } from '@/lib/utils'
import { istDayEnd, istDayStart } from '@/lib/istDate'
import type { Bill, PurchaseInvoice, Transaction } from '@/types'

const COLORS = ['#2563eb', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']
const TABLE_PAGE_SIZE = 25

interface CustomerBalanceRow {
  key: string
  name: string
  totalBillAmount: number
  paidAmount: number
  /** Unpaid remainder on purchases from this customer — offsets what they owe (same as ledger). */
  purchaseCredit: number
  pendingAmount: number
  isRegistered: boolean
}

function rangeBounds(fromDate: string, toDate: string) {
  return { from: istDayStart(fromDate), to: istDayEnd(toDate) }
}

function purchaseRemaining(p: PurchaseInvoice): number {
  return p.remainingAmount ?? Math.max(0, (p.grandTotal ?? 0) - (p.amountPaid ?? 0))
}

function buildCustomerBalances(
  bills: Bill[],
  ledgerPayments: Transaction[],
  customerPurchases: PurchaseInvoice[],
  registeredIds: Set<string>
): CustomerBalanceRow[] {
  const map = new Map<string, CustomerBalanceRow>()

  const ensure = (key: string, name: string, isRegistered: boolean) => {
    const existing = map.get(key)
    if (existing) return existing
    const row: CustomerBalanceRow = {
      key,
      name,
      totalBillAmount: 0,
      paidAmount: 0,
      purchaseCredit: 0,
      pendingAmount: 0,
      isRegistered,
    }
    map.set(key, row)
    return row
  }

  for (const bill of bills) {
    const isRegistered = Boolean(bill.customerId && registeredIds.has(bill.customerId))
    const key = isRegistered
      ? bill.customerId!
      : `new:${bill.customerInfo?.phone || bill.billId}`
    const name = bill.customerInfo?.name?.trim() || 'Unknown Customer'
    const row = ensure(key, name, isRegistered)
    row.totalBillAmount += bill.grandTotal ?? 0
    row.paidAmount += bill.amountPaid ?? 0
  }

  // Ledger payments reduce outstanding for registered customers (not stored on bills)
  for (const tx of ledgerPayments) {
    if (!tx.customerId || !registeredIds.has(tx.customerId)) continue
    const row = map.get(tx.customerId)
    if (row) {
      row.paidAmount += tx.amount
    } else {
      ensure(tx.customerId, 'Customer', true).paidAmount += tx.amount
    }
  }

  // Purchases from existing customers = credit against their bills (matches ledger)
  for (const purchase of customerPurchases) {
    if (purchase.status !== 'SAVED') continue
    const customerId = purchase.customerId
    if (!customerId || !registeredIds.has(customerId)) continue
    if (!(purchase.vendorType === 'customer' || purchase.customerId)) continue
    const credit = purchaseRemaining(purchase)
    if (credit <= 0.001) continue
    const row = map.get(customerId)
    if (row) {
      row.purchaseCredit += credit
    } else {
      ensure(customerId, 'Customer', true).purchaseCredit += credit
    }
  }

  for (const row of map.values()) {
    row.pendingAmount = Math.max(
      0,
      row.totalBillAmount - row.paidAmount - row.purchaseCredit
    )
  }

  return Array.from(map.values()).sort((a, b) => b.totalBillAmount - a.totalBillAmount)
}

function CustomerBalanceTable({
  rows,
  title,
  emptyLabel,
}: {
  rows: CustomerBalanceRow[]
  title: string
  emptyLabel: string
}) {
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(rows.length / TABLE_PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageRows = rows.slice((safePage - 1) * TABLE_PAGE_SIZE, safePage * TABLE_PAGE_SIZE)

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => {
          acc.billed += r.totalBillAmount
          acc.paid += r.paidAmount
          acc.pending += r.pendingAmount
          return acc
        },
        { billed: 0, paid: 0, pending: 0 }
      ),
    [rows]
  )

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{title}</CardTitle>
          <span className="text-sm text-gray-500">{rows.length} customers</span>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">{emptyLabel}</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-800">
                    <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Customer
                    </th>
                    <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Total Bill
                    </th>
                    <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Paid
                    </th>
                    <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Pending
                    </th>
                    <th className="py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((cb) => (
                    <tr
                      key={cb.key}
                      className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
                    >
                      <td className="py-3 px-3 font-medium">{cb.name}</td>
                      <td className="py-3 px-3 text-right">{formatCurrency(cb.totalBillAmount)}</td>
                      <td className="py-3 px-3 text-right text-green-600 font-medium">
                        {formatCurrency(cb.paidAmount)}
                      </td>
                      <td className="py-3 px-3 text-right text-red-500 font-medium">
                        {formatCurrency(cb.pendingAmount)}
                      </td>
                      <td className="py-3 px-3">
                        {cb.pendingAmount <= 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                            Cleared
                          </span>
                        ) : cb.paidAmount > 0 || cb.purchaseCredit > 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">
                            Partial
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">
                            Unpaid
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-300 dark:border-[#2a3040] bg-gray-50 dark:bg-[#252d3d]/60 font-bold">
                    <td className="py-3 px-3">Total</td>
                    <td className="py-3 px-3 text-right">{formatCurrency(totals.billed)}</td>
                    <td className="py-3 px-3 text-right text-green-600">{formatCurrency(totals.paid)}</td>
                    <td className="py-3 px-3 text-right text-red-500">{formatCurrency(totals.pending)}</td>
                    <td className="py-3 px-3" />
                  </tr>
                </tfoot>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                <span>
                  Page {safePage} of {totalPages}
                </span>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

export default function BalanceSheetPage() {
  const sixMonthsAgo = useMemo(() => subMonths(new Date(), 5), [])
  const [fromDate, setFromDate] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [toDate, setToDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))

  const bounds = useMemo(() => rangeBounds(fromDate, toDate), [fromDate, toDate])
  const chartFrom = useMemo(
    () => istDayStart(format(startOfMonth(sixMonthsAgo), 'yyyy-MM-dd')),
    [sixMonthsAgo]
  )
  const chartTo = useMemo(() => istDayEnd(format(new Date(), 'yyyy-MM-dd')), [])

  const { data: bills = [], isLoading: billsLoading } = useQuery({
    queryKey: ['bills', 'balance-sheet', fromDate, toDate],
    queryFn: () => billRepository.getByDateRange(bounds.from, bounds.to),
    staleTime: 30_000,
  })

  const { data: purchases = [], isLoading: purchasesLoading } = useQuery({
    queryKey: ['purchases', 'balance-sheet', fromDate, toDate],
    queryFn: () => purchaseRepository.getByDateRange(bounds.from, bounds.to),
    staleTime: 30_000,
  })

  const { data: periodTransactions = [], isLoading: txLoading } = useQuery({
    queryKey: ['transactions', 'balance-sheet', fromDate, toDate],
    queryFn: () => transactionRepository.getByDateRange(bounds.from, bounds.to),
    staleTime: 30_000,
  })

  const { data: chartBills = [], isLoading: chartLoading } = useQuery({
    queryKey: ['bills', 'balance-sheet-chart'],
    queryFn: () => billRepository.getByDateRange(chartFrom, chartTo),
    staleTime: 60_000,
  })

  const { data: customers = [], isLoading: customersLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: customerRepository.getAll,
    staleTime: 5 * 60 * 1000,
    select: (list) =>
      list.map((c) => ({ customerId: c.customerId, name: c.name })),
  })

  const isLoading = billsLoading || purchasesLoading || txLoading || customersLoading

  const registeredIds = useMemo(
    () => new Set(customers.map((c) => c.customerId)),
    [customers]
  )

  const customerNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of customers) m.set(c.customerId, c.name)
    return m
  }, [customers])

  const ledgerPayments = useMemo(
    () =>
      periodTransactions.filter(
        (tx) => tx.billId === LEDGER_PAYMENT_REF && !tx.purchaseId && (tx.amount ?? 0) > 0
      ),
    [periodTransactions]
  )

  const savedPurchases = useMemo(
    () => purchases.filter((p) => p.status === 'SAVED'),
    [purchases]
  )

  const customerBalances = useMemo(() => {
    const rows = buildCustomerBalances(
      bills,
      ledgerPayments,
      savedPurchases,
      registeredIds
    )
    for (const row of rows) {
      if (row.isRegistered && customerNameById.has(row.key)) {
        row.name = customerNameById.get(row.key)!
      }
    }
    return rows
  }, [bills, ledgerPayments, savedPurchases, registeredIds, customerNameById])

  const existingBalances = useMemo(
    () => customerBalances.filter((r) => r.isRegistered),
    [customerBalances]
  )
  const newBalances = useMemo(
    () => customerBalances.filter((r) => !r.isRegistered),
    [customerBalances]
  )

  const totalSales = useMemo(
    () => bills.reduce((s, b) => s + (b.grandTotal ?? 0), 0),
    [bills]
  )
  const totalPurchases = useMemo(
    () => savedPurchases.reduce((s, p) => s + (p.grandTotal ?? 0), 0),
    [savedPurchases]
  )
  const billPaid = useMemo(
    () => bills.reduce((s, b) => s + (b.amountPaid ?? 0), 0),
    [bills]
  )
  const ledgerPaid = useMemo(
    () => ledgerPayments.reduce((s, tx) => s + (tx.amount ?? 0), 0),
    [ledgerPayments]
  )
  const totalPaid = billPaid + ledgerPaid
  const totalOutstanding = useMemo(
    () => customerBalances.reduce((s, r) => s + r.pendingAmount, 0),
    [customerBalances]
  )

  const monthlyData = useMemo(() => {
    const months = eachMonthOfInterval({
      start: startOfMonth(sixMonthsAgo),
      end: endOfMonth(new Date()),
    })
    return months.map((month) => {
      const monthStart = startOfMonth(month).getTime()
      const monthEnd = endOfMonth(month).getTime()
      const monthBills = chartBills.filter((b) => {
        const t = b.createdAt?.toMillis?.() ?? 0
        return t >= monthStart && t <= monthEnd
      })
      return {
        month: format(month, 'MMM yy'),
        sales: monthBills.reduce((s, b) => s + (b.grandTotal ?? 0), 0),
        paid: monthBills.reduce((s, b) => s + (b.amountPaid ?? 0), 0),
        pending: monthBills.reduce((s, b) => s + (b.remainingAmount ?? 0), 0),
      }
    })
  }, [chartBills, sixMonthsAgo])

  const salesPieData = useMemo(() => {
    return customerBalances.slice(0, 6).map((c) => {
      const label = c.name || 'Unknown Customer'
      return {
        name: label.length > 12 ? `${label.slice(0, 12)}…` : label,
        value: c.totalBillAmount,
      }
    })
  }, [customerBalances])

  const exportRows = customerBalances

  const exportCSV = () => {
    if (exportRows.length === 0) {
      toast.error('No data to export')
      return
    }
    const header = 'Type,Customer Name,Total Bill Amount,Paid Amount,Pending Amount\n'
    const rows = exportRows
      .map(
        (c) =>
          `"${c.isRegistered ? 'Existing' : 'New'}","${c.name}",${c.totalBillAmount.toFixed(2)},${c.paidAmount.toFixed(2)},${c.pendingAmount.toFixed(2)}`
      )
      .join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `balance-sheet-${fromDate}-to-${toDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('CSV exported!')
  }

  const exportExcel = () => {
    if (exportRows.length === 0) {
      toast.error('No data to export')
      return
    }
    import('xlsx')
      .then(({ utils, writeFile }) => {
        const wsData = [
          ['Type', 'Customer Name', 'Total Bill Amount', 'Paid Amount', 'Pending Amount'],
          ...exportRows.map((c) => [
            c.isRegistered ? 'Existing' : 'New',
            c.name,
            c.totalBillAmount,
            c.paidAmount,
            c.pendingAmount,
          ]),
        ]
        const ws = utils.aoa_to_sheet(wsData)
        const wb = utils.book_new()
        utils.book_append_sheet(wb, ws, 'Balance Sheet')
        writeFile(wb, `balance-sheet-${fromDate}-to-${toDate}.xlsx`)
        toast.success('Excel exported!')
      })
      .catch(() => toast.error('Export failed'))
  }

  const statCards = [
    { title: 'Total Sales', value: formatCurrency(totalSales), icon: TrendingUp, color: 'bg-blue-600' },
    { title: 'Total Purchases', value: formatCurrency(totalPurchases), icon: ShoppingBag, color: 'bg-purple-600' },
    { title: 'Amount Received', value: formatCurrency(totalPaid), icon: CheckCircle, color: 'bg-green-600' },
    { title: 'Outstanding Amount', value: formatCurrency(totalOutstanding), icon: Clock, color: 'bg-orange-500' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Balance Sheet</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Financial reports & analytics</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4" />
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportExcel}>
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1.5">
              <Label>From Date</Label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-44"
              />
            </div>
            <div className="space-y-1.5">
              <Label>To Date</Label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-44"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFromDate(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
                setToDate(format(new Date(), 'yyyy-MM-dd'))
              }}
            >
              This Month
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFromDate(format(startOfMonth(sixMonthsAgo), 'yyyy-MM-dd'))
                setToDate(format(new Date(), 'yyyy-MM-dd'))
              }}
            >
              Last 6 Months
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
          : statCards.map((stat) => (
              <Card key={stat.title} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-gray-500 font-medium">{stat.title}</p>
                      <p className="text-xl font-bold mt-1 text-gray-900 dark:text-white">{stat.value}</p>
                    </div>
                    <div className={cn('p-3 rounded-xl', stat.color)}>
                      <stat.icon className="h-5 w-5 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Monthly Sales Overview</CardTitle>
          </CardHeader>
          <CardContent>
            {chartLoading ? (
              <Skeleton className="h-[240px] w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={monthlyData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                  <Legend iconSize={10} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="sales" name="Total Sales" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="paid" name="Paid" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="pending" name="Pending" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Customer Sales Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[240px] w-full" />
            ) : salesPieData.length === 0 ? (
              <div className="h-[240px] flex items-center justify-center text-sm text-gray-400">
                No data in selected range
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={salesPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {salesPieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                  <Legend iconSize={10} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <CustomerBalanceTable
            title="Existing Customers"
            rows={existingBalances}
            emptyLabel="No registered-customer bills in selected date range"
          />
          <CustomerBalanceTable
            title="New Customers"
            rows={newBalances}
            emptyLabel="No walk-in / new-customer bills in selected date range"
          />
        </div>
      )}
    </div>
  )
}
