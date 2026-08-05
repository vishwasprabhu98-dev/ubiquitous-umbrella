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
import { Download, FileSpreadsheet, TrendingUp, IndianRupee, Clock, CheckCircle } from 'lucide-react'
import { format, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths } from 'date-fns'
import { toast } from 'sonner'
import { billRepository } from '@/firebase/repositories/billRepository'
import { customerRepository } from '@/firebase/repositories/customerRepository'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency } from '@/lib/utils'

const COLORS = ['#2563eb', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

interface CustomerBalance {
  customerId: string
  name: string
  totalBillAmount: number
  paidAmount: number
  pendingAmount: number
}

export default function BalanceSheetPage() {
  const sixMonthsAgo = subMonths(new Date(), 5)
  const [fromDate, setFromDate] = useState(format(startOfMonth(sixMonthsAgo), 'yyyy-MM-dd'))
  const [toDate, setToDate] = useState(format(new Date(), 'yyyy-MM-dd'))

  const { data: bills = [], isLoading: billsLoading } = useQuery({
    queryKey: ['bills'],
    queryFn: billRepository.getAll,
  })
  const { isLoading: customersLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: customerRepository.getAll,
  })

  const isLoading = billsLoading || customersLoading

  const filteredBills = useMemo(() => {
    const from = new Date(fromDate)
    from.setHours(0, 0, 0, 0)
    const to = new Date(toDate)
    to.setHours(23, 59, 59, 999)
    return bills.filter((b) => {
      const t = b.createdAt?.toMillis?.() ?? 0
      return t >= from.getTime() && t <= to.getTime()
    })
  }, [bills, fromDate, toDate])

  const totalSales = filteredBills.reduce((s, b) => s + b.grandTotal, 0)
  const totalGST = filteredBills.reduce((s, b) => s + b.gstAmount, 0)
  const totalOutstanding = filteredBills.reduce((s, b) => s + b.remainingAmount, 0)
  const totalPaid = filteredBills.reduce((s, b) => s + b.amountPaid, 0)

  // Monthly sales data (last 6 months)
  const monthlyData = useMemo(() => {
    const months = eachMonthOfInterval({
      start: startOfMonth(sixMonthsAgo),
      end: endOfMonth(new Date()),
    })
    return months.map((month) => {
      const monthStart = startOfMonth(month).getTime()
      const monthEnd = endOfMonth(month).getTime()
      const monthBills = bills.filter((b) => {
        const t = b.createdAt?.toMillis?.() ?? 0
        return t >= monthStart && t <= monthEnd
      })
      return {
        month: format(month, 'MMM yy'),
        sales: monthBills.reduce((s, b) => s + b.grandTotal, 0),
        paid: monthBills.reduce((s, b) => s + b.amountPaid, 0),
        pending: monthBills.reduce((s, b) => s + b.remainingAmount, 0),
      }
    })
  }, [bills])

  // Customer balance calculation
  const customerBalances = useMemo<CustomerBalance[]>(() => {
    const map = new Map<string, CustomerBalance>()
    filteredBills.forEach((bill) => {
      const name = bill.customerInfo?.name?.trim() || 'Unknown Customer'
      const id = bill.customerId ?? bill.customerInfo?.phone ?? bill.billId ?? name
      const existing = map.get(id) ?? { customerId: id, name, totalBillAmount: 0, paidAmount: 0, pendingAmount: 0 }
      existing.totalBillAmount += bill.grandTotal
      existing.paidAmount += bill.amountPaid
      existing.pendingAmount += bill.remainingAmount
      map.set(id, existing)
    })
    return Array.from(map.values()).sort((a, b) => b.totalBillAmount - a.totalBillAmount)
  }, [filteredBills])

  // Customer sales pie data (top 6)
  const salesPieData = customerBalances.slice(0, 6).map((c) => {
    const label = c.name || 'Unknown Customer'
    return {
      name: label.length > 12 ? `${label.slice(0, 12)}…` : label,
      value: c.totalBillAmount,
    }
  })

  const exportCSV = () => {
    if (customerBalances.length === 0) {
      toast.error('No data to export')
      return
    }
    const header = 'Customer Name,Total Bill Amount,Paid Amount,Pending Amount\n'
    const rows = customerBalances
      .map((c) => `"${c.name}",${c.totalBillAmount.toFixed(2)},${c.paidAmount.toFixed(2)},${c.pendingAmount.toFixed(2)}`)
      .join('\n')
    const csv = header + rows
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `balance-sheet-${fromDate}-to-${toDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('CSV exported!')
  }

  const exportExcel = () => {
    if (customerBalances.length === 0) {
      toast.error('No data to export')
      return
    }
    import('xlsx').then(({ utils, writeFile }) => {
      const wsData = [
        ['Customer Name', 'Total Bill Amount', 'Paid Amount', 'Pending Amount'],
        ...customerBalances.map((c) => [c.name, c.totalBillAmount, c.paidAmount, c.pendingAmount]),
      ]
      const ws = utils.aoa_to_sheet(wsData)
      const wb = utils.book_new()
      utils.book_append_sheet(wb, ws, 'Balance Sheet')
      writeFile(wb, `balance-sheet-${fromDate}-to-${toDate}.xlsx`)
      toast.success('Excel exported!')
    }).catch(() => toast.error('Export failed'))
  }

  const statCards = [
    { title: 'Total Sales', value: formatCurrency(totalSales), icon: TrendingUp, color: 'bg-blue-600', change: null },
    { title: 'GST Collected', value: formatCurrency(totalGST), icon: IndianRupee, color: 'bg-purple-600', change: null },
    { title: 'Amount Received', value: formatCurrency(totalPaid), icon: CheckCircle, color: 'bg-green-600', change: null },
    { title: 'Outstanding Amount', value: formatCurrency(totalOutstanding), icon: Clock, color: 'bg-orange-500', change: null },
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

      {/* Date Filters */}
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

      {/* Stat Cards */}
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
                    <div className={`p-3 rounded-xl ${stat.color}`}>
                      <stat.icon className="h-5 w-5 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Monthly Sales Overview</CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Customer Sales Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {salesPieData.length === 0 ? (
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

      {/* Customer Balance Table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Customer Balance Table</CardTitle>
            <span className="text-sm text-gray-500">{customerBalances.length} customers</span>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : customerBalances.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">
              No bills found in selected date range
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-800">
                    <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Customer</th>
                    <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Bill</th>
                    <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Paid</th>
                    <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Pending</th>
                    <th className="py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {customerBalances.map((cb) => (
                    <tr
                      key={cb.customerId}
                      className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
                    >
                      <td className="py-3 px-3 font-medium">{cb.name}</td>
                      <td className="py-3 px-3 text-right">{formatCurrency(cb.totalBillAmount)}</td>
                      <td className="py-3 px-3 text-right text-green-600 font-medium">{formatCurrency(cb.paidAmount)}</td>
                      <td className="py-3 px-3 text-right text-red-500 font-medium">{formatCurrency(cb.pendingAmount)}</td>
                      <td className="py-3 px-3">
                        {cb.pendingAmount <= 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                            Cleared
                          </span>
                        ) : cb.paidAmount > 0 ? (
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
                    <td className="py-3 px-3 text-right">{formatCurrency(totalSales)}</td>
                    <td className="py-3 px-3 text-right text-green-600">{formatCurrency(totalPaid)}</td>
                    <td className="py-3 px-3 text-right text-red-500">{formatCurrency(totalOutstanding)}</td>
                    <td className="py-3 px-3"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
