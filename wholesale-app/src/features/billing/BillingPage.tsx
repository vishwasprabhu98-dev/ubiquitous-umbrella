import { useState, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import {
  Plus,
  Trash2,
  Loader2,
  Receipt,
  Search,
  Download,
  ChevronDown,
  ChevronUp,
  Edit2,
  CreditCard,
  Tag,
  Filter,
  X,
  BookOpen,
  Share2,
} from 'lucide-react'
import { startOfDay, subDays, startOfMonth, endOfMonth, isValid, parseISO } from 'date-fns'
import { toast } from 'sonner'
import { billRepository } from '@/firebase/repositories/billRepository'
import { settingsRepository } from '@/firebase/repositories/settingsRepository'
import { customerRepository } from '@/firebase/repositories/customerRepository'
import { productRepository } from '@/firebase/repositories/productRepository'
import { pricingRepository } from '@/firebase/repositories/pricingRepository'
import { transactionRepository } from '@/firebase/repositories/transactionRepository'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NumericInput } from '@/components/ui/numeric-input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency, formatDate } from '@/lib/utils'
import { sharePdfBlob, downloadPdfBlob } from '@/lib/sharePdf'
import { createBillPdfBlob } from '@/lib/billPdf'
import type { Bill, BillStatus, PaymentMode, PaymentStatus } from '@/types'
import InvoiceView from './InvoiceView'

const BILL_STATUS_STYLES: Record<BillStatus, string> = {
  PENDING: 'bg-gray-100 text-gray-700 dark:bg-[#2a3040] dark:text-gray-300',
  ORDER_ACCEPTED: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  ORDER_DELIVERED: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',
  PAYMENT_PENDING: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  DONE: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  PARTIAL_PAYMENT: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
}

const ALL_STATUSES: { value: BillStatus; label: string }[] = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'ORDER_ACCEPTED', label: 'Order Accepted' },
  { value: 'ORDER_DELIVERED', label: 'Order Delivered' },
  { value: 'PAYMENT_PENDING', label: 'Payment Pending' },
  { value: 'PARTIAL_PAYMENT', label: 'Partial Payment' },
  { value: 'DONE', label: 'Done' },
]

const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'OTHER', label: 'Other' },
]

interface BillFormData {
  customerType: 'existing' | 'new'
  customerId?: string
  customerName: string
  customerPhone: string
  customerGst?: string
  items: {
    productId: string
    productName: string
    quantity: number
    unitRate: number
    itemDiscount: number
    gstPercentage: number
    total: number
  }[]
  discount: number
  amountPaid: number
  status: BillStatus
  isGstBill: boolean
  comment?: string
}

function BillCard({
  bill,
  onView,
  onEdit,
  onStatus,
  onPayment,
  onMoveToLedger,
}: {
  bill: Bill
  onView: (b: Bill) => void
  onEdit: (b: Bill) => void
  onStatus: (b: Bill) => void
  onPayment: (b: Bill) => void
  onMoveToLedger: (b: Bill) => void
}) {
  const isDone = bill.status === 'DONE'
  return (
    <Card
      className="hover:shadow-sm transition-shadow cursor-pointer"
      onClick={() => onView(bill)}
    >
      <CardContent className="p-4 space-y-3">
        {/* Top row: info left, amount right */}
        <div className="flex items-start justify-between gap-3">
          {/* Left: bill number, badges, customer, date */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-mono text-xs text-blue-600 font-semibold">{bill.billNumber}</span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${BILL_STATUS_STYLES[bill.status]}`}>
                {bill.status.replace(/_/g, ' ')}
              </span>
              {bill.paymentStatus === 'PAID' && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                  Paid ✓
                </span>
              )}
              {bill.paymentStatus === 'PARTIAL' && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300">
                  Partial
                </span>
              )}
              {bill.movedToLedger && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                  <BookOpen className="h-3 w-3" /> On Ledger
                </span>
              )}
            </div>
            <p className="font-semibold mt-1 text-gray-900 dark:text-white truncate">{bill.customerInfo.name}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {bill.createdAt?.toDate ? formatDate(bill.createdAt.toDate()) : '—'}
            </p>
            {bill.comment && (
              <p className="text-xs text-gray-400 italic mt-0.5 line-clamp-1">{bill.comment}</p>
            )}
          </div>

          {/* Right: amounts only */}
          <div className="shrink-0 text-right">
            <p className="font-bold text-gray-900 dark:text-white">{formatCurrency(bill.grandTotal)}</p>
            {bill.amountPaid > 0 && (
              <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                Paid: {formatCurrency(bill.amountPaid)}
              </p>
            )}
            {bill.remainingAmount > 0 && !bill.movedToLedger && (
              <p className="text-xs text-red-500 mt-0.5">Due: {formatCurrency(bill.remainingAmount)}</p>
            )}
          </div>
        </div>

        {/* Bottom row: action buttons — right aligned */}
        <div
          className="flex items-center justify-end gap-1.5 flex-wrap pt-1 border-t border-gray-100 dark:border-[#2a3040]"
          onClick={(e) => e.stopPropagation()}
        >
          {!isDone && (
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => onEdit(bill)}>
              <Edit2 className="h-3 w-3" /> Edit
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => onStatus(bill)}>
            <Tag className="h-3 w-3" /> Status
          </Button>
          {bill.remainingAmount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1 border-green-200 text-green-700 hover:bg-green-50 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-950"
              onClick={() => onPayment(bill)}
            >
              <CreditCard className="h-3 w-3" /> Pay
            </Button>
          )}
          {/* Move to Ledger — only for existing (registered) customers with outstanding amount */}
          {bill.customerId && bill.remainingAmount > 0 && !bill.movedToLedger && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1 border-indigo-200 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-400 dark:hover:bg-indigo-950"
              onClick={() => onMoveToLedger(bill)}
            >
              <BookOpen className="h-3 w-3" /> Move to Ledger
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

type DatePreset = 'today' | 'yesterday' | 'last7' | 'last30' | 'thisMonth' | 'custom'

function toInputDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

function getPresetRange(preset: DatePreset): { from: string; to: string } {
  const today = new Date()
  switch (preset) {
    case 'today':
      return { from: toInputDate(today), to: toInputDate(today) }
    case 'yesterday': {
      const y = subDays(today, 1)
      return { from: toInputDate(y), to: toInputDate(y) }
    }
    case 'last7':
      return { from: toInputDate(subDays(today, 6)), to: toInputDate(today) }
    case 'last30':
      return { from: toInputDate(subDays(today, 29)), to: toInputDate(today) }
    case 'thisMonth':
      return { from: toInputDate(startOfMonth(today)), to: toInputDate(endOfMonth(today)) }
    default:
      return { from: '', to: '' }
  }
}

export default function BillingPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [viewBill, setViewBill] = useState<Bill | null>(null)
  const [sharingPdf, setSharingPdf] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create')
  const [editingBill, setEditingBill] = useState<Bill | null>(null)
  const [customerSearch, setCustomerSearch] = useState('')
  const [expandSummary, setExpandSummary] = useState(true)

  // Filter state — default: last 7 days
  const [showFilters, setShowFilters] = useState(false)
  const [datePreset, setDatePreset] = useState<DatePreset>('last7')
  const [filterFrom, setFilterFrom] = useState(() => getPresetRange('last7').from)
  const [filterTo, setFilterTo] = useState(() => getPresetRange('last7').to)
  const [filterSingle, setFilterSingle] = useState('')
  const [filterDateMode, setFilterDateMode] = useState<'range' | 'single'>('range')
  const [filterPayStatus, setFilterPayStatus] = useState<PaymentStatus | 'ALL'>('ALL')
  const [filterBillStatus, setFilterBillStatus] = useState<BillStatus | 'ALL'>('ALL')

  // Status dialog state
  const [statusBill, setStatusBill] = useState<Bill | null>(null)
  const [pendingStatus, setPendingStatus] = useState<BillStatus>('PENDING')

  // Payment dialog state
  const [paymentBill, setPaymentBill] = useState<Bill | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMode, setPayMode] = useState<PaymentMode>('CASH')
  const [payRemarks, setPayRemarks] = useState('')
  const [payLoading, setPayLoading] = useState(false)

  const applyPreset = (preset: DatePreset) => {
    setDatePreset(preset)
    if (preset !== 'custom') {
      const range = getPresetRange(preset)
      setFilterFrom(range.from)
      setFilterTo(range.to)
      setFilterSingle('')
      setFilterDateMode('range')
    }
  }

  const resetFilters = () => {
    applyPreset('last7')
    setFilterPayStatus('ALL')
    setFilterBillStatus('ALL')
    setSearch('')
  }

  const activeFilterCount = useMemo(() => {
    let count = 0
    if (datePreset !== 'last7') count++
    if (filterPayStatus !== 'ALL') count++
    if (filterBillStatus !== 'ALL') count++
    return count
  }, [datePreset, filterPayStatus, filterBillStatus])

  const { data: bills = [], isLoading } = useQuery({
    queryKey: ['bills'],
    queryFn: billRepository.getAll,
  })
  const { isLoading: shopProfileLoading } = useQuery({
    queryKey: ['shopProfile'],
    queryFn: () => settingsRepository.getShopProfile(),
    staleTime: 5 * 60 * 1000,
  })
  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: customerRepository.getAll,
  })
  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: productRepository.getAll,
  })

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<BillFormData>({
    defaultValues: {
      customerType: 'existing',
      items: [{ productId: '', productName: '', quantity: 1, unitRate: 0, itemDiscount: 0, gstPercentage: 0, total: 0 }],
      discount: 0,
      amountPaid: 0,
      status: 'PENDING',
      isGstBill: false,
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })

  const watchItems = watch('items')
  const watchDiscount = watch('discount') ?? 0
  const watchAmountPaid = watch('amountPaid') ?? 0
  const watchCustomerType = watch('customerType')
  const watchCustomerId = watch('customerId')
  const watchIsGstBill = watch('isGstBill')

  const { data: shopProfile } = useQuery({
    queryKey: ['shopProfile'],
    queryFn: () => settingsRepository.getShopProfile(),
    staleTime: 5 * 60 * 1000,
  })
  const compositionGstRate = shopProfile?.compositionGstRate ?? 1

  const subtotal = watchItems.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0
    const rate = Number(item.unitRate) || 0
    const disc = Number(item.itemDiscount) || 0
    return sum + (qty * rate - disc)
  }, 0)

  const gstAmount = watchIsGstBill ? subtotal * (compositionGstRate / 100) : 0

  const billDiscount = Number(watchDiscount) || 0
  const grandTotal = subtotal + gstAmount - billDiscount
  const remainingAmount = grandTotal - (Number(watchAmountPaid) || 0)

  const handleProductSelect = async (index: number, productId: string) => {
    const product = products.find((p) => p.productId === productId)
    if (!product) return
    let price = product.basePrice
    const customerId = watchCustomerId
    if (customerId) {
      price = await pricingRepository.getPrice(customerId, productId, product.basePrice)
    }
    setValue(`items.${index}.productName`, product.productName)
    setValue(`items.${index}.unitRate`, price)
    const qty = Number(watchItems[index]?.quantity) || 1
    const disc = Number(watchItems[index]?.itemDiscount) || 0
    setValue(`items.${index}.total`, qty * price - disc)
  }

  const handleCustomerSelect = (customerId: string) => {
    const customer = customers.find((c) => c.customerId === customerId)
    if (!customer) return
    setValue('customerId', customerId)
    setValue('customerName', customer.name)
    setValue('customerPhone', customer.phone)
    setValue('customerGst', customer.gstNumber ?? '')
    setCustomerSearch(customer.name)
    clearErrors(['customerName', 'customerPhone'])
  }

  const openCreate = () => {
    setFormMode('create')
    setEditingBill(null)
    setCustomerSearch('')
    reset({
      customerType: 'existing',
      items: [{ productId: '', productName: '', quantity: 1, unitRate: 0, itemDiscount: 0, gstPercentage: 0, total: 0 }],
      discount: 0,
      amountPaid: 0,
      status: 'PENDING',
      isGstBill: false,
      comment: '',
    })
    setFormOpen(true)
  }

  const openEdit = useCallback(
    (bill: Bill) => {
      setFormMode('edit')
      setEditingBill(bill)
      setCustomerSearch(bill.customerInfo.name)
      reset({
        customerType: bill.customerId ? 'existing' : 'new',
        customerId: bill.customerId ?? '',
        customerName: bill.customerInfo.name,
        customerPhone: bill.customerInfo.phone,
        customerGst: bill.customerInfo.gstNumber ?? '',
        items: bill.items.map((i) => ({ ...i })),
        discount: bill.discount,
        amountPaid: bill.amountPaid,
        status: bill.status,
        isGstBill: bill.isGstBill ?? false,
        comment: bill.comment ?? '',
      })
      setFormOpen(true)
    },
    [reset]
  )

  const closeForm = () => {
    setFormOpen(false)
    setEditingBill(null)
  }

  const onSubmitBill = async (data: BillFormData) => {
    const customerName = data.customerName?.trim()
    const customerPhone = data.customerPhone?.trim() ?? ''
    const phoneDigits = customerPhone.replace(/\D/g, '')

    if (!customerName) {
      setError('customerName', {
        type: 'manual',
        message: data.customerType === 'existing'
          ? 'Please select a customer'
          : 'Customer name is required',
      })
      toast.error('Customer name is required')
      return
    }

    if (phoneDigits.length < 10) {
      setError('customerPhone', {
        type: 'manual',
        message: data.customerType === 'existing'
          ? 'Selected customer must have a valid phone number'
          : 'Phone number is required (min 10 digits)',
      })
      toast.error('Phone number is required')
      return
    }

    const payload: BillFormData = { ...data, customerName, customerPhone }

    if (formMode === 'edit') {
      await updateMutation.mutateAsync(payload)
    } else {
      await createMutation.mutateAsync(payload)
    }
  }

  const openStatusDialog = (bill: Bill) => {
    setStatusBill(bill)
    setPendingStatus(bill.status)
  }

  const openPaymentDialog = (bill: Bill) => {
    setPaymentBill(bill)
    setPayAmount('')
    setPayMode('CASH')
    setPayRemarks('')
  }

  const createMutation = useMutation({
    mutationFn: async (data: BillFormData) => {
      const billNumber = await billRepository.generateBillNumber()
      const grand = grandTotal
      const amtPaid = Number(data.amountPaid) || 0
      const remaining = grand - amtPaid
      const paymentStatus = remaining <= 0 ? 'PAID' : amtPaid > 0 ? 'PARTIAL' : 'UNPAID'
      return billRepository.create({
        billNumber,
        customerId: data.customerId,
        customerInfo: {
          customerId: data.customerId,
          name: data.customerName,
          phone: data.customerPhone,
          gstNumber: data.customerGst,
        },
        items: data.items.map((item) => ({
          ...item,
          quantity: Number(item.quantity),
          unitRate: Number(item.unitRate),
          itemDiscount: Number(item.itemDiscount),
          gstPercentage: 0,
          total: Number(item.quantity) * Number(item.unitRate) - Number(item.itemDiscount),
        })),
        subtotal,
        discount: Number(data.discount) || 0,
        gstAmount,
        grandTotal: grand,
        isGstBill: data.isGstBill,
        status: data.status,
        amountPaid: amtPaid,
        remainingAmount: Math.max(0, remaining),
        paymentStatus,
        ...(data.comment?.trim() ? { comment: data.comment.trim() } : {}),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] })
      toast.success('Bill created successfully!')
      closeForm()
    },
    onError: () => toast.error('Failed to create bill'),
  })

  const updateMutation = useMutation({
    mutationFn: async (data: BillFormData) => {
      if (!editingBill) return
      const grand = grandTotal
      const amtPaid = Number(data.amountPaid) || 0
      const remaining = Math.max(0, grand - amtPaid)
      const paymentStatus = remaining <= 0 ? 'PAID' : amtPaid > 0 ? 'PARTIAL' : 'UNPAID'
      return billRepository.update(editingBill.billId, {
        customerInfo: {
          customerId: data.customerId,
          name: data.customerName,
          phone: data.customerPhone,
          gstNumber: data.customerGst,
        },
        items: data.items.map((item) => ({
          ...item,
          quantity: Number(item.quantity),
          unitRate: Number(item.unitRate),
          itemDiscount: Number(item.itemDiscount),
          gstPercentage: 0,
          total: Number(item.quantity) * Number(item.unitRate) - Number(item.itemDiscount),
        })),
        subtotal,
        discount: Number(data.discount) || 0,
        gstAmount,
        grandTotal: grand,
        isGstBill: data.isGstBill,
        status: data.status,
        amountPaid: amtPaid,
        remainingAmount: remaining,
        paymentStatus,
        comment: data.comment?.trim() ?? '',
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] })
      toast.success('Bill updated successfully!')
      closeForm()
    },
    onError: () => toast.error('Failed to update bill'),
  })

  const moveToLedgerMutation = useMutation({
    mutationFn: (bill: Bill) =>
      billRepository.update(bill.billId, { movedToLedger: true, status: 'DONE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] })
      toast.success('Bill moved to ledger and marked as done')
    },
    onError: () => toast.error('Failed to move bill to ledger'),
  })

  const statusMutation = useMutation({
    mutationFn: (status: BillStatus) =>
      billRepository.update(statusBill!.billId, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] })
      toast.success('Status updated')
      setStatusBill(null)
    },
    onError: () => toast.error('Failed to update status'),
  })

  const handlePaymentSubmit = async () => {
    if (!paymentBill) return
    const amount = Number(payAmount)
    if (!amount || amount <= 0) {
      toast.error('Enter a valid payment amount')
      return
    }
    if (amount > paymentBill.remainingAmount + 0.01) {
      toast.error(`Amount cannot exceed due: ${formatCurrency(paymentBill.remainingAmount)}`)
      return
    }
    setPayLoading(true)
    try {
      const newAmountPaid = paymentBill.amountPaid + amount
      const newRemaining = Math.max(0, paymentBill.grandTotal - newAmountPaid)
      const newPaymentStatus = newRemaining <= 0 ? 'PAID' : 'PARTIAL'
      const newStatus: BillStatus = newRemaining <= 0 ? 'DONE' : paymentBill.status

      await billRepository.update(paymentBill.billId, {
        amountPaid: newAmountPaid,
        remainingAmount: newRemaining,
        paymentStatus: newPaymentStatus,
        status: newStatus,
      })

      if (paymentBill.customerId) {
        await transactionRepository.create({
          billId: paymentBill.billId,
          customerId: paymentBill.customerId,
          amount,
          paymentMode: payMode,
          remarks: payRemarks || undefined,
        })
      }

      queryClient.invalidateQueries({ queryKey: ['bills'] })
      toast.success(`Payment of ${formatCurrency(amount)} recorded`)
      setPaymentBill(null)
    } catch {
      toast.error('Failed to record payment')
    } finally {
      setPayLoading(false)
    }
  }

  const filteredBills = useMemo(() => {
    return bills.filter((b) => {
      // Text search
      const q = search.toLowerCase()
      const billNo = b.billNumber?.toLowerCase() ?? ''
      const customerName = b.customerInfo?.name?.toLowerCase() ?? ''
      if (q && !billNo.includes(q) && !customerName.includes(q))
        return false

      // Payment status
      if (filterPayStatus !== 'ALL' && b.paymentStatus !== filterPayStatus) return false

      // Bill status
      if (filterBillStatus !== 'ALL' && b.status !== filterBillStatus) return false

      // Date filter
      const billDate = b.createdAt?.toDate ? startOfDay(b.createdAt.toDate()) : null
      if (billDate) {
        if (filterDateMode === 'single' && filterSingle) {
          const singleDay = parseISO(filterSingle)
          if (isValid(singleDay) && billDate.getTime() !== startOfDay(singleDay).getTime())
            return false
        } else {
          if (filterFrom) {
            const from = parseISO(filterFrom)
            if (isValid(from) && billDate < startOfDay(from)) return false
          }
          if (filterTo) {
            const to = parseISO(filterTo)
            if (isValid(to) && billDate > startOfDay(to)) return false
          }
        }
      }

      return true
    })
  }, [bills, search, filterPayStatus, filterBillStatus, filterDateMode, filterSingle, filterFrom, filterTo])

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
      c.phone.includes(customerSearch)
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Billing</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Create and manage invoices</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          New Bill
        </Button>
      </div>

      {/* Search + Filter bar */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by bill no. or customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-2"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-4 w-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-blue-600 text-white text-xs font-bold">
                {activeFilterCount}
              </span>
            )}
          </Button>

          {(activeFilterCount > 0 || search) && (
            <Button variant="ghost" size="sm" className="h-9 text-gray-500" onClick={resetFilters}>
              <X className="h-3.5 w-3.5 mr-1" />
              Reset
            </Button>
          )}
        </div>

        {/* Filter panel */}
        {showFilters && (
          <Card>
            <CardContent className="p-4 space-y-4">
              {/* Date section */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Date
                  </p>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setFilterDateMode('range')}
                      className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                        filterDateMode === 'range'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'border-gray-300 dark:border-gray-600 text-gray-500 hover:border-gray-400'
                      }`}
                    >
                      Range
                    </button>
                    <button
                      type="button"
                      onClick={() => { setFilterDateMode('single'); setDatePreset('custom') }}
                      className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                        filterDateMode === 'single'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'border-gray-300 dark:border-gray-600 text-gray-500 hover:border-gray-400'
                      }`}
                    >
                      Single day
                    </button>
                  </div>
                </div>

                {filterDateMode === 'range' && (
                  <>
                    {/* Presets */}
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          { value: 'today', label: 'Today' },
                          { value: 'yesterday', label: 'Yesterday' },
                          { value: 'last7', label: 'Last 7 days' },
                          { value: 'last30', label: 'Last 30 days' },
                          { value: 'thisMonth', label: 'This month' },
                          { value: 'custom', label: 'Custom' },
                        ] as { value: DatePreset; label: string }[]
                      ).map((p) => (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => applyPreset(p.value)}
                          className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                            datePreset === p.value
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-400 hover:text-blue-600'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    {/* Date inputs */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="space-y-1">
                        <Label className="text-xs text-gray-500">From</Label>
                        <Input
                          type="date"
                          value={filterFrom}
                          onChange={(e) => { setFilterFrom(e.target.value); setDatePreset('custom') }}
                          className="h-8 w-36 text-xs"
                        />
                      </div>
                      <span className="text-gray-400 mt-5">—</span>
                      <div className="space-y-1">
                        <Label className="text-xs text-gray-500">To</Label>
                        <Input
                          type="date"
                          value={filterTo}
                          onChange={(e) => { setFilterTo(e.target.value); setDatePreset('custom') }}
                          className="h-8 w-36 text-xs"
                        />
                      </div>
                    </div>
                  </>
                )}

                {filterDateMode === 'single' && (
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-500">Select date</Label>
                    <Input
                      type="date"
                      value={filterSingle}
                      onChange={(e) => setFilterSingle(e.target.value)}
                      className="h-8 w-36 text-xs"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Payment status */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Payment Status
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        { value: 'ALL', label: 'All' },
                        { value: 'UNPAID', label: 'Unpaid' },
                        { value: 'PARTIAL', label: 'Partial' },
                        { value: 'PAID', label: 'Paid' },
                      ] as { value: PaymentStatus | 'ALL'; label: string }[]
                    ).map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setFilterPayStatus(opt.value)}
                        className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                          filterPayStatus === opt.value
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-400 hover:text-blue-600'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Bill status */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Bill Status
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        { value: 'ALL', label: 'All' },
                        ...ALL_STATUSES,
                      ] as { value: BillStatus | 'ALL'; label: string }[]
                    ).map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setFilterBillStatus(opt.value)}
                        className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                          filterBillStatus === opt.value
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-400 hover:text-blue-600'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Active filter summary bar */}
        {(filterDateMode === 'single' ? filterSingle : (filterFrom || filterTo)) && (
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Showing{' '}
            <strong className="text-gray-600 dark:text-gray-300">
              {filteredBills.length}
            </strong>{' '}
            bill{filteredBills.length !== 1 ? 's' : ''}
            {filterDateMode === 'single' && filterSingle
              ? ` on ${filterSingle}`
              : filterFrom && filterTo
              ? ` from ${filterFrom} to ${filterTo}`
              : ''}
            {filterPayStatus !== 'ALL' ? ` · ${filterPayStatus} payments` : ''}
            {filterBillStatus !== 'ALL' ? ` · ${filterBillStatus.replace(/_/g, ' ')}` : ''}
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : filteredBills.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Receipt className="h-10 w-10 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">No bills found</p>
            <Button variant="link" onClick={openCreate} className="mt-2">
              Create your first bill
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filteredBills.map((bill) => (
            <BillCard
              key={bill.billId}
              bill={bill}
              onView={setViewBill}
              onEdit={openEdit}
              onStatus={openStatusDialog}
              onPayment={openPaymentDialog}
              onMoveToLedger={(b) => moveToLedgerMutation.mutate(b)}
            />
          ))}
        </div>
      )}

      {/* ── Create / Edit Bill Dialog ── */}
      <Dialog open={formOpen} onOpenChange={(open) => { if (!open) closeForm() }}>
        <DialogContent
          className="max-w-4xl max-h-[95vh] overflow-y-auto"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>
              {formMode === 'edit'
                ? `Edit Bill — ${editingBill?.billNumber}`
                : 'Create New Bill'}
            </DialogTitle>
          </DialogHeader>

          <form
            onSubmit={handleSubmit(onSubmitBill)}
            className="space-y-6"
          >
            {/* Customer */}
            {formMode === 'create' ? (
              <Tabs
                value={watchCustomerType}
                onValueChange={(v) => {
                  setValue('customerType', v as 'existing' | 'new')
                  setValue('customerId', '')
                  setValue('customerName', '')
                  setValue('customerPhone', '')
                  setValue('customerGst', '')
                  setCustomerSearch('')
                  clearErrors(['customerName', 'customerPhone'])
                }}
              >
                <TabsList>
                  <TabsTrigger value="existing">Existing Customer</TabsTrigger>
                  <TabsTrigger value="new">New Customer</TabsTrigger>
                </TabsList>

                <TabsContent value="existing" className="mt-4 space-y-3">
                  <div className="space-y-1.5">
                    <Label>Search & Select Customer *</Label>
                    <Input
                      placeholder="Search by name or phone..."
                      value={customerSearch}
                      onChange={(e) => {
                        setCustomerSearch(e.target.value)
                        clearErrors(['customerName', 'customerPhone'])
                      }}
                    />
                    {errors.customerName && watchCustomerType === 'existing' && (
                      <p className="text-xs text-red-500">{errors.customerName.message}</p>
                    )}
                    {errors.customerPhone && watchCustomerType === 'existing' && (
                      <p className="text-xs text-red-500">{errors.customerPhone.message}</p>
                    )}
                  </div>
                  {customerSearch && filteredCustomers.length > 0 && !watchCustomerId && (
                    <div className="border rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                      {filteredCustomers.slice(0, 8).map((c) => (
                        <button
                          key={c.customerId}
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-[#252d3d] flex items-center justify-between text-sm border-b last:border-0"
                          onClick={() => handleCustomerSelect(c.customerId)}
                        >
                          <span className="font-medium">{c.name}</span>
                          <span className="text-gray-400">{c.phone}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {watchCustomerId && (
                    <div className="rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-green-800 dark:text-green-200">{watch('customerName')}</p>
                          <p className="text-sm text-green-600 dark:text-green-400">{watch('customerPhone')}</p>
                          {watch('customerGst') && (
                            <p className="text-xs text-green-500">GST: {watch('customerGst')}</p>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setValue('customerId', '')
                            setValue('customerName', '')
                            setValue('customerPhone', '')
                            setCustomerSearch('')
                            clearErrors(['customerName', 'customerPhone'])
                          }}
                          className="text-green-700 hover:text-green-900"
                        >
                          Change
                        </Button>
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="new" className="mt-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2 space-y-1.5">
                      <Label>Customer Name *</Label>
                      <Input
                        {...register('customerName', {
                          required: 'Customer name is required',
                          validate: (value) => !!value?.trim() || 'Customer name is required',
                          onChange: () => clearErrors('customerName'),
                        })}
                        placeholder="Customer name"
                      />
                      {errors.customerName && <p className="text-xs text-red-500">{errors.customerName.message}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label>Phone *</Label>
                      <Input
                        {...register('customerPhone', {
                          required: 'Phone number is required',
                          validate: (value) =>
                            value.replace(/\D/g, '').length >= 10 || 'Enter a valid phone number (min 10 digits)',
                          onChange: () => clearErrors('customerPhone'),
                        })}
                        placeholder="9876543210"
                      />
                      {errors.customerPhone && <p className="text-xs text-red-500">{errors.customerPhone.message}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label>GST Number</Label>
                      <Input {...register('customerGst')} placeholder="Optional" />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            ) : (
              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 p-3">
                <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1 uppercase tracking-wide">Customer</p>
                <p className="font-semibold text-gray-900 dark:text-white">{watch('customerName')}</p>
                <p className="text-sm text-gray-500">{watch('customerPhone')}</p>
                {watch('customerGst') && (
                  <p className="text-xs text-gray-400 mt-0.5">GST: {watch('customerGst')}</p>
                )}
              </div>
            )}

            {/* Items */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Bill Items</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    append({ productId: '', productName: '', quantity: 1, unitRate: 0, itemDiscount: 0, gstPercentage: 0, total: 0 })
                  }
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Item
                </Button>
              </div>

              {/* Mobile: card per item */}
              <div className="sm:hidden space-y-3">
                {fields.map((field, index) => {
                  const qty = Number(watchItems[index]?.quantity) || 0
                  const rate = Number(watchItems[index]?.unitRate) || 0
                  const disc = Number(watchItems[index]?.itemDiscount) || 0
                  const lineTotal = qty * rate - disc
                  return (
                    <div key={field.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Item {index + 1}</span>
                        {fields.length > 1 && (
                          <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-red-400 hover:text-red-600" onClick={() => remove(index)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                      <Controller
                        control={control}
                        name={`items.${index}.productId`}
                        render={({ field: f }) => (
                          <select
                            {...f}
                            onChange={(e) => { f.onChange(e); void handleProductSelect(index, e.target.value) }}
                            className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                          >
                            <option value="">Select product...</option>
                            {products.map((p) => (
                              <option key={p.productId} value={p.productId}>{p.productName}</option>
                            ))}
                          </select>
                        )}
                      />
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs text-gray-500">Qty</Label>
                          <Controller control={control} name={`items.${index}.quantity`} render={({ field }) => (
                            <NumericInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} className="h-8 text-center text-xs" />
                          )} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-gray-500">Rate (₹)</Label>
                          <Controller control={control} name={`items.${index}.unitRate`} render={({ field }) => (
                            <NumericInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} className="h-8 text-center text-xs" />
                          )} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-gray-500">Disc (₹)</Label>
                          <Controller control={control} name={`items.${index}.itemDiscount`} render={({ field }) => (
                            <NumericInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} className="h-8 text-center text-xs" />
                          )} />
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <div className="text-right">
                          <p className="text-xs text-gray-500 mb-1">Total</p>
                          <p className="font-bold text-sm text-blue-600">{formatCurrency(lineTotal)}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Desktop: table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-800">
                      <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500">Product</th>
                      <th className="text-center py-2 px-2 text-xs font-semibold text-gray-500">Qty</th>
                      <th className="text-center py-2 px-2 text-xs font-semibold text-gray-500">Rate (₹)</th>
                      <th className="text-center py-2 px-2 text-xs font-semibold text-gray-500">Disc (₹)</th>
                      <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500">Total</th>
                      <th className="py-2 px-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((field, index) => {
                      const qty = Number(watchItems[index]?.quantity) || 0
                      const rate = Number(watchItems[index]?.unitRate) || 0
                      const disc = Number(watchItems[index]?.itemDiscount) || 0
                      const lineTotal = qty * rate - disc
                      return (
                        <tr key={field.id} className="border-b border-gray-100 dark:border-gray-800">
                          <td className="py-2 px-2">
                            <Controller
                              control={control}
                              name={`items.${index}.productId`}
                              render={({ field: f }) => (
                                <select
                                  {...f}
                                  onChange={(e) => { f.onChange(e); void handleProductSelect(index, e.target.value) }}
                                  className="w-36 h-8 rounded-md border border-input bg-transparent px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                                >
                                  <option value="">Select...</option>
                                  {products.map((p) => (
                                    <option key={p.productId} value={p.productId}>{p.productName}</option>
                                  ))}
                                </select>
                              )}
                            />
                          </td>
                          <td className="py-2 px-2">
                            <Controller control={control} name={`items.${index}.quantity`} render={({ field }) => (
                              <NumericInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} className="w-16 h-8 text-center text-xs" />
                            )} />
                          </td>
                          <td className="py-2 px-2">
                            <Controller control={control} name={`items.${index}.unitRate`} render={({ field }) => (
                              <NumericInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} className="w-20 h-8 text-center text-xs" />
                            )} />
                          </td>
                          <td className="py-2 px-2">
                            <Controller control={control} name={`items.${index}.itemDiscount`} render={({ field }) => (
                              <NumericInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} className="w-16 h-8 text-center text-xs" />
                            )} />
                          </td>
                          <td className="py-2 px-2 text-right font-medium text-xs whitespace-nowrap">
                            {formatCurrency(lineTotal)}
                          </td>
                          <td className="py-2 px-2">
                            {fields.length > 1 && (
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600" onClick={() => remove(index)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bill-level discount — always visible */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-gray-200 dark:border-gray-800 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Bill Discount</p>
                <p className="text-xs text-gray-500">Discount applied on the whole bill (in addition to item discounts)</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">₹</span>
                <Controller
                  control={control}
                  name="discount"
                  render={({ field }) => (
                    <NumericInput
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      className="w-32 h-9 text-right"
                      placeholder="0.00"
                    />
                  )}
                />
              </div>
            </div>

            {/* Summary */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <button
                type="button"
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-[#252d3d]/60 text-sm font-semibold"
                onClick={() => setExpandSummary(!expandSummary)}
              >
                Bill Summary
                {expandSummary ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {expandSummary && (
                <div className="p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input type="checkbox" {...register('isGstBill')} className="h-4 w-4 rounded border-gray-300 accent-blue-600" />
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                            GST Bill ({compositionGstRate}%)
                          </span>
                        </label>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Subtotal</span>
                        <span className="font-medium">{formatCurrency(subtotal)}</span>
                      </div>
                      {billDiscount > 0 && (
                        <div className="flex justify-between text-red-600">
                          <span>Bill Discount</span>
                          <span className="font-medium">- {formatCurrency(billDiscount)}</span>
                        </div>
                      )}
                      {watchIsGstBill && (
                        <div className="flex justify-between text-blue-600">
                          <span>GST ({compositionGstRate}%)</span>
                          <span className="font-medium">{formatCurrency(gstAmount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-bold text-base border-t pt-2">
                        <span>Grand Total</span>
                        <span className="text-blue-600">{formatCurrency(grandTotal)}</span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">
                          {formMode === 'edit' ? 'Amount Paid (₹)' : 'Amount Paid Now (₹)'}
                        </Label>
                        <Controller control={control} name="amountPaid" render={({ field }) => (
                          <NumericInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} placeholder="0.00" className="h-8" />
                        )} />
                        {formMode === 'edit' && (
                          <p className="text-xs text-gray-400">
                            To add a new payment, save and use the <strong>Pay</strong> button on the bill.
                          </p>
                        )}
                      </div>
                      <div className="flex justify-between text-sm font-semibold">
                        <span className="text-gray-500">Remaining</span>
                        <span className={remainingAmount > 0 ? 'text-red-500' : 'text-green-600'}>
                          {formatCurrency(Math.max(0, remainingAmount))}
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Bill Status</Label>
                        <select
                          {...register('status')}
                          className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                          {ALL_STATUSES.map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Comment */}
            <div className="space-y-1.5">
              <Label className="text-xs">Comment / Notes</Label>
              <textarea
                {...register('comment')}
                rows={2}
                placeholder="Optional note about this bill…"
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeForm}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || createMutation.isPending || updateMutation.isPending}
              >
                {(isSubmitting || createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {formMode === 'edit' ? 'Save Changes' : 'Create Bill'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Change Status Dialog ── */}
      <Dialog open={!!statusBill} onOpenChange={(open) => { if (!open) setStatusBill(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Change Bill Status</DialogTitle>
          </DialogHeader>
          {statusBill && (
            <div className="space-y-4">
              <div className="rounded-lg bg-gray-50 dark:bg-[#252d3d] border border-gray-200 dark:border-[#2a3040] p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500">Bill</span>
                  <span className="font-mono font-semibold text-blue-600">{statusBill.billNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Customer</span>
                  <span className="font-medium">{statusBill.customerInfo.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Current</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${BILL_STATUS_STYLES[statusBill.status]}`}>
                    {statusBill.status.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>New Status</Label>
                <select
                  value={pendingStatus}
                  onChange={(e) => setPendingStatus(e.target.value as BillStatus)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {ALL_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusBill(null)}>Cancel</Button>
            <Button
              onClick={() => statusMutation.mutate(pendingStatus)}
              disabled={statusMutation.isPending || pendingStatus === statusBill?.status}
            >
              {statusMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Update Status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Record Payment Dialog ── */}
      <Dialog open={!!paymentBill} onOpenChange={(open) => { if (!open) setPaymentBill(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          {paymentBill && (
            <div className="space-y-4">
              <div className="rounded-lg bg-gray-50 dark:bg-[#252d3d] border border-gray-200 dark:border-[#2a3040] p-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Bill</span>
                  <span className="font-mono font-semibold text-blue-600">{paymentBill.billNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Grand Total</span>
                  <span className="font-semibold">{formatCurrency(paymentBill.grandTotal)}</span>
                </div>
                {paymentBill.amountPaid > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Paid so far</span>
                    <span className="text-green-600 font-semibold">{formatCurrency(paymentBill.amountPaid)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-1.5">
                  <span className="font-semibold text-gray-700 dark:text-gray-200">Due Amount</span>
                  <span className="text-red-500 font-bold">{formatCurrency(paymentBill.remainingAmount)}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Payment Amount (₹) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder={`Max ${formatCurrency(paymentBill.remainingAmount)}`}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="h-9"
                  autoFocus
                />
                <button
                  type="button"
                  className="text-xs text-blue-600 hover:underline"
                  onClick={() => setPayAmount(String(paymentBill.remainingAmount))}
                >
                  Pay full due amount
                </button>
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
                <Label>Remarks (optional)</Label>
                <Input
                  placeholder="e.g. UPI ref: 12345"
                  value={payRemarks}
                  onChange={(e) => setPayRemarks(e.target.value)}
                />
              </div>

              {payAmount && Number(payAmount) >= paymentBill.remainingAmount - 0.01 && (
                <div className="rounded-md bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-800 p-2.5">
                  <p className="text-xs text-green-700 dark:text-green-300">
                    This will mark the bill as <strong>Fully Paid</strong> and set status to <strong>Done</strong>.
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentBill(null)} disabled={payLoading}>
              Cancel
            </Button>
            <Button onClick={handlePaymentSubmit} disabled={payLoading || !payAmount}>
              {payLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Invoice View Dialog ── */}
      {viewBill && (
        <Dialog open={!!viewBill} onOpenChange={() => setViewBill(null)}>
          <DialogContent className="max-w-2xl max-h-[95vh] overflow-y-auto print:shadow-none">
            <DialogHeader className="print:hidden">
              <DialogTitle>Invoice — {viewBill.billNumber}</DialogTitle>
            </DialogHeader>
            <InvoiceView bill={viewBill} />
            <DialogFooter className="print:hidden">
              <Button
                variant="outline"
                disabled={sharingPdf || shopProfileLoading}
                title={shopProfileLoading ? 'Loading invoice…' : undefined}
                onClick={async () => {
                  setSharingPdf(true)
                  try {
                    const blob = await createBillPdfBlob(viewBill, shopProfile)
                    await sharePdfBlob({
                      blob,
                      filename: `invoice-${viewBill.billNumber}.pdf`,
                      title: `Invoice ${viewBill.billNumber}`,
                      onFallback: (msg) => toast.info(msg),
                    })
                  } catch (err) {
                    if (err instanceof Error && err.name !== 'AbortError') {
                      toast.error('Failed to share invoice')
                    }
                  } finally {
                    setSharingPdf(false)
                  }
                }}
              >
                {sharingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                Share
              </Button>
              <Button
                disabled={sharingPdf || shopProfileLoading}
                title={shopProfileLoading ? 'Loading invoice…' : undefined}
                onClick={async () => {
                  setSharingPdf(true)
                  try {
                    const blob = await createBillPdfBlob(viewBill, shopProfile)
                    await downloadPdfBlob({
                      blob,
                      filename: `invoice-${viewBill.billNumber}.pdf`,
                      onFallback: (msg) => toast.info(msg),
                    })
                  } catch {
                    toast.error('Failed to download invoice')
                  } finally {
                    setSharingPdf(false)
                  }
                }}
              >
                <Download className="h-4 w-4" />
                Download PDF
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
