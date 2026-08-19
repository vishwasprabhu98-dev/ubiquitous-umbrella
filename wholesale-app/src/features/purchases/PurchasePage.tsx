import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import {
  Plus,
  Trash2,
  Loader2,
  ShoppingBag,
  Search,
  Edit2,
  FileText,
  Save,
  Share2,
  Download,
} from 'lucide-react'
import { toast } from 'sonner'
import { todayIst } from '@/lib/istDate'
import { purchaseRepository } from '@/firebase/repositories/purchaseRepository'
import { customerRepository } from '@/firebase/repositories/customerRepository'
import { productRepository } from '@/firebase/repositories/productRepository'
import { settingsRepository } from '@/firebase/repositories/settingsRepository'
import { sharePdfBlob, downloadPdfBlob } from '@/lib/sharePdf'
import { createPurchasePdfBlob } from '@/lib/purchasePdf'
import PurchaseInvoiceView from './PurchaseInvoiceView'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NumericInput } from '@/components/ui/numeric-input'
import { ProductSelect } from '@/components/ui/product-select'
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
import type { PurchaseInvoice, PurchaseStatus } from '@/types'

interface PurchaseFormData {
  vendorType: 'customer' | 'new'
  customerId?: string
  vendorName: string
  vendorPhone: string
  vendorGst?: string
  purchaseDate: string
  items: {
    productId: string
    productName: string
    quantity: number
    unitRate: number
    total: number
  }[]
  discount: number
  comment?: string
}

function todayStr() {
  return todayIst()
}

const STATUS_STYLES: Record<PurchaseStatus, string> = {
  DRAFT: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  SAVED: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
}

export default function PurchasePage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | PurchaseStatus>('ALL')
  const [formOpen, setFormOpen] = useState(false)
  const [editingPurchase, setEditingPurchase] = useState<PurchaseInvoice | null>(null)
  const [vendorSearch, setVendorSearch] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [viewPurchase, setViewPurchase] = useState<PurchaseInvoice | null>(null)
  const [sharingPdf, setSharingPdf] = useState(false)

  const { data: purchases = [], isLoading } = useQuery({
    queryKey: ['purchases'],
    queryFn: purchaseRepository.getAll,
  })
  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: customerRepository.getAll,
  })
  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: productRepository.getAll,
  })
  const { data: shopProfile, isLoading: shopProfileLoading } = useQuery({
    queryKey: ['shopProfile'],
    queryFn: () => settingsRepository.getShopProfile(),
    staleTime: 5 * 60 * 1000,
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
  } = useForm<PurchaseFormData>({
    defaultValues: {
      vendorType: 'customer',
      purchaseDate: todayStr(),
      items: [{ productId: '', productName: '', quantity: 1, unitRate: 0, total: 0 }],
      discount: 0,
      comment: '',
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const watchItems = watch('items')
  const watchVendorType = watch('vendorType')
  const watchCustomerId = watch('customerId')
  const watchDiscount = Number(watch('discount')) || 0

  const subtotal = watchItems.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0
    const rate = Number(item.unitRate) || 0
    return sum + qty * rate
  }, 0)
  const grandTotal = Math.max(0, subtotal - watchDiscount)

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(vendorSearch.toLowerCase()) ||
      c.phone.includes(vendorSearch)
  )

  const handleVendorSelect = (customerId: string) => {
    const customer = customers.find((c) => c.customerId === customerId)
    if (!customer) return
    setValue('customerId', customerId)
    setValue('vendorName', customer.name)
    setValue('vendorPhone', customer.phone)
    setValue('vendorGst', customer.gstNumber ?? '')
    setVendorSearch(customer.name)
    clearErrors(['vendorName', 'vendorPhone'])
  }

  const validateVendor = (data: PurchaseFormData) => {
    const vendorName = data.vendorName?.trim()
    const vendorPhone = data.vendorPhone?.trim() ?? ''
    const phoneDigits = vendorPhone.replace(/\D/g, '')

    if (!vendorName) {
      setError('vendorName', {
        type: 'manual',
        message: data.vendorType === 'customer' ? 'Please select a vendor' : 'Vendor name is required',
      })
      toast.error('Vendor name is required')
      return false
    }
    if (phoneDigits.length < 10) {
      setError('vendorPhone', {
        type: 'manual',
        message: 'Phone number is required (min 10 digits)',
      })
      toast.error('Phone number is required')
      return false
    }
    return true
  }

  const buildPayload = (data: PurchaseFormData, status: PurchaseStatus) => {
    const isCustomer = data.vendorType === 'customer'
    const customer = isCustomer ? customers.find((c) => c.customerId === data.customerId) : null
    const existingPaid = editingPurchase?.amountPaid ?? 0
    const payload = {
      status,
      vendorType: data.vendorType,
      customerId: isCustomer ? data.customerId : undefined,
      vendorInfo: {
        name: isCustomer ? (customer?.name ?? data.vendorName.trim()) : data.vendorName.trim(),
        phone: isCustomer ? (customer?.phone ?? data.vendorPhone.trim()) : data.vendorPhone.trim(),
        gstNumber: isCustomer ? customer?.gstNumber : (data.vendorGst?.trim() || undefined),
      },
      items: data.items.map((item) => ({
        ...item,
        quantity: Number(item.quantity),
        unitRate: Number(item.unitRate),
        total: Number(item.quantity) * Number(item.unitRate),
      })),
      subtotal,
      discount: watchDiscount,
      grandTotal,
      purchaseDate: data.purchaseDate || todayStr(),
      ...(data.comment?.trim() ? { comment: data.comment.trim() } : {}),
    }
    if (status === 'SAVED') {
      return {
        ...payload,
        amountPaid: existingPaid,
        remainingAmount: Math.max(0, grandTotal - existingPaid),
      }
    }
    return payload
  }

  const saveMutation = useMutation({
    mutationFn: async ({ data, asDraft }: { data: PurchaseFormData; asDraft: boolean }) => {
      if (!validateVendor(data)) throw new Error('validation')
      const payload = buildPayload(data, asDraft ? 'DRAFT' : 'SAVED')

      if (editingPurchase) {
        const updates = { ...payload } as Partial<PurchaseInvoice>
        if (!asDraft && !editingPurchase.purchaseNumber) {
          updates.purchaseNumber = await purchaseRepository.generatePurchaseNumber()
        }
        await purchaseRepository.update(editingPurchase.purchaseId, updates)
      } else {
        if (asDraft) {
          await purchaseRepository.create(payload)
        } else {
          const purchaseNumber = await purchaseRepository.generatePurchaseNumber()
          await purchaseRepository.create({ ...payload, purchaseNumber })
        }
      }
    },
    onSuccess: (_, { asDraft }) => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] })
      queryClient.invalidateQueries({ queryKey: ['customerBalances'] })
      queryClient.invalidateQueries({ queryKey: ['ledger-detail'] })
      queryClient.invalidateQueries({ queryKey: ['purchases', 'vendors-month'] })
      toast.success(asDraft ? 'Draft saved' : 'Purchase invoice saved')
      closeForm()
    },
    onError: (err) => {
      if (err instanceof Error && err.message === 'validation') return
      toast.error('Failed to save purchase invoice')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => purchaseRepository.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] })
      queryClient.invalidateQueries({ queryKey: ['customerBalances'] })
      queryClient.invalidateQueries({ queryKey: ['ledger-detail'] })
      queryClient.invalidateQueries({ queryKey: ['purchases', 'vendors-month'] })
      toast.success('Draft deleted')
      setDeleteId(null)
    },
    onError: () => toast.error('Failed to delete draft'),
  })

  const closeForm = () => {
    setFormOpen(false)
    setEditingPurchase(null)
    setVendorSearch('')
    reset({
      vendorType: 'customer',
      purchaseDate: todayStr(),
      items: [{ productId: '', productName: '', quantity: 1, unitRate: 0, total: 0 }],
      discount: 0,
      comment: '',
    })
  }

  const openCreate = () => {
    setEditingPurchase(null)
    reset({
      vendorType: 'customer',
      purchaseDate: todayStr(),
      items: [{ productId: '', productName: '', quantity: 1, unitRate: 0, total: 0 }],
      discount: 0,
      comment: '',
    })
    setVendorSearch('')
    setFormOpen(true)
  }

  const pdfFilename = (purchase: PurchaseInvoice) =>
    `purchase-${purchase.purchaseNumber ?? purchase.purchaseId}.pdf`

  const handleSharePdf = async (purchase: PurchaseInvoice) => {
    if (shopProfileLoading) {
      toast.error('Loading invoice details — please try again')
      return
    }
    setSharingPdf(true)
    try {
      const blob = await createPurchasePdfBlob(purchase, shopProfile)
      await sharePdfBlob({
        blob,
        filename: pdfFilename(purchase),
        title: `Purchase ${purchase.purchaseNumber ?? 'Invoice'}`,
        onFallback: (msg) => toast.info(msg),
      })
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        toast.error('Failed to share purchase invoice')
      }
    } finally {
      setSharingPdf(false)
    }
  }

  const handleDownloadPdf = async (purchase: PurchaseInvoice) => {
    if (shopProfileLoading) {
      toast.error('Loading invoice details — please try again')
      return
    }
    setSharingPdf(true)
    try {
      const blob = await createPurchasePdfBlob(purchase, shopProfile)
      await downloadPdfBlob({
        blob,
        filename: pdfFilename(purchase),
        onFallback: (msg) => toast.info(msg),
      })
    } catch {
      toast.error('Failed to download purchase invoice')
    } finally {
      setSharingPdf(false)
    }
  }

  const openEdit = (purchase: PurchaseInvoice) => {
    setEditingPurchase(purchase)
    const isCustomer = purchase.vendorType === 'customer'
    reset({
      vendorType: purchase.vendorType,
      customerId: purchase.customerId ?? '',
      vendorName: purchase.vendorInfo.name,
      vendorPhone: purchase.vendorInfo.phone,
      vendorGst: purchase.vendorInfo.gstNumber ?? '',
      purchaseDate: purchase.purchaseDate || todayStr(),
      items: purchase.items.map((i) => ({ ...i })),
      discount: purchase.discount,
      comment: purchase.comment ?? '',
    })
    setVendorSearch(isCustomer ? purchase.vendorInfo.name : '')
    setFormOpen(true)
  }

  const handleProductSelect = (index: number, productId: string) => {
    const product = products.find((p) => p.productId === productId)
    if (!product) return
    setValue(`items.${index}.productName`, product.productName)
    setValue(`items.${index}.unitRate`, product.basePrice)
  }

  const filtered = useMemo(() => {
    return purchases.filter((p) => {
      if (statusFilter !== 'ALL' && p.status !== statusFilter) return false
      const q = search.toLowerCase().trim()
      if (!q) return true
      return (
        (p.purchaseNumber ?? 'draft').toLowerCase().includes(q) ||
        p.vendorInfo.name.toLowerCase().includes(q) ||
        p.vendorInfo.phone.includes(q)
      )
    })
  }, [purchases, search, statusFilter])

  const draftCount = purchases.filter((p) => p.status === 'DRAFT').length
  const savedCount = purchases.filter((p) => p.status === 'SAVED').length

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Purchase Invoices</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Record purchases from vendors. Customer vendors adjust the ledger; new vendors appear in the vendor ledger.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          New Purchase
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by vendor, phone or invoice no…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {([
            { value: 'ALL', label: 'All', count: purchases.length },
            { value: 'DRAFT', label: 'Drafts', count: draftCount },
            { value: 'SAVED', label: 'Saved', count: savedCount },
          ] as const).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setStatusFilter(opt.value)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                statusFilter === opt.value
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
              }`}
            >
              {opt.label} ({opt.count})
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <ShoppingBag className="h-10 w-10 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">No purchase invoices found</p>
            <Button variant="link" onClick={openCreate} className="mt-2">
              Create first purchase
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((purchase) => (
            <Card
              key={purchase.purchaseId}
              className="hover:shadow-sm transition-shadow cursor-pointer"
              onClick={() => {
                if (purchase.status === 'DRAFT') openEdit(purchase)
                else setViewPurchase(purchase)
              }}
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-xs text-indigo-600 font-semibold">
                        {purchase.purchaseNumber ?? 'Draft'}
                      </span>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[purchase.status]}`}>
                        {purchase.status}
                      </span>
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                        {purchase.vendorType === 'customer' ? 'Customer vendor' : 'New vendor'}
                      </span>
                    </div>
                    <p className="font-semibold mt-1">{purchase.vendorInfo.name}</p>
                    <p className="text-xs text-gray-500">{purchase.vendorInfo.phone}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {purchase.purchaseDate} · {purchase.items.length} item{purchase.items.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold">{formatCurrency(purchase.grandTotal)}</p>
                    {purchase.status === 'SAVED' && purchase.vendorType === 'new' && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        Paid: {formatCurrency(purchase.amountPaid ?? 0)}
                        {(purchase.remainingAmount ?? purchase.grandTotal) > 0.001 && (
                          <> · Due: {formatCurrency(purchase.remainingAmount ?? purchase.grandTotal)}</>
                        )}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      {purchase.createdAt?.toDate ? formatDate(purchase.createdAt.toDate()) : '—'}
                    </p>
                  </div>
                </div>

                <div
                  className="flex gap-1.5 justify-end flex-wrap pt-1 border-t border-gray-100 dark:border-[#2a3040]"
                  onClick={(e) => e.stopPropagation()}
                >
                  {purchase.status === 'SAVED' && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={sharingPdf || shopProfileLoading}
                        onClick={() => handleSharePdf(purchase)}
                      >
                        <Share2 className="h-3 w-3" />
                        Share
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={sharingPdf || shopProfileLoading}
                        onClick={() => handleDownloadPdf(purchase)}
                      >
                        <Download className="h-3 w-3" />
                        PDF
                      </Button>
                    </>
                  )}
                  {purchase.status === 'DRAFT' && (
                    <>
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => openEdit(purchase)}>
                        <Edit2 className="h-3 w-3" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs text-red-500"
                        onClick={() => setDeleteId(purchase.purchaseId)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Form dialog */}
      <Dialog open={formOpen} onOpenChange={(open) => { if (!open) closeForm() }}>
        <DialogContent className="max-w-3xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingPurchase
                ? editingPurchase.status === 'DRAFT'
                  ? 'Edit Draft Purchase'
                  : `Purchase — ${editingPurchase.purchaseNumber}`
                : 'New Purchase Invoice'}
            </DialogTitle>
          </DialogHeader>

          <form
            onSubmit={handleSubmit((data) => saveMutation.mutate({ data, asDraft: false }))}
            className="space-y-5"
          >
            <Tabs
              value={watchVendorType}
              onValueChange={(v) => {
                setValue('vendorType', v as 'customer' | 'new')
                setValue('customerId', '')
                setValue('vendorName', '')
                setValue('vendorPhone', '')
                setValue('vendorGst', '')
                setVendorSearch('')
                clearErrors(['vendorName', 'vendorPhone'])
              }}
            >
              <TabsList>
                <TabsTrigger value="customer">Existing Customer</TabsTrigger>
                <TabsTrigger value="new">New Vendor</TabsTrigger>
              </TabsList>

              <TabsContent value="customer" className="mt-4 space-y-3">
                <div className="space-y-1.5">
                  <Label>Search & Select Vendor *</Label>
                  <Input
                    placeholder="Search by name or phone..."
                    value={vendorSearch}
                    onChange={(e) => {
                      setVendorSearch(e.target.value)
                      clearErrors(['vendorName', 'vendorPhone'])
                    }}
                  />
                  {errors.vendorName && watchVendorType === 'customer' && (
                    <p className="text-xs text-red-500">{errors.vendorName.message}</p>
                  )}
                </div>
                {vendorSearch && filteredCustomers.length > 0 && !watchCustomerId && (
                  <div className="border rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                    {filteredCustomers.slice(0, 8).map((c) => (
                      <button
                        key={c.customerId}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-[#252d3d] flex justify-between text-sm border-b last:border-0"
                        onClick={() => handleVendorSelect(c.customerId)}
                      >
                        <span className="font-medium">{c.name}</span>
                        <span className="text-gray-400">{c.phone}</span>
                      </button>
                    ))}
                  </div>
                )}
                {watchCustomerId && (
                  <div className="rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-green-800 dark:text-green-200">{watch('vendorName')}</p>
                        <p className="text-green-600 dark:text-green-400">{watch('vendorPhone')}</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-green-700 hover:text-green-900 dark:text-green-300"
                        onClick={() => {
                          setValue('customerId', '')
                          setValue('vendorName', '')
                          setValue('vendorPhone', '')
                          setValue('vendorGst', '')
                          setVendorSearch('')
                          clearErrors(['vendorName', 'vendorPhone'])
                        }}
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
                    <Label>Vendor Name *</Label>
                    <Input
                      {...register('vendorName', { required: 'Vendor name is required' })}
                    />
                    {errors.vendorName && <p className="text-xs text-red-500">{errors.vendorName.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Phone *</Label>
                    <Input
                      {...register('vendorPhone', {
                        required: 'Phone is required',
                        validate: (v) => v.replace(/\D/g, '').length >= 10 || 'Min 10 digits',
                      })}
                    />
                    {errors.vendorPhone && <p className="text-xs text-red-500">{errors.vendorPhone.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>GST Number</Label>
                    <Input {...register('vendorGst')} />
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <div className="space-y-1.5 max-w-xs">
              <Label>Purchase Date *</Label>
              <Input type="date" {...register('purchaseDate')} disabled={editingPurchase?.status === 'SAVED'} />
            </div>

            {/* Items */}
            <div className="space-y-2">
              <Label>Items</Label>
              {fields.map((field, index) => (
                <div key={field.id} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-12 sm:col-span-4 space-y-1">
                    <ProductSelect
                      products={products}
                      value={watch(`items.${index}.productId`)}
                      onChange={(id) => {
                        setValue(`items.${index}.productId`, id)
                        handleProductSelect(index, id)
                      }}
                      disabled={editingPurchase?.status === 'SAVED'}
                      placeholder="Select product"
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <Controller
                      control={control}
                      name={`items.${index}.quantity`}
                      render={({ field: f }) => (
                        <NumericInput {...f} disabled={editingPurchase?.status === 'SAVED'} />
                      )}
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <Controller
                      control={control}
                      name={`items.${index}.unitRate`}
                      render={({ field: f }) => (
                        <NumericInput {...f} disabled={editingPurchase?.status === 'SAVED'} />
                      )}
                    />
                  </div>
                  <div className="col-span-3 sm:col-span-2 text-right text-sm font-medium py-2">
                    {formatCurrency((Number(watchItems[index]?.quantity) || 0) * (Number(watchItems[index]?.unitRate) || 0))}
                  </div>
                  <div className="col-span-1">
                    {fields.length > 1 && editingPurchase?.status !== 'SAVED' && (
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-400" onClick={() => remove(index)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {editingPurchase?.status !== 'SAVED' && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ productId: '', productName: '', quantity: 1, unitRate: 0, total: 0 })}
                >
                  <Plus className="h-3.5 w-3.5" /> Add item
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
              <div className="space-y-1.5">
                <Label>Discount (₹)</Label>
                <Controller
                  control={control}
                  name="discount"
                  render={({ field }) => (
                    <NumericInput {...field} disabled={editingPurchase?.status === 'SAVED'} />
                  )}
                />
              </div>
            </div>

            <div className="text-right font-bold border-t pt-2">
              Total: <span className="text-indigo-600">{formatCurrency(grandTotal)}</span>
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input {...register('comment')} placeholder="Optional" disabled={editingPurchase?.status === 'SAVED'} />
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={closeForm}>Cancel</Button>
              {editingPurchase?.status === 'SAVED' && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={sharingPdf || shopProfileLoading}
                    onClick={() => editingPurchase && handleSharePdf(editingPurchase)}
                  >
                    {sharingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                    Share PDF
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={sharingPdf || shopProfileLoading}
                    onClick={() => editingPurchase && handleDownloadPdf(editingPurchase)}
                  >
                    <Download className="h-4 w-4" />
                    Download PDF
                  </Button>
                </>
              )}
              {editingPurchase?.status !== 'SAVED' && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSubmitting || saveMutation.isPending}
                    onClick={handleSubmit((data) => saveMutation.mutate({ data, asDraft: true }))}
                  >
                    <FileText className="h-4 w-4" />
                    Save Draft
                  </Button>
                  <Button type="submit" disabled={isSubmitting || saveMutation.isPending}>
                    {(isSubmitting || saveMutation.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
                    <Save className="h-4 w-4" />
                    Save Invoice
                  </Button>
                </>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Draft</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-500">Delete this draft purchase invoice?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteId && deleteMutation.mutate(deleteId)} disabled={deleteMutation.isPending}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {viewPurchase && (
        <Dialog open={!!viewPurchase} onOpenChange={() => setViewPurchase(null)}>
          <DialogContent className="max-w-2xl max-h-[95vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Purchase — {viewPurchase.purchaseNumber ?? 'Draft'}
              </DialogTitle>
            </DialogHeader>
            <PurchaseInvoiceView purchase={viewPurchase} />
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                disabled={sharingPdf || shopProfileLoading}
                onClick={() => handleSharePdf(viewPurchase)}
              >
                {sharingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                Share
              </Button>
              <Button
                variant="outline"
                disabled={sharingPdf || shopProfileLoading}
                onClick={() => handleDownloadPdf(viewPurchase)}
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
