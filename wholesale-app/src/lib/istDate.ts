/** India Standard Time helpers (UTC+05:30). Avoids UTC `toISOString()` day shifts. */

export const IST_TIMEZONE = 'Asia/Kolkata'

/** Calendar date in IST as YYYY-MM-DD. */
export function toIstDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/** Alias used for HTML date inputs and presets. */
export function toInputDate(date: Date = new Date()): string {
  return toIstDateString(date)
}

export function todayIst(): string {
  return toIstDateString(new Date())
}

/** IST year-month key, e.g. 2026-08. */
export function toIstMonthKey(date: Date = new Date()): string {
  return toIstDateString(date).slice(0, 7)
}

export function currentIstMonthKey(): string {
  return toIstMonthKey(new Date())
}

export function parseMonthKey(monthKey: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  if (month < 1 || month > 12) return null
  return { year, month }
}

export function formatMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

export function previousMonthKey(monthKey: string): string | null {
  const parsed = parseMonthKey(monthKey)
  if (!parsed) return null
  if (parsed.month === 1) return formatMonthKey(parsed.year - 1, 12)
  return formatMonthKey(parsed.year, parsed.month - 1)
}

/** Inclusive window of the last `monthCount` IST months ending at `endMonthKey` (default: current). */
export function istRollingMonthBounds(
  monthCount: number,
  endMonthKey: string = currentIstMonthKey()
): { from: Date; to: Date } | null {
  if (monthCount < 1) return null
  let startKey = endMonthKey
  for (let i = 1; i < monthCount; i++) {
    const prev = previousMonthKey(startKey)
    if (!prev) break
    startKey = prev
  }
  const fromBounds = istMonthBounds(startKey)
  const toBounds = istMonthBounds(endMonthKey)
  if (!fromBounds || !toBounds) return null
  return { from: fromBounds.from, to: toBounds.to }
}

/** First/last IST instants for a YYYY-MM key (for Firestore range queries). */
export function istMonthBounds(monthKey: string): { from: Date; to: Date } | null {
  const parsed = parseMonthKey(monthKey)
  if (!parsed) return null
  const { from: fromStr, to: toStr } = istMonthRange(formatMonthKey(parsed.year, parsed.month) + '-01')
  return { from: istDayStart(fromStr), to: istDayEnd(toStr) }
}

/** Start of an IST calendar day as a UTC Date (for Firestore range queries). */
export function istDayStart(yyyyMmDd: string): Date {
  return new Date(`${yyyyMmDd}T00:00:00+05:30`)
}

/** End of an IST calendar day as a UTC Date. */
export function istDayEnd(yyyyMmDd: string): Date {
  return new Date(`${yyyyMmDd}T23:59:59.999+05:30`)
}

/** Shift an IST calendar date by `deltaDays` (can be negative). */
export function addIstDays(yyyyMmDd: string, deltaDays: number): string {
  const base = istDayStart(yyyyMmDd)
  return toIstDateString(new Date(base.getTime() + deltaDays * 86_400_000))
}

/** First and last IST calendar days of the month containing `yyyyMmDd`. */
export function istMonthRange(yyyyMmDd: string = todayIst()): { from: string; to: string } {
  const [y, m] = yyyyMmDd.split('-').map(Number)
  const from = `${y}-${String(m).padStart(2, '0')}-01`
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const to = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { from, to }
}

/** True if `date` falls on the IST calendar day `yyyyMmDd`. */
export function isSameIstDay(date: Date, yyyyMmDd: string): boolean {
  return toIstDateString(date) === yyyyMmDd
}

/** Prefer user-selected billingDate; fall back to createdAt (IST). */
export function getBillDateString(bill: {
  billingDate?: string
  createdAt?: { toDate?: () => Date }
}): string | null {
  if (bill.billingDate) return bill.billingDate
  if (bill.createdAt?.toDate) return toIstDateString(bill.createdAt.toDate())
  return null
}

export const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const
