import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Store, Save, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { settingsRepository, DEFAULT_SHOP_PROFILE } from '@/firebase/repositories/settingsRepository'
import type { ShopProfile } from '@/types'

export default function ShopProfileSettings() {
  const queryClient = useQueryClient()

  const { data: profile, isLoading } = useQuery({
    queryKey: ['shopProfile'],
    queryFn: () => settingsRepository.getShopProfile(),
  })

  const { register, handleSubmit, reset, formState: { isDirty } } = useForm<ShopProfile>({
    defaultValues: DEFAULT_SHOP_PROFILE,
  })

  useEffect(() => {
    if (profile) reset(profile)
  }, [profile, reset])

  const saveMutation = useMutation({
    mutationFn: (data: ShopProfile) => settingsRepository.saveShopProfile(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shopProfile'] })
      toast.success('Shop profile saved')
    },
    onError: () => toast.error('Failed to save shop profile'),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Store className="h-5 w-5 text-blue-600" />
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Shop Profile</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            This information appears on every bill / invoice you generate.
          </p>
        </div>
      </div>

      <Card className="p-6">
        <form onSubmit={handleSubmit((data) => saveMutation.mutate(data))} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2 space-y-1.5">
              <Label>Shop / Business Name <span className="text-red-500">*</span></Label>
              <Input
                {...register('name', { required: true })}
                placeholder="e.g. Prabhu Traders"
              />
            </div>

            <div className="md:col-span-2 space-y-1.5">
              <Label>Address</Label>
              <Input
                {...register('address')}
                placeholder="Street address / building / area"
              />
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
              <Input {...register('pincode')} placeholder="400001" maxLength={6} />
            </div>

            <div className="space-y-1.5">
              <Label>GST Number</Label>
              <Input
                {...register('gstNumber')}
                placeholder="27AAAAA0000A1Z5"
                className="uppercase"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input {...register('phone')} placeholder="+91 98765 43210" />
            </div>

            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input {...register('email')} type="email" placeholder="shop@example.com" />
            </div>

            <div className="space-y-1.5">
              <Label>Composition GST Rate (%)</Label>
              <Input
                {...register('compositionGstRate', { valueAsNumber: true })}
                type="number"
                step="0.01"
                min="0"
                max="100"
                placeholder="e.g. 1"
              />
              <p className="text-xs text-gray-400">Applied on subtotal when a bill is marked as GST Bill.</p>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={saveMutation.isPending || !isDirty}>
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Profile
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
