import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Plus, Trash2, Loader2, Tags } from 'lucide-react'
import { toast } from 'sonner'
import { pricingRepository } from '@/firebase/repositories/pricingRepository'
import { customerRepository } from '@/firebase/repositories/customerRepository'
import { productRepository } from '@/firebase/repositories/productRepository'
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

interface FormData {
  customerId: string
  productId: string
  customPrice: number
}

export default function PricingManagement() {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)

  const { data: pricings = [], isLoading } = useQuery({
    queryKey: ['pricing'],
    queryFn: pricingRepository.getAll,
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
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>()

  const selectedProductId = watch('productId')
  const selectedProduct = products.find((p) => p.productId === selectedProductId)

  const createMutation = useMutation({
    mutationFn: pricingRepository.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pricing'] })
      toast.success('Custom pricing set successfully')
      setDialogOpen(false)
      reset({})
    },
    onError: () => toast.error('Failed to set pricing'),
  })

  const deleteMutation = useMutation({
    mutationFn: pricingRepository.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pricing'] })
      toast.success('Pricing mapping removed')
    },
    onError: () => toast.error('Failed to remove pricing'),
  })

  const onSubmit = async (data: FormData) => {
    await createMutation.mutateAsync(data)
  }

  const getCustomerName = (id: string) => customers.find((c) => c.customerId === id)?.name ?? id
  const getProductName = (id: string) => products.find((p) => p.productId === id)?.productName ?? id
  const getBasePrice = (id: string) => products.find((p) => p.productId === id)?.basePrice ?? 0

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { reset({}); setDialogOpen(true) }}>
          <Plus className="h-4 w-4" />
          Add Custom Pricing
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : pricings.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Tags className="h-10 w-10 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">No custom pricing set</p>
            <p className="text-sm text-gray-400 mt-1">All customers will use the default base price</p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Customer</th>
                <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Product</th>
                <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Base Price</th>
                <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Custom Price</th>
                <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pricings.map((p) => (
                <tr
                  key={p.mappingId}
                  className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30"
                >
                  <td className="py-3 px-3 font-medium">{getCustomerName(p.customerId)}</td>
                  <td className="py-3 px-3 text-gray-600 dark:text-gray-400">{getProductName(p.productId)}</td>
                  <td className="py-3 px-3 text-right text-gray-400 line-through">{formatCurrency(getBasePrice(p.productId))}</td>
                  <td className="py-3 px-3 text-right font-semibold text-green-600">{formatCurrency(p.customPrice)}</td>
                  <td className="py-3 px-3 text-right">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7 text-red-500 hover:text-red-600 hover:border-red-300"
                      onClick={() => deleteMutation.mutate(p.mappingId)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Set Custom Pricing</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Customer *</Label>
              <select
                {...register('customerId')}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Select customer...</option>
                {customers.map((c) => (
                  <option key={c.customerId} value={c.customerId}>{c.name}</option>
                ))}
              </select>
              {errors.customerId && <p className="text-xs text-red-500">{errors.customerId.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Product *</Label>
              <select
                {...register('productId')}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Select product...</option>
                {products.map((p) => (
                  <option key={p.productId} value={p.productId}>
                    {p.productName} (Base: {formatCurrency(p.basePrice)})
                  </option>
                ))}
              </select>
              {errors.productId && <p className="text-xs text-red-500">{errors.productId.message}</p>}
            </div>
            {selectedProduct && (
              <div className="rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 p-3 text-sm">
                <p className="text-blue-700 dark:text-blue-300">
                  Base price: <strong>{formatCurrency(selectedProduct.basePrice)}</strong>
                  {' '}per {selectedProduct.unit}
                </p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Custom Price (₹) *</Label>
              <Input {...register('customPrice')} type="number" step="0.01" placeholder="0.00" />
              {errors.customPrice && <p className="text-xs text-red-500">{errors.customPrice.message}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Save Pricing
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
