import { Building2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

function formatBoldAmount(amount: number): string {
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
  return `₹ ${formatted}`
}

function formatAsOf(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

export default function PaymentReminderCard({
  amount,
  shopName,
  asOf = new Date(),
}: {
  amount: number
  shopName: string
  asOf?: Date
}) {
  const amountLabel = formatBoldAmount(amount)
  const asOfLabel = formatAsOf(asOf)

  return (
    <div
      className="box-border flex w-full max-w-[720px] flex-col items-center justify-center border border-gray-200 bg-gradient-to-br from-[#fff5f3] via-[#faf7f5] to-[#eef2f7] px-8 py-10 sm:px-12 sm:py-12"
      style={{ aspectRatio: '16 / 9', fontFamily: 'system-ui, -apple-system, sans-serif' }}
    >
      <p className="text-[24px] font-medium uppercase tracking-[0.22em] text-gray-400">
        Payment Reminder
      </p>

      <p className="mt-5 text-center text-6xl font-bold leading-none tracking-[0.08em] text-[#8B1E1E] sm:mt-8">
        {amountLabel}
      </p>

      <p className="mt-4 max-w-md text-center text-lg text-gray-500 sm:mt-5 sm:text-xl">
        You owe {formatCurrency(amount)} as on {asOfLabel}
      </p>

      <div className="mt-8 inline-flex items-center gap-2 rounded-md bg-gray-400 px-5 py-2.5 text-xs font-medium text-white sm:mt-10 sm:gap-2.5 sm:px-7 sm:py-3.5 sm:text-sm">
        <Building2 className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" strokeWidth={2.25} />
        <span>{shopName.trim() || 'Shop'}</span>
      </div>
    </div>
  )
}
