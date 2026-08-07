import { toIstDateString, istDayStart, istDayEnd } from '@/lib/istDate'

/** Indian financial year: 1 Apr → 31 Mar (IST calendar). */
export function getCurrentFinancialYearRange(now = new Date()): { from: Date; to: Date } {
  const istToday = toIstDateString(now)
  const [y, m] = istToday.split('-').map(Number)
  const fyStartYear = m >= 4 ? y : y - 1
  return {
    from: istDayStart(`${fyStartYear}-04-01`),
    to: istDayEnd(istToday),
  }
}

export function toDateInputValue(date: Date): string {
  return toIstDateString(date)
}

export function parseDateInputStart(value: string): Date | undefined {
  if (!value) return undefined
  return istDayStart(value)
}

export function parseDateInputEnd(value: string): Date | undefined {
  if (!value) return undefined
  return istDayEnd(value)
}
