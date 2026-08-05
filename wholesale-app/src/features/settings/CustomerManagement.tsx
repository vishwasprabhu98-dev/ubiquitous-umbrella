import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Search, Edit2, Trash2, Loader2, User } from 'lucide-react'
import { toast } from 'sonner'
import { customerRepository } from '@/firebase/repositories/customerRepository'
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
import type { Customer, CustomerFormData } from '@/types'

const customerSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  phone: z.string().min(10, 'Valid phone number required'),
  whatsapp: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  gstNumber: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
})

type FormData = z.infer<typeof customerSchema>

export default function CustomerManagement() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: customerRepository.getAll,
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(customerSchema) })

  const createMutation = useMutation({
    mutationFn: (data: CustomerFormData) => customerRepository.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      toast.success('Customer created successfully')
      closeDialog()
    },
    onError: (error) => toast.error(getFirestoreErrorMessage(error)),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CustomerFormData> }) =>
      customerRepository.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      toast.success('Customer updated successfully')
      closeDialog()
    },
    onError: (error) => toast.error(getFirestoreErrorMessage(error)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => customerRepository.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      toast.success('Customer deleted')
      setDeleteId(null)
    },
    onError: (error) => toast.error(getFirestoreErrorMessage(error)),
  })

  const openCreate = () => {
    setEditingCustomer(null)
    reset({})
    setDialogOpen(true)
  }

  const openEdit = (customer: Customer) => {
    setEditingCustomer(customer)
    reset({
      name: customer.name,
      phone: customer.phone,
      whatsapp: customer.whatsapp ?? '',
      email: customer.email ?? '',
      gstNumber: customer.gstNumber ?? '',
      address: customer.address ?? '',
      city: customer.city ?? '',
      state: customer.state ?? '',
      pincode: customer.pincode ?? '',
    })
    setDialogOpen(true)
  }

  const closeDialog = () => {
    setDialogOpen(false)
    setEditingCustomer(null)
    reset({})
  }

  const onSubmit = async (data: FormData) => {
    if (editingCustomer) {
      await updateMutation.mutateAsync({ id: editingCustomer.customerId, data })
    } else {
      await createMutation.mutateAsync(data as CustomerFormData)
    }
  }

  const filtered = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search) ||
      (c.gstNumber ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search customers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Add Customer
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
            <User className="h-10 w-10 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">No customers found</p>
            <Button variant="link" onClick={openCreate} className="mt-2">
              Add your first customer
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((customer) => (
            <Card key={customer.customerId} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-300 font-semibold text-sm shrink-0">
                      {customer.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">{customer.name}</p>
                      <p className="text-sm text-gray-500">{customer.phone}</p>
                      {customer.gstNumber && (
                        <p className="text-xs text-gray-400 mt-0.5">GST: {customer.gstNumber}</p>
                      )}
                      {customer.city && (
                        <p className="text-xs text-gray-400">
                          {customer.city}{customer.state ? `, ${customer.state}` : ''}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEdit(customer)}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 text-red-500 hover:text-red-600 hover:border-red-300"
                      onClick={() => setDeleteId(customer.customerId)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCustomer ? 'Edit Customer' : 'Add Customer'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Name *</Label>
                <Input {...register('name')} placeholder="Customer name" />
                {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Phone *</Label>
                <Input {...register('phone')} placeholder="9876543210" />
                {errors.phone && <p className="text-xs text-red-500">{errors.phone.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>WhatsApp</Label>
                <Input {...register('whatsapp')} placeholder="WhatsApp number" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Email</Label>
                <Input {...register('email')} type="email" placeholder="email@example.com" />
                {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>GST Number</Label>
                <Input {...register('gstNumber')} placeholder="22AAAAA0000A1Z5" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Address</Label>
                <Input {...register('address')} placeholder="Street address" />
              </div>
              <div className="space-y-1.5">
                <Label>City</Label>
                <Input {...register('city')} placeholder="City" />
              </div>
              <div className="space-y-1.5">
                <Label>State</Label>
                <Input {...register('state')} placeholder="State" />
              </div>
              <div className="space-y-1.5">
                <Label>Pincode</Label>
                <Input {...register('pincode')} placeholder="400001" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingCustomer ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Customer</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500">
            Are you sure you want to delete this customer? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
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
