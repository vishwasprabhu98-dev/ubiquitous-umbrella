import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Search, Edit2, Trash2, Loader2, Package } from 'lucide-react'
import { toast } from 'sonner'
import { productRepository } from '@/firebase/repositories/productRepository'
import { getFirestoreErrorMessage } from '@/lib/firestoreUtils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency } from '@/lib/utils'
import type { Product, ProductFormData } from '@/types'

const productSchema = z.object({
  productName: z.string().min(1, 'Product name is required'),
  basePrice: z.number().min(0, 'Enter a valid price'),
  gstPercentage: z.number(),
  unit: z.string().min(1, 'Unit is required'),
})

type FormData = z.infer<typeof productSchema>

const GST_OPTIONS = [0, 5, 12, 18, 28]
const UNIT_OPTIONS = ['KG', 'Litre', 'Piece', 'Box', 'Bag', 'Bundle', 'Dozen', 'Meter', 'Set']

export default function ProductManagement() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: productRepository.getAll,
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(productSchema),
    defaultValues: { gstPercentage: 18, unit: 'KG' },
  })

  const createMutation = useMutation({
    mutationFn: (data: ProductFormData) => productRepository.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success('Product created successfully')
      closeDialog()
    },
    onError: (error) => toast.error(getFirestoreErrorMessage(error)),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ProductFormData> }) =>
      productRepository.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success('Product updated successfully')
      closeDialog()
    },
    onError: (error) => toast.error(getFirestoreErrorMessage(error)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => productRepository.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success('Product deleted')
      setDeleteId(null)
    },
    onError: (error) => toast.error(getFirestoreErrorMessage(error)),
  })

  const openCreate = () => {
    setEditingProduct(null)
    reset({ gstPercentage: 18, unit: 'KG' })
    setDialogOpen(true)
  }

  const openEdit = (product: Product) => {
    setEditingProduct(product)
    reset({
      productName: product.productName,
      basePrice: product.basePrice,
      gstPercentage: product.gstPercentage,
      unit: product.unit,
    })
    setDialogOpen(true)
  }

  const closeDialog = () => {
    setDialogOpen(false)
    setEditingProduct(null)
    reset({})
  }

  const onSubmit = async (data: FormData) => {
    if (editingProduct) {
      await updateMutation.mutateAsync({ id: editingProduct.productId, data })
    } else {
      await createMutation.mutateAsync(data)
    }
  }

  const filtered = products.filter(
    (p) =>
      p.productName.toLowerCase().includes(search.toLowerCase()) ||
      p.productId.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Add Product
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Package className="h-10 w-10 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">No products found</p>
            <Button variant="link" onClick={openCreate} className="mt-2">
              Add your first product
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Product</th>
                <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">ID</th>
                <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Base Price</th>
                <th className="text-center py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">GST %</th>
                <th className="text-center py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Unit</th>
                <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((product) => (
                <tr
                  key={product.productId}
                  className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
                >
                  <td className="py-3 px-3 font-medium">{product.productName}</td>
                  <td className="py-3 px-3 font-mono text-xs text-gray-400">{product.productId.slice(0, 8)}</td>
                  <td className="py-3 px-3 text-right font-medium">{formatCurrency(product.basePrice)}</td>
                  <td className="py-3 px-3 text-center">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                      {product.gstPercentage}%
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center text-gray-500">{product.unit}</td>
                  <td className="py-3 px-3">
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => openEdit(product)}>
                        <Edit2 className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 text-red-500 hover:text-red-600 hover:border-red-300"
                        onClick={() => setDeleteId(product.productId)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingProduct ? 'Edit Product' : 'Add Product'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Product Name *</Label>
              <Input {...register('productName')} placeholder="e.g. Basmati Rice" />
              {errors.productName && <p className="text-xs text-red-500">{errors.productName.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Base Price (₹) *</Label>
                <Input {...register('basePrice', { valueAsNumber: true })} type="number" step="0.01" min="0" placeholder="0.00" />
                {errors.basePrice && <p className="text-xs text-red-500">{errors.basePrice.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>GST % *</Label>
                <select
                  {...register('gstPercentage', { valueAsNumber: true })}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {GST_OPTIONS.map((g) => (
                    <option key={g} value={g}>{g}%</option>
                  ))}
                </select>
                {errors.gstPercentage && <p className="text-xs text-red-500">{errors.gstPercentage.message}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Unit *</Label>
              <select
                {...register('unit')}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {UNIT_OPTIONS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
              {errors.unit && <p className="text-xs text-red-500">{errors.unit.message}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingProduct ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Product</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500">Are you sure? This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
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
