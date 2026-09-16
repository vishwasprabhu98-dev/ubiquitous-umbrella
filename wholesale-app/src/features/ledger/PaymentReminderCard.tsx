import { Building2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import upiLogo from '@/assets/upi.png'

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
  shopPhone,
  upiId,
  asOf = new Date(),
}: {
  amount: number
  shopName: string
  shopPhone?: string
  upiId?: string
  asOf?: Date
}) {
  const amountLabel = formatBoldAmount(amount)
  const asOfLabel = formatAsOf(asOf)
  const phone = shopPhone?.trim() || ''
  const upi = upiId?.trim() || ''

  return (
    <div
      className="box-border flex w-full max-w-[720px] flex-col items-center justify-center border border-gray-200 bg-gradient-to-br from-[#fff5f3] via-[#faf7f5] to-[#eef2f7] px-6 py-6 sm:px-12 sm:py-8"
      style={{ aspectRatio: '16 / 9', fontFamily: 'system-ui, -apple-system, sans-serif' }}
    >
      <p className="text-[24px] font-medium uppercase tracking-[0.22em] text-gray-400">
        Payment Reminder
      </p>

      <p className="mt-3 text-center text-6xl font-bold leading-none tracking-[0.08em] text-[#8B1E1E] sm:mt-4">
        {amountLabel}
      </p>

      <p className="mt-2.5 max-w-md text-center text-sm text-gray-500 sm:mt-3 sm:text-base">
        You owe {formatCurrency(amount)} as on {asOfLabel}
      </p>

      <div className="mt-3 inline-flex items-center gap-2 rounded-md bg-gray-400 px-5 py-2 text-xs font-medium text-white sm:mt-4 sm:gap-2.5 sm:px-7 sm:py-2.5 sm:text-sm">
        <Building2 className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" strokeWidth={2.25} />
        <span>{shopName.trim() || 'Shop'}</span>
      </div>

      <div className="mt-3 flex items-center justify-center gap-4 sm:mt-4 sm:gap-5">
        <img
          src={upiLogo}
          alt="UPI — Paytm, Google Pay, PhonePe"
          className="h-[56px] w-auto max-w-[130px] shrink-0 object-contain sm:h-[72px] sm:max-w-[160px]"
        />
        {(phone || upi) && (
          <div className="flex min-w-0 flex-col justify-center gap-1 text-left">
            {phone && (
              <p className="text-lg font-bold tracking-wide text-gray-900 sm:text-xl">
                {phone}
              </p>
            )}
            {upi && (
              <p className="text-sm font-semibold text-gray-700 sm:text-base">
                UPI ID: <span className="font-bold text-gray-900">{upi}</span>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
