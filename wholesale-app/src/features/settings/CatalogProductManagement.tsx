import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  Loader2,
  Images,
  ExternalLink,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { catalogProductRepository } from '@/firebase/repositories/catalogProductRepository'
import { getFirestoreErrorMessage } from '@/lib/firestoreUtils'
import { toDisplayImageUrl } from '@/lib/driveImageUrl'
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
import type { CatalogProduct, CatalogProductFormData } from '@/types'

const UNIT_OPTIONS = ['KG', 'Litre', 'Piece', 'Box', 'Bag', 'Bundle', 'Dozen', 'Meter', 'Set']

const sizeRowSchema = z.object({
  label: z.string(),
  originalPrice: z.number().min(0),
  discountedPrice: z.number().min(0),
})

const catalogSchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    description: z.string().min(1, 'Description is required'),
    unit: z.string().min(1, 'Unit is required'),
    originalPrice: z.number().min(0, 'Enter a valid price'),
    discountedPrice: z.number().min(0, 'Enter a valid price'),
    badge: z.string().optional(),
    sortOrder: z.number().optional(),
    imageUrls: z
      .array(z.object({ url: z.string() }))
      .min(1, 'Add at least one image URL'),
    sizes: z.array(sizeRowSchema),
  })
  .refine(
    (data) => data.imageUrls.some((row) => row.url.trim().length > 0),
    { message: 'Add at least one image URL', path: ['imageUrls'] }
  )
  .superRefine((data, ctx) => {
    const filledSizes = data.sizes.filter((s) => s.label.trim())
    if (filledSizes.length === 0) {
      if (data.discountedPrice > data.originalPrice) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Discounted price cannot exceed original price',
          path: ['discountedPrice'],
        })
      }
      return
    }
    data.sizes.forEach((size, i) => {
      if (!size.label.trim()) return
      if (size.discountedPrice > size.originalPrice) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Discounted price cannot exceed original',
          path: ['sizes', i, 'discountedPrice'],
        })
      }
    })
  })

type FormData = z.infer<typeof catalogSchema>

function toFormValues(product?: CatalogProduct | null): FormData {
  if (!product) {
    return {
      name: '',
      description: '',
      unit: 'Piece',
      originalPrice: 0,
      discountedPrice: 0,
      badge: '',
      sortOrder: undefined,
      imageUrls: [{ url: '' }],
      sizes: [],
    }
  }
  return {
    name: product.name,
    description: product.description,
    unit: product.unit || 'Piece',
    originalPrice: product.originalPrice,
    discountedPrice: product.discountedPrice,
    badge: product.badge ?? '',
    sortOrder: product.sortOrder,
    imageUrls:
      product.imageUrls.length > 0
        ? product.imageUrls.map((url) => ({ url }))
        : [{ url: '' }],
    sizes: (product.sizes ?? []).map((s) => ({
      label: s.label,
      originalPrice: s.originalPrice,
      discountedPrice: s.discountedPrice,
    })),
  }
}

function toPayload(data: FormData): CatalogProductFormData {
  const sizes = data.sizes
    .filter((s) => s.label.trim())
    .map((s) => ({
      label: s.label.trim(),
      originalPrice: s.originalPrice,
      discountedPrice: s.discountedPrice,
    }))

  return {
    name: data.name.trim(),
    description: data.description.trim(),
    unit: data.unit.trim(),
    originalPrice: sizes.length > 0 ? sizes[0].originalPrice : data.originalPrice,
    discountedPrice: sizes.length > 0 ? sizes[0].discountedPrice : data.discountedPrice,
    badge: data.badge?.trim() || undefined,
    sortOrder: data.sortOrder,
    imageUrls: data.imageUrls.map((row) => row.url.trim()).filter(Boolean),
    sizes,
  }
}

function displayPrice(product: CatalogProduct) {
  const sizes = product.sizes?.filter((s) => s.label.trim()) ?? []
  if (sizes.length === 0) {
    return {
      discounted: product.discountedPrice,
      original: product.originalPrice,
      suffix: '',
    }
  }
  const discounted = Math.min(...sizes.map((s) => s.discountedPrice))
  const original = Math.min(...sizes.map((s) => s.originalPrice))
  return {
    discounted,
    original,
    suffix: sizes.length > 1 ? 'from ' : '',
  }
}

export default function CatalogProductManagement() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<CatalogProduct | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['catalogProducts'],
    queryFn: () => catalogProductRepository.getAll(),
  })

  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(catalogSchema),
    defaultValues: toFormValues(),
  })

  const {
    fields: imageFields,
    append: appendImage,
    remove: removeImage,
  } = useFieldArray({ control, name: 'imageUrls' })

  const {
    fields: sizeFields,
    append: appendSize,
    remove: removeSize,
  } = useFieldArray({ control, name: 'sizes' })

  const watchedUrls = watch('imageUrls')
  const watchedSizes = watch('sizes')
  const hasFilledSizes = (watchedSizes ?? []).some((s) => s.label?.trim())

  const createMutation = useMutation({
    mutationFn: (data: CatalogProductFormData) => catalogProductRepository.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalogProducts'] })
      toast.success('Catalog product created')
      closeDialog()
    },
    onError: (error) => toast.error(getFirestoreErrorMessage(error)),
  })

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string
      data: Partial<CatalogProductFormData>
    }) => catalogProductRepository.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalogProducts'] })
      toast.success('Catalog product updated')
      closeDialog()
    },
    onError: (error) => toast.error(getFirestoreErrorMessage(error)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => catalogProductRepository.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalogProducts'] })
      toast.success('Catalog product deleted')
      setDeleteId(null)
    },
    onError: (error) => toast.error(getFirestoreErrorMessage(error)),
  })

  const openCreate = () => {
    setEditing(null)
    reset(toFormValues())
    setDialogOpen(true)
  }

  const openEdit = (product: CatalogProduct) => {
    setEditing(product)
    reset(toFormValues(product))
    setDialogOpen(true)
  }

  const closeDialog = () => {
    setDialogOpen(false)
    setEditing(null)
    reset(toFormValues())
  }

  const onSubmit = async (data: FormData) => {
    const payload = toPayload(data)
    if (editing) {
      await updateMutation.mutateAsync({ id: editing.catalogProductId, data: payload })
    } else {
      await createMutation.mutateAsync(payload)
    }
  }

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search catalog products…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <a href="/catalog" target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
              Open catalog
            </a>
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Add catalog product
          </Button>
        </div>
      </div>

      <p className="text-xs text-gray-500">
        Public page at <span className="font-medium">/catalog</span> — no login required.
        Paste Google Drive share links for images.
      </p>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Images className="h-10 w-10 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">No catalog products yet</p>
            <Button variant="link" onClick={openCreate} className="mt-2">
              Add your first catalog product
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((product) => {
            const thumb = toDisplayImageUrl(product.imageUrls[0] ?? '', 400)
            const price = displayPrice(product)
            const hasDiscount = price.discounted < price.original
            const sizeCount = product.sizes?.filter((s) => s.label.trim()).length ?? 0
            return (
              <Card key={product.catalogProductId} className="overflow-hidden">
                <div className="relative aspect-[3/4] w-full overflow-hidden bg-gray-100 dark:bg-[#1e2330]">
                  {thumb ? (
                    <img
                      src={thumb}
                      alt={product.name}
                      className="absolute inset-0 h-full w-full object-cover object-center"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                      <Images className="h-8 w-8" />
                    </div>
                  )}
                </div>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                        {product.name}
                      </h3>
                      <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">
                        {product.description}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEdit(product)}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500"
                        onClick={() => setDeleteId(product.catalogProductId)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-baseline gap-2 text-sm">
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {price.suffix}
                      {formatCurrency(price.discounted)}
                      <span className="text-xs font-normal text-gray-500">
                        {' '}
                        / {product.unit || 'Piece'}
                      </span>
                    </span>
                    {hasDiscount && (
                      <span className="text-xs text-gray-400 line-through">
                        {formatCurrency(price.original)}
                      </span>
                    )}
                    <span className="text-[10px] text-gray-400 ml-auto">
                      {sizeCount > 0 ? `${sizeCount} sizes · ` : ''}
                      {product.imageUrls.length} photo
                      {product.imageUrls.length === 1 ? '' : 's'}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Edit catalog product' : 'Add catalog product'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cat-name">Name</Label>
              <Input id="cat-name" {...register('name')} />
              {errors.name && (
                <p className="text-xs text-red-500">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cat-desc">Description</Label>
              <textarea
                id="cat-desc"
                rows={3}
                {...register('description')}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {errors.description && (
                <p className="text-xs text-red-500">{errors.description.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cat-unit">Price unit</Label>
              <select
                id="cat-unit"
                {...register('unit')}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {UNIT_OPTIONS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
              {errors.unit && (
                <p className="text-xs text-red-500">{errors.unit.message}</p>
              )}
            </div>

            {!hasFilledSizes && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cat-original">Original price (₹)</Label>
                  <Input
                    id="cat-original"
                    type="number"
                    step="0.01"
                    min={0}
                    {...register('originalPrice', { valueAsNumber: true })}
                  />
                  {errors.originalPrice && (
                    <p className="text-xs text-red-500">{errors.originalPrice.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cat-discount">Discounted price (₹)</Label>
                  <Input
                    id="cat-discount"
                    type="number"
                    step="0.01"
                    min={0}
                    {...register('discountedPrice', { valueAsNumber: true })}
                  />
                  {errors.discountedPrice && (
                    <p className="text-xs text-red-500">{errors.discountedPrice.message}</p>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <Label>Size variants (optional)</Label>
                  <p className="text-[11px] text-gray-400">
                    Add Small / Medium / Large with different prices. Leave empty for a single price.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() =>
                    appendSize({ label: '', originalPrice: 0, discountedPrice: 0 })
                  }
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add size
                </Button>
              </div>
              {sizeFields.map((field, index) => (
                <div
                  key={field.id}
                  className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end"
                >
                  <div className="space-y-1">
                    {index === 0 && (
                      <Label className="text-xs text-gray-500">Size</Label>
                    )}
                    <Input
                      placeholder="Medium"
                      {...register(`sizes.${index}.label`)}
                    />
                  </div>
                  <div className="space-y-1">
                    {index === 0 && (
                      <Label className="text-xs text-gray-500">Original ₹</Label>
                    )}
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      {...register(`sizes.${index}.originalPrice`, {
                        setValueAs: (v) =>
                          v === '' || v == null || Number.isNaN(Number(v))
                            ? 0
                            : Number(v),
                      })}
                    />
                  </div>
                  <div className="space-y-1">
                    {index === 0 && (
                      <Label className="text-xs text-gray-500">Discount ₹</Label>
                    )}
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      {...register(`sizes.${index}.discountedPrice`, {
                        setValueAs: (v) =>
                          v === '' || v == null || Number.isNaN(Number(v))
                            ? 0
                            : Number(v),
                      })}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => removeSize(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  {errors.sizes?.[index]?.discountedPrice && (
                    <p className="col-span-4 text-xs text-red-500">
                      {errors.sizes[index]?.discountedPrice?.message}
                    </p>
                  )}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cat-badge">Badge (optional)</Label>
                <Input
                  id="cat-badge"
                  placeholder="e.g. Top item"
                  {...register('badge')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cat-sort">Sort order (optional)</Label>
                <Input
                  id="cat-sort"
                  type="number"
                  placeholder="1"
                  {...register('sortOrder', {
                    setValueAs: (v) =>
                      v === '' || v == null || Number.isNaN(Number(v))
                        ? undefined
                        : Number(v),
                  })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Image URLs (Google Drive)</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => appendImage({ url: '' })}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add URL
                </Button>
              </div>
              {imageFields.map((field, index) => (
                <div key={field.id} className="flex gap-2">
                  <Input
                    placeholder="https://drive.google.com/file/d/…"
                    {...register(`imageUrls.${index}.url`)}
                  />
                  {imageFields.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      onClick={() => removeImage(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              {errors.imageUrls && (
                <p className="text-xs text-red-500">
                  {errors.imageUrls.message ||
                    (errors.imageUrls as { root?: { message?: string } }).root
                      ?.message}
                </p>
              )}
              {watchedUrls?.[0]?.url?.trim() && (
                <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg border border-gray-200 dark:border-[#2a3040] bg-gray-50 dark:bg-[#1e2330]">
                  <img
                    src={toDisplayImageUrl(watchedUrls[0].url)}
                    alt="Preview"
                    className="absolute inset-0 h-full w-full object-cover object-center"
                    referrerPolicy="no-referrer"
                  />
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? 'Save changes' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete catalog product?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500">
            This removes it from the public catalog. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              {deleteMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
