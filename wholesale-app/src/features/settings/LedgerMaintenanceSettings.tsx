import { useMutation, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { customerBalanceRepository } from '@/firebase/repositories/customerBalanceRepository'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export default function LedgerMaintenanceSettings() {
  const queryClient = useQueryClient()

  const rebuildMutation = useMutation({
    mutationFn: () => customerBalanceRepository.rebuildAll(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customerBalances'] })
      queryClient.invalidateQueries({ queryKey: ['ledger-detail'] })
      toast.success('Customer balances rebuilt')
    },
    onError: () => toast.error('Failed to rebuild balances'),
  })

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Ledger Maintenance</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Recompute denormalized customer balance summaries when ledger totals need a manual refresh.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => rebuildMutation.mutate()}
          disabled={rebuildMutation.isPending}
        >
          {rebuildMutation.isPending ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Rebuild balances
        </Button>
      </CardContent>
    </Card>
  )
}
