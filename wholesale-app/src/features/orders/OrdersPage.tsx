import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import {
  Plus,
  Trash2,
  Loader2,
  ShoppingCart,
  Search,
  ArrowRight,
  Clock,
  CheckCircle2,
  XCircle,
  Truck,
  Package,
  Filter,
  X,
  Receipt,
  Share2,
  MessageCircle,
  Edit2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import { orderRepository } from '@/firebase/repositories/orderRepository'
import { customerRepository } from '@/firebase/repositories/customerRepository'
import { productRepository } from '@/firebase/repositories/productRepository'
import { pricingRepository } from '@/firebase/repositories/pricingRepository'
import { billRepository } from '@/firebase/repositories/billRepository'
import { transactionRepository } from '@/firebase/repositories/transactionRepository'
import { settingsRepository } from '@/firebase/repositories/settingsRepository'
import { todayIst, toIstDateString, addIstDays, istMonthRange } from '@/lib/istDate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NumericInput } from '@/components/ui/numeric-input'
import { ProductSelect } from '@/components/ui/product-select'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency, formatDate } from '@/lib/utils'
import { sharePdfBlob, shareElementAsImage } from '@/lib/sharePdf'
import { createOrderPdfBlob } from '@/lib/orderPdf'
import OrderView from './OrderView'
import type { Order, OrderStatus, PaymentMode, PaymentStatus, TimeSlot } from '@/types'

// ─── Time slot config ────────────────────────────────────────────────────────

const TIME_SLOTS: { value: TimeSlot; label: string }[] = [
  { value: 'MORNING', label: 'Morning' },
  { value: 'AFTERNOON', label: 'Afternoon' },
  { value: 'EVENING', label: 'Evening' },
]

const TIME_SLOT_STYLE: Record<TimeSlot, string> = {
  MORNING: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  AFTERNOON: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  EVENING: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
}

function todayStr() {
  return todayIst()
}

// ─── Constants ──────────────────────────────────────────────────────────────

const ORDER_STATUS_CONFIG: Record<
  OrderStatus,
  { label: string; icon: React.ElementType; color: string; bg: string }
> = {
  NEW: { label: 'New', icon: Clock, color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-900' },
  ACCEPTED: { label: 'Accepted', icon: CheckCircle2, color: 'text-indigo-600', bg: 'bg-indigo-100 dark:bg-indigo-900' },
  PROCESSING: { label: 'Processing', icon: Package, color: 'text-yellow-600', bg: 'bg-yellow-100 dark:bg-yellow-900' },
  DELIVERED: { label: 'Delivered', icon: Truck, color: 'text-green-600', bg: 'bg-green-100 dark:bg-green-900' },
  REJECTED: { label: 'Rejected', icon: XCircle, color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900' },
}

const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  NEW: ['ACCEPTED', 'REJECTED', 'DELIVERED'],
  ACCEPTED: ['DELIVERED', 'REJECTED'],
  PROCESSING: ['DELIVERED', 'REJECTED'],
  DELIVERED: [],
  REJECTED: [],
}

/** Statuses shown in the filter bar (not New / Processing). */
const FILTER_ORDER_STATUSES: { value: OrderStatus; label: string }[] = [
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'REJECTED', label: 'Rejected' },
]

const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'OTHER', label: 'Other' },
]

// ─── Date helpers ────────────────────────────────────────────────────────────

type DatePreset = 'today' | 'last7next7' | 'thisMonth' | 'nextWeek' | 'custom'

function istWeekdayMon1(date = new Date()): number {
  const w = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
  }).format(date)
  const map: Record<string, number> = {
    Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
  }
  return map[w] ?? 1
}

function getPresetRange(preset: DatePreset): { from: string; to: string } {
  const today = todayIst()
  switch (preset) {
    case 'today':
      return { from: today, to: today }
    case 'last7next7':
      return { from: addIstDays(today, -6), to: addIstDays(today, 7) }
    case 'thisMonth':
      return istMonthRange(today)
    case 'nextWeek': {
      const dow = istWeekdayMon1()
      const daysUntilNextMon = ((8 - dow) % 7) || 7
      const from = addIstDays(today, daysUntilNextMon)
      return { from, to: addIstDays(from, 6) }
    }
    default:
      return { from: '', to: '' }
  }
}

// ─── Form types ──────────────────────────────────────────────────────────────

interface OrderFormData {
  customerType: 'existing' | 'new'
  customerId?: string
  customerName: string
  customerPhone: string
  customerGst?: string
  orderDate: string
  timeSlot: TimeSlot
  comment?: string
  advanceAmount: number
  advanceMode: PaymentMode
  advanceRemarks?: string
  items: {
    productId: string
    productName: string
    quantity: number
    unitRate: number
    total: number
  }[]
}

function formatOrderItemsSummary(items: Order['items']): string {
  const visible = items.slice(0, 3).map((item) => {
    const shortName = item.productName.trim().slice(0, 3).toLowerCase()
    return `${item.quantity} ${shortName || 'itm'}`
  })
  const hiddenCount = Math.max(0, items.length - visible.length)
  return hiddenCount > 0 ? `${visible.join(', ')} +${hiddenCount} more` : visible.join(', ')
}

function paymentStatusFromAmounts(total: number, amountPaid: number): PaymentStatus {
  if (amountPaid >= total - 0.01) return 'PAID'
  if (amountPaid > 0.01) return 'PARTIAL'
  return 'UNPAID'
}

function billStatusFromPayment(paymentStatus: PaymentStatus): 'PENDING' | 'PARTIAL_PAYMENT' | 'DONE' {
  if (paymentStatus === 'PAID') return 'DONE'
  if (paymentStatus === 'PARTIAL') return 'PARTIAL_PAYMENT'
  return 'PENDING'
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editOrder, setEditOrder] = useState<Order | null>(null)
  const [detailOrder, setDetailOrder] = useState<Order | null>(null)
  const [deleteOrder, setDeleteOrder] = useState<Order | null>(null)
  const [rejectConfirm, setRejectConfirm] = useState<{ order: Order; status: OrderStatus } | null>(null)
  const [deliverConvertPrompt, setDeliverConvertPrompt] = useState<Order | null>(null)
  const [sharingPdf, setSharingPdf] = useState(false)
  const [customerSearch, setCustomerSearch] = useState('')
  const [advanceOpen, setAdvanceOpen] = useState(false)

  // Filter state — default: last 7 days + next 7 days
  const [showFilters, setShowFilters] = useState(false)
  const [datePreset, setDatePreset] = useState<DatePreset>('last7next7')
  const [filterFrom, setFilterFrom] = useState(() => getPresetRange('last7next7').from)
  const [filterTo, setFilterTo] = useState(() => getPresetRange('last7next7').to)
  const [filterSingle, setFilterSingle] = useState('')
  const [filterDateMode, setFilterDateMode] = useState<'range' | 'single'>('range')
  const [filterStatus, setFilterStatus] = useState<OrderStatus | 'ALL'>('ACCEPTED')

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: orderRepository.getAll,
  })
  const { data: shopProfile, isLoading: shopProfileLoading } = useQuery({
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
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<OrderFormData>({
    defaultValues: {
      customerType: 'existing',
      orderDate: todayStr(),
      timeSlot: 'MORNING' as TimeSlot,
      comment: '',
      advanceAmount: 0,
      advanceMode: 'CASH',
      advanceRemarks: '',
      items: [{ productId: '', productName: '', quantity: 1, unitRate: 0, total: 0 }],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const watchItems = watch('items')
  const watchCustomerType = watch('customerType')
  const watchCustomerId = watch('customerId')
  const watchAdvanceAmount = watch('advanceAmount') ?? 0

  const estimatedAmount = watchItems.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0
    const rate = Number(item.unitRate) || 0
    return sum + qty * rate
  }, 0)

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
  }

  const handleCustomerSelect = async (customerId: string) => {
    const customer = customers.find((c) => c.customerId === customerId)
    if (!customer) return
    setValue('customerId', customerId)
    setValue('customerName', customer.name)
    setValue('customerPhone', customer.phone)
    setValue('customerGst', customer.gstNumber ?? '')
    setCustomerSearch(customer.name)
    clearErrors(['customerName', 'customerPhone', 'customerId'])

    const items = getValues('items') ?? []
    await Promise.all(
      items.map(async (item, index) => {
        if (!item.productId) return
        const product = products.find((p) => p.productId === item.productId)
        if (!product) return
        const price = await pricingRepository.getPrice(customerId, item.productId, product.basePrice)
        setValue(`items.${index}.unitRate`, price)
      })
    )
  }

  const onSubmitOrder = async (data: OrderFormData) => {
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

    const advanceAmount = Math.max(0, Number(data.advanceAmount) || 0)
    if (advanceAmount > estimatedAmount + 0.01) {
      toast.error('Advance payment cannot exceed the estimated total')
      return
    }

    const payload: OrderFormData = {
      ...data,
      customerName,
      customerPhone,
      advanceAmount,
      advanceRemarks: data.advanceRemarks?.trim() ?? '',
    }

    if (editOrder) {
      await updateMutation.mutateAsync({ orderId: editOrder.orderId, data: payload })
    } else {
      await createMutation.mutateAsync(payload)
    }
  }

  const closeCreate = () => {
    setCreateOpen(false)
    setEditOrder(null)
    setCustomerSearch('')
    setAdvanceOpen(false)
    reset({
      customerType: 'existing',
      orderDate: todayStr(),
      timeSlot: 'MORNING',
      comment: '',
      advanceAmount: 0,
      advanceMode: 'CASH',
      advanceRemarks: '',
      items: [{ productId: '', productName: '', quantity: 1, unitRate: 0, total: 0 }],
    })
  }

  const openEdit = (order: Order) => {
    setDetailOrder(null)
    setEditOrder(order)
    setAdvanceOpen((order.advanceAmount ?? 0) > 0 || !!order.advanceRemarks)
    const isRegistered = !!order.customerId
    reset({
      customerType: isRegistered ? 'existing' : 'new',
      customerId: order.customerId || '',
      customerName: order.customerInfo.name,
      customerPhone: order.customerInfo.phone,
      customerGst: order.customerInfo.gstNumber ?? '',
      orderDate: order.orderDate || todayStr(),
      timeSlot: order.timeSlot || 'MORNING',
      comment: order.comment ?? '',
      advanceAmount: order.advanceAmount ?? 0,
      advanceMode: order.advanceMode ?? 'CASH',
      advanceRemarks: order.advanceRemarks ?? '',
      items: order.items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitRate: item.unitRate,
        gstPercentage: item.gstPercentage,
        total: item.total,
      })),
    })
    setCustomerSearch(isRegistered ? order.customerInfo.name : '')
  }

  // ── Filter helpers ────────────────────────────────────────────────────────

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
    applyPreset('last7next7')
    setFilterStatus('ALL')
    setSearch('')
  }

  const activeFilterCount = useMemo(() => {
    let count = 0
    if (datePreset !== 'last7next7') count++
    if (filterStatus !== 'ALL') count++
    return count
  }, [datePreset, filterStatus])

  // ── Mutations ──────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async (data: OrderFormData) => {
      const orderNumber = await orderRepository.generateOrderNumber()
      const isExisting = data.customerType === 'existing'
      const customer = isExisting ? customers.find((c) => c.customerId === data.customerId) : null
      await orderRepository.create({
        orderNumber,
        customerId: data.customerId ?? '',
        customerInfo: {
          customerId: data.customerId,
          name: isExisting ? (customer?.name ?? data.customerName) : data.customerName,
          phone: isExisting ? (customer?.phone ?? data.customerPhone) : data.customerPhone,
          gstNumber: isExisting ? customer?.gstNumber : (data.customerGst ?? undefined),
        },
        items: data.items.map((item) => ({
          ...item,
          quantity: Number(item.quantity),
          unitRate: Number(item.unitRate),
          gstPercentage: 0,
          total: Number(item.quantity) * Number(item.unitRate),
        })),
        estimatedAmount,
        advanceAmount: Math.max(0, Number(data.advanceAmount) || 0),
        advanceMode: data.advanceMode,
        ...(data.advanceRemarks?.trim() ? { advanceRemarks: data.advanceRemarks.trim() } : {}),
        status: 'ACCEPTED',
        orderDate: data.orderDate || todayStr(),
        timeSlot: data.timeSlot || 'MORNING',
        ...(data.comment?.trim() ? { comment: data.comment.trim() } : {}),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      toast.success('Order created successfully!')
      closeCreate()
    },
    onError: () => toast.error('Failed to create order'),
  })

  const updateStatusMutation = useMutation({
    mutationFn: ({ order, status }: { order: Order; status: OrderStatus }) =>
      orderRepository.updateStatus(order.orderId, status),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      toast.success('Order status updated')
      if (vars.status === 'DELIVERED' && !vars.order.billId) {
        setDeliverConvertPrompt({ ...vars.order, status: 'DELIVERED' })
      }
    },
    onError: () => toast.error('Failed to update status'),
  })

  const requestStatusChange = (order: Order, status: OrderStatus) => {
    if (status === 'REJECTED') {
      setRejectConfirm({ order, status })
      return
    }
    updateStatusMutation.mutate({ order, status })
  }

  const updateMutation = useMutation({
    mutationFn: async ({ orderId, data }: { orderId: string; data: OrderFormData }) => {
      const isExisting = data.customerType === 'existing'
      const customer = isExisting ? customers.find((c) => c.customerId === data.customerId) : null
      await orderRepository.update(orderId, {
        customerId: data.customerId ?? '',
        customerInfo: {
          customerId: data.customerId,
          name: isExisting ? (customer?.name ?? data.customerName) : data.customerName,
          phone: isExisting ? (customer?.phone ?? data.customerPhone) : data.customerPhone,
          gstNumber: isExisting ? customer?.gstNumber : (data.customerGst ?? undefined),
        },
        items: data.items.map((item) => ({
          ...item,
          quantity: Number(item.quantity),
          unitRate: Number(item.unitRate),
          gstPercentage: 0,
          total: Number(item.quantity) * Number(item.unitRate),
        })),
        estimatedAmount,
        advanceAmount: Math.max(0, Number(data.advanceAmount) || 0),
        advanceMode: data.advanceMode,
        advanceRemarks: data.advanceRemarks?.trim() ?? '',
        orderDate: data.orderDate || todayStr(),
        timeSlot: data.timeSlot || 'MORNING',
        comment: data.comment?.trim() ?? '',
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      toast.success('Order updated successfully!')
      closeCreate()
    },
    onError: () => toast.error('Failed to update order'),
  })

  const convertToBillMutation = useMutation({
    mutationFn: async ({ order, markPaid }: { order: Order; markPaid: boolean }) => {
      const billNumber = await billRepository.generateBillNumber()
      const subtotal = order.items.reduce((s, i) => s + i.quantity * i.unitRate, 0)
      const orderAdvance = Math.min(Math.max(0, order.advanceAmount ?? 0), subtotal)
      const amountPaid = markPaid ? subtotal : orderAdvance
      const remainingAmount = Math.max(0, subtotal - amountPaid)
      const paymentStatus = paymentStatusFromAmounts(subtotal, amountPaid)
      const createdBill = await billRepository.create({
        billNumber,
        ...(order.customerId ? { customerId: order.customerId } : {}),
        customerInfo: order.customerInfo,
        items: order.items.map((item) => ({ ...item, itemDiscount: 0, gstPercentage: 0 })),
        subtotal,
        discount: 0,
        gstAmount: 0,
        grandTotal: subtotal,
        isGstBill: false,
        status: billStatusFromPayment(paymentStatus),
        amountPaid,
        remainingAmount,
        paymentStatus,
        billingDate: todayIst(),
      })
      if (order.customerId && amountPaid > 0.01) {
        const autoRemarks = markPaid
          ? `Paid while converting order ${order.orderNumber} to bill`
          : `Order advance adjusted from ${order.orderNumber}`
        await transactionRepository.create({
          billId: createdBill.billId,
          customerId: order.customerId,
          amount: amountPaid,
          paymentMode: order.advanceMode ?? 'CASH',
          remarks: order.advanceRemarks?.trim() || autoRemarks,
        })
      }
      // Mark the order as converted so it cannot be converted again
      await orderRepository.update(order.orderId, { billId: createdBill.billId })
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['bills'] })
      queryClient.invalidateQueries({ queryKey: ['customerBalances'] })
      queryClient.invalidateQueries({ queryKey: ['ledger-detail'] })
      queryClient.invalidateQueries({ queryKey: ['bills', 'month'] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      toast.success(vars.markPaid ? 'Order converted to paid bill!' : 'Order converted to bill!')
      setDetailOrder(null)
      setDeliverConvertPrompt(null)
    },
    onError: (err) => {
      console.error('Convert to bill failed:', err)
      toast.error('Failed to convert to bill. Check console for details.')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (orderId: string) => orderRepository.delete(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      toast.success('Order deleted')
      setDeleteOrder(null)
      setDetailOrder(null)
    },
    onError: () => toast.error('Failed to delete order'),
  })

  // ── Filtered list ─────────────────────────────────────────────────────────

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
      c.phone.includes(customerSearch)
  )

  const TIME_SLOT_ORDER: Record<string, number> = { MORNING: 0, AFTERNOON: 1, EVENING: 2 }

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const q = search.toLowerCase()
      if (q && !o.orderNumber.toLowerCase().includes(q) && !o.customerInfo.name.toLowerCase().includes(q))
        return false

      if (filterStatus !== 'ALL' && o.status !== filterStatus) return false

      // Use orderDate (user-selected) for filtering, fallback to createdAt (IST)
      const dateStr =
        o.orderDate ||
        (o.createdAt?.toDate ? toIstDateString(o.createdAt.toDate()) : null)
      if (dateStr) {
        if (filterDateMode === 'single' && filterSingle) {
          if (dateStr !== filterSingle) return false
        } else {
          if (filterFrom && dateStr < filterFrom) return false
          if (filterTo && dateStr > filterTo) return false
        }
      }
      return true
    }).sort((a, b) => {
      const dateA = a.orderDate || ''
      const dateB = b.orderDate || ''
      // Delivered: newest first; other statuses: earliest date first
      if (dateA !== dateB) {
        return filterStatus === 'DELIVERED'
          ? dateB.localeCompare(dateA)
          : dateA.localeCompare(dateB)
      }
      const slotDiff = (TIME_SLOT_ORDER[a.timeSlot] ?? 0) - (TIME_SLOT_ORDER[b.timeSlot] ?? 0)
      return filterStatus === 'DELIVERED' ? -slotDiff : slotDiff
    })
  }, [orders, search, filterStatus, filterDateMode, filterSingle, filterFrom, filterTo])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Orders</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Manage quotations and estimates</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          New Order
        </Button>
      </div>

      {/* Search + Filter bar */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by order no. or customer..."
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

        {/* Filter Panel */}
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
                      className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${filterDateMode === 'range' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 dark:border-gray-600 text-gray-500 hover:border-gray-400'}`}
                    >
                      Range
                    </button>
                    <button
                      type="button"
                      onClick={() => { setFilterDateMode('single'); setDatePreset('custom') }}
                      className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${filterDateMode === 'single' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 dark:border-gray-600 text-gray-500 hover:border-gray-400'}`}
                    >
                      Single day
                    </button>
                  </div>
                </div>

                {filterDateMode === 'range' && (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          { value: 'today', label: 'Today' },
                          { value: 'last7next7', label: 'Last 7 + Next 7 days' },
                          { value: 'nextWeek', label: 'Next week' },
                          { value: 'thisMonth', label: 'This month' },
                          { value: 'custom', label: 'Custom' },
                        ] as { value: DatePreset; label: string }[]
                      ).map((p) => (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => applyPreset(p.value)}
                          className={`text-xs px-3 py-1 rounded-full border transition-colors ${datePreset === p.value ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-400 hover:text-blue-600'}`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="space-y-1">
                        <Label className="text-xs text-gray-500">From</Label>
                        <Input type="date" value={filterFrom} onChange={(e) => { setFilterFrom(e.target.value); setDatePreset('custom') }} className="h-8 w-36 text-xs" />
                      </div>
                      <span className="text-gray-400 mt-5">—</span>
                      <div className="space-y-1">
                        <Label className="text-xs text-gray-500">To</Label>
                        <Input type="date" value={filterTo} onChange={(e) => { setFilterTo(e.target.value); setDatePreset('custom') }} className="h-8 w-36 text-xs" />
                      </div>
                    </div>
                  </>
                )}

                {filterDateMode === 'single' && (
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-500">Select date</Label>
                    <Input type="date" value={filterSingle} onChange={(e) => setFilterSingle(e.target.value)} className="h-8 w-36 text-xs" />
                  </div>
                )}
              </div>

              {/* Order status */}
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Order Status
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {([{ value: 'ALL', label: 'All' }, ...FILTER_ORDER_STATUSES] as { value: OrderStatus | 'ALL'; label: string }[]).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFilterStatus(opt.value)}
                      className={`text-xs px-3 py-1 rounded-full border transition-colors ${filterStatus === opt.value ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-400 hover:text-blue-600'}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Active filter summary */}
        {(filterDateMode === 'single' ? filterSingle : (filterFrom || filterTo)) && (
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Showing{' '}
            <strong className="text-gray-600 dark:text-gray-300">{filteredOrders.length}</strong>{' '}
            order{filteredOrders.length !== 1 ? 's' : ''}
            {filterDateMode === 'single' && filterSingle ? ` on ${filterSingle}` : filterFrom && filterTo ? ` from ${filterFrom} to ${filterTo}` : ''}
            {filterStatus !== 'ALL' ? ` · ${filterStatus}` : ''}
          </p>
        )}
      </div>

      {/* Orders list */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : filteredOrders.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <ShoppingCart className="h-10 w-10 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">No orders found</p>
            <Button variant="link" onClick={() => setCreateOpen(true)} className="mt-2">
              Create first order
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filteredOrders.map((order) => {
            const conf = ORDER_STATUS_CONFIG[order.status]
            const Icon = conf.icon
            const nextStatuses = STATUS_TRANSITIONS[order.status]
            return (
              <Card
                key={order.orderId}
                className="hover:shadow-sm transition-shadow cursor-pointer"
                onClick={() => setDetailOrder(order)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-blue-600 font-semibold">{order.orderNumber}</span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${conf.bg} ${conf.color}`}>
                          <Icon className="h-3 w-3" />
                          {conf.label}
                        </span>
                        {order.billId && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400">
                            <Receipt className="h-3 w-3" />
                            Billed
                          </span>
                        )}
                      </div>
                      <p className="font-semibold mt-1">{order.customerInfo.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className="text-xs text-gray-500">
                          {order.orderDate ? format(parseISO(order.orderDate), 'd MMM yyyy') : (order.createdAt?.toDate ? formatDate(order.createdAt.toDate()) : '—')}
                        </span>
                        {order.timeSlot && (
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${TIME_SLOT_STYLE[order.timeSlot]}`}>
                            {TIME_SLOTS.find(s => s.value === order.timeSlot)?.label}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                        {formatOrderItemsSummary(order.items)}
                      </p>
                      {order.comment && (
                        <p className="text-xs text-gray-400 italic mt-0.5 line-clamp-1">{order.comment}</p>
                      )}
                      {(order.advanceAmount ?? 0) > 0 && (
                        <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                          Advance: {formatCurrency(order.advanceAmount ?? 0)}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-gray-900 dark:text-white">{formatCurrency(order.estimatedAmount)}</p>
                      <p className="text-xs text-gray-400 mt-0.5">Estimated</p>
                      {nextStatuses.length > 0 && (
                        <div className="flex gap-1 justify-end mt-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                          {nextStatuses.map((s) => {
                            const nc = ORDER_STATUS_CONFIG[s]
                            const NIcon = nc.icon
                            return (
                              <Button
                                key={s}
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => requestStatusChange(order, s)}
                                disabled={updateStatusMutation.isPending}
                              >
                                <NIcon className={`h-3 w-3 ${nc.color}`} />
                                {nc.label}
                              </Button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ── Create / Edit Order Dialog ── */}
      <Dialog open={createOpen || !!editOrder} onOpenChange={(open) => { if (!open) closeCreate() }}>
        <DialogContent
          className="max-w-3xl max-h-[95vh] overflow-y-auto"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{editOrder ? `Edit Order — ${editOrder.orderNumber}` : 'Create New Order'}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={handleSubmit(onSubmitOrder)}
            className="space-y-5"
          >

            {/* Customer section */}
            <Tabs
              value={watchCustomerType}
              onValueChange={(v) => {
                setValue('customerType', v as 'existing' | 'new')
                setValue('customerId', '')
                setValue('customerName', '')
                setValue('customerPhone', '')
                setValue('customerGst', '')
                setCustomerSearch('')
                clearErrors(['customerName', 'customerPhone', 'customerId'])
              }}
            >
              <TabsList>
                <TabsTrigger value="existing">Existing Customer</TabsTrigger>
                <TabsTrigger value="new">New Customer</TabsTrigger>
              </TabsList>

              {/* Existing customer */}
              <TabsContent value="existing" className="mt-4 space-y-3">
                <div className="space-y-1.5">
                  <Label>Search & Select Customer</Label>
                  <Input
                    placeholder="Search by name or phone..."
                    value={customerSearch}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value)
                      clearErrors(['customerName', 'customerPhone', 'customerId'])
                    }}
                  />
                </div>
                {errors.customerName && watchCustomerType === 'existing' && (
                  <p className="text-xs text-red-500">{errors.customerName.message}</p>
                )}
                {errors.customerPhone && watchCustomerType === 'existing' && (
                  <p className="text-xs text-red-500">{errors.customerPhone.message}</p>
                )}
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
                          clearErrors(['customerName', 'customerPhone', 'customerId'])
                        }}
                        className="text-green-700 hover:text-green-900"
                      >
                        Change
                      </Button>
                    </div>
                  </div>
                )}
                {errors.customerId && watchCustomerType === 'existing' && (
                  <p className="text-xs text-red-500">{errors.customerId.message ?? 'Please select a customer'}</p>
                )}
              </TabsContent>

              {/* New customer */}
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

            {/* Date & Time Slot */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Order Date *</Label>
                <Input type="date" {...register('orderDate')} />
              </div>
              <div className="space-y-1.5">
                <Label>Time Slot</Label>
                <div className="flex gap-1.5">
                  {TIME_SLOTS.map((slot) => {
                    const selected = watch('timeSlot') === slot.value
                    return (
                      <button
                        key={slot.value}
                        type="button"
                        onClick={() => setValue('timeSlot', slot.value)}
                        className={`flex-1 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                          selected
                            ? `${TIME_SLOT_STYLE[slot.value]} border-transparent`
                            : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                      >
                        {slot.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Comment */}
            <div className="space-y-1.5">
              <Label className="text-xs">Comment / Notes</Label>
              <textarea
                {...register('comment')}
                rows={2}
                placeholder="Optional note about this order…"
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-gray-800">
              <button
                type="button"
                onClick={() => setAdvanceOpen((prev) => !prev)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <div>
                  <Label className="text-sm font-semibold cursor-pointer">Advance Payment</Label>
                  <p className="text-xs text-gray-500 mt-1">
                    {watchAdvanceAmount > 0
                      ? `${formatCurrency(Number(watchAdvanceAmount) || 0)} added`
                      : 'Optional. Adjusted automatically when converted to a bill.'}
                  </p>
                </div>
                {advanceOpen ? (
                  <ChevronUp className="h-4 w-4 text-gray-400 shrink-0" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                )}
              </button>

              {advanceOpen && (
                <div className="border-t border-gray-200 dark:border-gray-800 p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Advance Amount (₹)</Label>
                      <Controller
                        control={control}
                        name="advanceAmount"
                        render={({ field }) => (
                          <NumericInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
                        )}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Payment Mode</Label>
                      <select
                        {...register('advanceMode')}
                        className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        {PAYMENT_MODES.map((mode) => (
                          <option key={mode.value} value={mode.value}>{mode.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Advance Remarks</Label>
                    <Input {...register('advanceRemarks')} placeholder="Optional payment note" />
                  </div>
                </div>
              )}
            </div>

            {/* Items section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Order Items</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ productId: '', productName: '', quantity: 1, unitRate: 0, total: 0 })}
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
                  const lineTotal = qty * rate
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
                          <ProductSelect
                            products={products}
                            value={f.value}
                            onChange={(id) => {
                              f.onChange(id)
                              void handleProductSelect(index, id)
                            }}
                          />
                        )}
                      />
                      <div className="grid grid-cols-2 gap-2">
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
                      </div>
                      <div className="flex justify-end">
                        <div className="text-right">
                          <p className="text-xs text-gray-500 mb-0.5">Total</p>
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
                      <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500">Total</th>
                      <th className="py-2 px-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((field, index) => {
                      const qty = Number(watchItems[index]?.quantity) || 0
                      const rate = Number(watchItems[index]?.unitRate) || 0
                      const lineTotal = qty * rate
                      return (
                        <tr key={field.id} className="border-b border-gray-100 dark:border-gray-800">
                          <td className="py-2 px-2">
                            <Controller
                              control={control}
                              name={`items.${index}.productId`}
                              render={({ field: f }) => (
                                <ProductSelect
                                  products={products}
                                  value={f.value}
                                  onChange={(id) => {
                                    f.onChange(id)
                                    void handleProductSelect(index, id)
                                  }}
                                  className="w-44"
                                  placeholder="Select..."
                                />
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
                          <td className="py-2 px-2 text-right font-medium text-xs whitespace-nowrap">{formatCurrency(lineTotal)}</td>
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

              <div className="flex justify-end pt-1 border-t border-gray-100 dark:border-gray-800">
                <p className="text-sm font-bold text-gray-900 dark:text-white">
                  Estimated Total:{' '}
                  <span className="text-blue-600">{formatCurrency(estimatedAmount)}</span>
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeCreate}>Cancel</Button>
              <Button
                type="submit"
                disabled={isSubmitting || createMutation.isPending || updateMutation.isPending}
              >
                {(isSubmitting || createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {editOrder ? 'Save Changes' : 'Create Order'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Order Detail Dialog ── */}
      {detailOrder && (
        <Dialog open={!!detailOrder} onOpenChange={() => setDetailOrder(null)}>
          <DialogContent className="max-w-2xl max-h-[95vh] overflow-y-auto print:shadow-none">
            <DialogHeader className="print:hidden">
              <DialogTitle className="flex items-center gap-2 flex-wrap">
                Order {detailOrder.orderNumber}
                {(() => {
                  const conf = ORDER_STATUS_CONFIG[detailOrder.status]
                  const Icon = conf.icon
                  return (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${conf.bg} ${conf.color}`}>
                      <Icon className="h-3 w-3" />
                      {conf.label}
                    </span>
                  )
                })()}
              </DialogTitle>
            </DialogHeader>

            <OrderView order={detailOrder} />

            <DialogFooter className="print:hidden flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={sharingPdf || shopProfileLoading}
                onClick={async () => {
                  setSharingPdf(true)
                  try {
                    const blob = await createOrderPdfBlob(detailOrder, shopProfile)
                    await sharePdfBlob({
                      blob,
                      filename: `order-${detailOrder.orderNumber}.pdf`,
                      title: `Order ${detailOrder.orderNumber}`,
                      onFallback: (msg) => toast.info(msg),
                    })
                  } catch (err) {
                    if (err instanceof Error && err.name !== 'AbortError') {
                      toast.error('Failed to share order')
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
                variant="outline"
                size="sm"
                disabled={sharingPdf || shopProfileLoading}
                onClick={async () => {
                  setSharingPdf(true)
                  try {
                    await shareElementAsImage({
                      elementId: 'order-print',
                      filename: `order-${detailOrder.orderNumber}.jpg`,
                      title: `Order ${detailOrder.orderNumber}`,
                      text: `Order ${detailOrder.orderNumber}`,
                      phone: detailOrder.customerInfo?.phone,
                      onError: (msg) => toast.error(msg),
                      onFallback: (msg) => toast.info(msg),
                    })
                  } catch (err) {
                    if (err instanceof Error && err.name !== 'AbortError') {
                      toast.error('Failed to share order')
                    }
                  } finally {
                    setSharingPdf(false)
                  }
                }}
              >
                {sharingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
                WhatsApp
              </Button>

              {detailOrder.status !== 'DELIVERED' && detailOrder.status !== 'REJECTED' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openEdit(detailOrder)}
                >
                  <Edit2 className="h-4 w-4" />
                  Edit Order
                </Button>
              )}

              {detailOrder.status !== 'REJECTED' && (
                <>
                  <Button
                    size="sm"
                    onClick={() => convertToBillMutation.mutate({ order: detailOrder, markPaid: false })}
                    disabled={convertToBillMutation.isPending || !!detailOrder.billId}
                    title={detailOrder.billId ? `Already converted to bill ${detailOrder.billId}` : undefined}
                  >
                    {convertToBillMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowRight className="h-4 w-4" />
                    )}
                    {detailOrder.billId ? 'Already Billed' : 'Convert to Bill'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => convertToBillMutation.mutate({ order: detailOrder, markPaid: true })}
                    disabled={convertToBillMutation.isPending || !!detailOrder.billId}
                    title={detailOrder.billId ? `Already converted to bill ${detailOrder.billId}` : undefined}
                  >
                    {convertToBillMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Receipt className="h-4 w-4" />
                    )}
                    Convert to Paid Bill
                  </Button>
                </>
              )}

              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleteOrder(detailOrder)}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Reject Confirm Dialog ── */}
      <Dialog open={!!rejectConfirm} onOpenChange={(open) => { if (!open) setRejectConfirm(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-500" />
              Reject Order
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Are you sure you want to reject order{' '}
            <strong className="text-gray-900 dark:text-white">{rejectConfirm?.order.orderNumber}</strong> for{' '}
            <strong className="text-gray-900 dark:text-white">{rejectConfirm?.order.customerInfo.name}</strong>?
            This action will mark the order as rejected.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectConfirm(null)} disabled={updateStatusMutation.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (rejectConfirm) {
                  updateStatusMutation.mutate({ order: rejectConfirm.order, status: rejectConfirm.status })
                  setRejectConfirm(null)
                }
              }}
              disabled={updateStatusMutation.isPending}
            >
              {updateStatusMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Reject Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Deliver → Convert to Bill prompt ── */}
      <Dialog open={!!deliverConvertPrompt} onOpenChange={(open) => { if (!open) setDeliverConvertPrompt(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-blue-600" />
              Convert to Bill?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Order{' '}
            <strong className="text-gray-900 dark:text-white">{deliverConvertPrompt?.orderNumber}</strong> for{' '}
            <strong className="text-gray-900 dark:text-white">{deliverConvertPrompt?.customerInfo.name}</strong>{' '}
            is marked delivered and has not been billed yet. Convert it to a bill now?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeliverConvertPrompt(null)} disabled={convertToBillMutation.isPending}>
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (deliverConvertPrompt) convertToBillMutation.mutate({ order: deliverConvertPrompt, markPaid: false })
              }}
              disabled={convertToBillMutation.isPending}
            >
              {convertToBillMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Convert to Bill
            </Button>
            <Button
              onClick={() => {
                if (deliverConvertPrompt) convertToBillMutation.mutate({ order: deliverConvertPrompt, markPaid: true })
              }}
              disabled={convertToBillMutation.isPending}
            >
              {convertToBillMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Convert to Paid Bill
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm Dialog ── */}
      <Dialog open={!!deleteOrder} onOpenChange={() => setDeleteOrder(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Order</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500">
            Are you sure you want to delete order{' '}
            <strong>{deleteOrder?.orderNumber}</strong> for{' '}
            <strong>{deleteOrder?.customerInfo.name}</strong>?
            {deleteOrder?.billId && (
              <span className="block mt-2 text-amber-600 dark:text-amber-400">
                This order was converted to a bill. The bill will not be deleted.
              </span>
            )}
            {' '}This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOrder(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteOrder && deleteMutation.mutate(deleteOrder.orderId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
