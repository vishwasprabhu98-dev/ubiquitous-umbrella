import type { Bill, Customer, CustomerBalance, PurchaseInvoice, Transaction } from '@/types'
import { LEDGER_PAYMENT_REF } from '@/firebase/repositories/customerBalanceRepository.constants'
import { getBillDateString, istDayStart, toIstMonthKey } from '@/lib/istDate'

export interface LedgerRow {
  id: string
  date: Date | undefined
  description: string
  type: 'bill' | 'payment' | 'purchase' | 'opening'
  debit: number
  credit: number
  balance: number
  paymentMode?: string
  reference: string
}

export interface CustomerLedgerEntry {
  key: string
  name: string
  phone: string
  customerId?: string
  purchaseId?: string
  isRegistered: boolean
  billNumber?: string
  totalBills: number
  totalBilled: number
  totalPaid: number
  outstanding: number
  openingBalance?: number
  customerCreatedAt?: Date
  lastBillDate?: Date
  bills: Bill[]
  purchases?: PurchaseInvoice[]
  ledgerRows: LedgerRow[]
}

export interface LedgerDetailData {
  ledgerRows: LedgerRow[]
  bills: Bill[]
  purchases: PurchaseInvoice[]
  transactions: Transaction[]
}

export function toDate(ts: unknown): Date | undefined {
  if (!ts) return undefined
  if (ts instanceof Date) return ts
  if (typeof ts === 'object' && 'toDate' in (ts as object)) {
    return (ts as { toDate: () => Date }).toDate()
  }
  return undefined
}

function billActivityDate(bill: Bill): Date | undefined {
  const day = getBillDateString(bill)
  if (day) return istDayStart(day)
  return toDate(bill.createdAt)
}

export function buildLedgerRows(
  bills: Bill[],
  transactions: Transaction[],
  customerId?: string,
  customerPurchases: PurchaseInvoice[] = [],
  openingBalance = 0,
  openingDate?: Date,
  seed: 'opening' | 'broughtForward' = 'opening'
): LedgerRow[] {
  const billIds = new Set(bills.map((b) => b.billId))
  const txByBill: Record<string, Transaction[]> = {}

  for (const tx of transactions) {
    if (billIds.has(tx.billId)) {
      if (!txByBill[tx.billId]) txByBill[tx.billId] = []
      txByBill[tx.billId].push(tx)
    }
  }

  const ledgerPayments = customerId
    ? transactions.filter(
        (tx) => tx.billId === LEDGER_PAYMENT_REF && tx.customerId === customerId
      )
    : []

  type RawRow = Omit<LedgerRow, 'balance'>
  const rows: RawRow[] = []

  if (Math.abs(openingBalance) > 0.001 && customerId) {
    const isCredit = openingBalance < 0
    rows.push({
      id: seed === 'broughtForward' ? `bf-${customerId}` : `opening-${customerId}`,
      date: openingDate ?? new Date(0),
      description: seed === 'broughtForward' ? 'Brought Forward' : 'Opening Balance',
      type: 'opening',
      debit: isCredit ? 0 : Math.abs(openingBalance),
      credit: isCredit ? Math.abs(openingBalance) : 0,
      reference: seed === 'broughtForward' ? `bf-${customerId}` : `opening-${customerId}`,
    })
  }

  for (const bill of bills) {
    rows.push({
      id: `bill-${bill.billId}`,
      date: billActivityDate(bill),
      description: bill.movedToLedger
        ? `${bill.billNumber} (On Ledger)`
        : bill.billNumber,
      type: 'bill',
      debit: bill.grandTotal,
      credit: 0,
      reference: bill.billId,
    })

    const billTxs = txByBill[bill.billId] ?? []
    let txCredits = 0
    for (const tx of billTxs) {
      txCredits += tx.amount
      rows.push({
        id: `tx-${tx.transactionId}`,
        date: toDate(tx.createdAt),
        description: `Payment${tx.paymentMode ? ` · ${tx.paymentMode.replace('_', ' ')}` : ''}${tx.remarks ? ` — ${tx.remarks}` : ''}`,
        type: 'payment',
        debit: 0,
        credit: tx.amount,
        reference: tx.transactionId,
        paymentMode: tx.paymentMode,
      })
    }

    const unrecordedPaid = bill.amountPaid - txCredits
    if (unrecordedPaid > 0.001) {
      rows.push({
        id: `bill-paid-${bill.billId}`,
        date: billActivityDate(bill),
        description: 'Payment received',
        type: 'payment',
        debit: 0,
        credit: unrecordedPaid,
        reference: bill.billId,
      })
    }
  }

  for (const tx of ledgerPayments) {
    rows.push({
      id: `ledger-tx-${tx.transactionId}`,
      date: toDate(tx.createdAt),
      description: `Ledger Payment${tx.paymentMode ? ` · ${tx.paymentMode.replace('_', ' ')}` : ''}${tx.remarks ? ` — ${tx.remarks}` : ''}`,
      type: 'payment',
      debit: 0,
      credit: tx.amount,
      reference: tx.transactionId,
      paymentMode: tx.paymentMode,
    })
  }

  for (const purchase of customerPurchases) {
    if (purchase.status !== 'SAVED') continue
    rows.push({
      id: `purchase-${purchase.purchaseId}`,
      date: toDate(purchase.createdAt),
      description: `Purchase · ${purchase.purchaseNumber ?? '—'}`,
      type: 'purchase',
      debit: 0,
      credit: purchase.grandTotal,
      reference: purchase.purchaseId,
    })

    const purchaseTxs = transactions.filter(
      (tx) =>
        tx.purchaseId === purchase.purchaseId ||
        (tx.billId === purchase.purchaseId && tx.billId !== LEDGER_PAYMENT_REF)
    )
    let txPaid = 0
    for (const tx of purchaseTxs) {
      txPaid += tx.amount
      rows.push({
        id: `purchase-tx-${tx.transactionId}`,
        date: toDate(tx.createdAt),
        description: `Paid to vendor${tx.paymentMode ? ` · ${tx.paymentMode.replace('_', ' ')}` : ''}${tx.remarks ? ` — ${tx.remarks}` : ''}`,
        type: 'payment',
        debit: tx.amount,
        credit: 0,
        reference: tx.transactionId,
        paymentMode: tx.paymentMode,
      })
    }
    const unrecordedPaid = (purchase.amountPaid ?? 0) - txPaid
    if (unrecordedPaid > 0.001) {
      rows.push({
        id: `purchase-paid-${purchase.purchaseId}`,
        date: toDate(purchase.createdAt),
        description: 'Paid to vendor',
        type: 'payment',
        debit: unrecordedPaid,
        credit: 0,
        reference: purchase.purchaseId,
      })
    }
  }

  rows.sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0))

  let balance = 0
  const withBalance = rows.map((row) => {
    balance += row.debit - row.credit
    return { ...row, balance }
  })

  // Newest first for display
  return withBalance.reverse()
}

/** Sum in-period billed/paid and closing balance from newest-first ledger rows. */
export function periodMetricsFromRows(rows: LedgerRow[]): {
  billed: number
  paid: number
  closing: number
} {
  let billed = 0
  let paid = 0
  for (const row of rows) {
    if (row.type === 'bill') billed += row.debit
    if (row.type === 'payment') paid += row.credit
    if (row.type === 'purchase') paid += row.credit
  }
  return { billed, paid, closing: rows[0]?.balance ?? 0 }
}

/** Apply in-month billed/paid onto existing-customer ledger entries (Due stays all-time outstanding). */
export function applyMonthActivityToExistingEntries(
  entries: CustomerLedgerEntry[],
  monthBills: Bill[],
  monthTransactions: Transaction[],
  monthPurchases: PurchaseInvoice[] = []
): CustomerLedgerEntry[] {
  const billedByCustomer = new Map<string, number>()
  const paidByCustomer = new Map<string, number>()

  for (const bill of monthBills) {
    if (!bill.customerId) continue
    billedByCustomer.set(
      bill.customerId,
      (billedByCustomer.get(bill.customerId) ?? 0) + (bill.grandTotal ?? 0)
    )
  }

  for (const tx of monthTransactions) {
    if (!tx.customerId || (tx.amount ?? 0) <= 0) continue
    if (tx.purchaseId) continue
    // Ledger settlements + bill payments dated in this month
    if (tx.billId === LEDGER_PAYMENT_REF || tx.billId) {
      paidByCustomer.set(
        tx.customerId,
        (paidByCustomer.get(tx.customerId) ?? 0) + tx.amount
      )
    }
  }

  for (const purchase of monthPurchases) {
    if (purchase.status !== 'SAVED' || !purchase.customerId) continue
    if (!(purchase.vendorType === 'customer' || purchase.customerId)) continue
    // Purchase from customer = credit (same as ledger period metrics)
    paidByCustomer.set(
      purchase.customerId,
      (paidByCustomer.get(purchase.customerId) ?? 0) + (purchase.grandTotal ?? 0)
    )
  }

  return entries.map((entry) => {
    if (!entry.isRegistered || !entry.customerId) return entry
    return {
      ...entry,
      totalBilled: billedByCustomer.get(entry.customerId) ?? 0,
      totalPaid: paidByCustomer.get(entry.customerId) ?? 0,
    }
  })
}

export function buildVendorPurchaseRows(
  purchase: PurchaseInvoice,
  transactions: Transaction[]
): LedgerRow[] {
  const purchaseTxs = transactions.filter(
    (tx) => tx.purchaseId === purchase.purchaseId || tx.billId === purchase.purchaseId
  )

  type RawRow = Omit<LedgerRow, 'balance'>
  const rows: RawRow[] = [{
    id: `purchase-${purchase.purchaseId}`,
    date: toDate(purchase.createdAt) ?? (purchase.purchaseDate ? new Date(purchase.purchaseDate) : undefined),
    description: `Purchase · ${purchase.purchaseNumber ?? '—'}`,
    type: 'purchase',
    debit: purchase.grandTotal,
    credit: 0,
    reference: purchase.purchaseId,
  }]

  let txCredits = 0
  for (const tx of purchaseTxs) {
    txCredits += tx.amount
    rows.push({
      id: `tx-${tx.transactionId}`,
      date: toDate(tx.createdAt),
      description: `Payment${tx.paymentMode ? ` · ${tx.paymentMode.replace('_', ' ')}` : ''}${tx.remarks ? ` — ${tx.remarks}` : ''}`,
      type: 'payment',
      debit: 0,
      credit: tx.amount,
      reference: tx.transactionId,
      paymentMode: tx.paymentMode,
    })
  }

  const unrecordedPaid = (purchase.amountPaid ?? 0) - txCredits
  if (unrecordedPaid > 0.001) {
    rows.push({
      id: `purchase-paid-${purchase.purchaseId}`,
      date: toDate(purchase.createdAt),
      description: 'Payment made',
      type: 'payment',
      debit: 0,
      credit: unrecordedPaid,
      reference: purchase.purchaseId,
    })
  }

  rows.sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0))

  let balance = 0
  const withBalance = rows.map((row) => {
    balance += row.debit - row.credit
    return { ...row, balance }
  })

  return withBalance.reverse()
}

/**
 * Filter newest-first ledger rows to an activity period.
 * Prior activity becomes a single "Brought Forward" row so balances stay correct.
 */
export function filterLedgerRowsForPeriod(
  rowsNewestFirst: LedgerRow[],
  from?: Date,
  to?: Date
): LedgerRow[] {
  if (!from && !to) return rowsNewestFirst
  if (rowsNewestFirst.length === 0) return rowsNewestFirst

  const chronological = [...rowsNewestFirst].reverse()
  let broughtForward = 0
  const inPeriod: Omit<LedgerRow, 'balance'>[] = []

  for (const row of chronological) {
    const t = row.date?.getTime()
    const beforeFrom = from != null && (t == null || t < from.getTime())
    const afterTo = to != null && t != null && t > to.getTime()

    if (beforeFrom) {
      broughtForward = row.balance
      continue
    }
    if (afterTo) continue

    inPeriod.push({
      id: row.id,
      date: row.date,
      description: row.description,
      type: row.type,
      debit: row.debit,
      credit: row.credit,
      paymentMode: row.paymentMode,
      reference: row.reference,
    })
  }

  type RawRow = Omit<LedgerRow, 'balance'>
  const seeded: RawRow[] = []
  if (Math.abs(broughtForward) > 0.001) {
    seeded.push({
      id: 'brought-forward',
      date: from,
      description: 'Brought Forward',
      type: 'opening',
      debit: broughtForward > 0 ? broughtForward : 0,
      credit: broughtForward < 0 ? Math.abs(broughtForward) : 0,
      reference: 'brought-forward',
    })
  }
  seeded.push(...inPeriod)

  let balance = 0
  const withBalance = seeded.map((row) => {
    balance += row.debit - row.credit
    return { ...row, balance }
  })

  return withBalance.reverse()
}

/** List entries for registered customers from denormalized balances. */
export function buildExistingLedgerFromBalances(
  customers: Customer[],
  balances: CustomerBalance[],
  activityMonthKey?: string
): CustomerLedgerEntry[] {
  const balanceById = new Map(balances.map((b) => [b.customerId, b]))
  const customerById = new Map(customers.map((c) => [c.customerId, c]))

  const entries: CustomerLedgerEntry[] = []

  for (const balance of balances) {
    const customer = customerById.get(balance.customerId)
    if (!customer) continue

    const lastActivity = toDate(balance.lastActivityAt)
    const lastMonth = lastActivity ? toIstMonthKey(lastActivity) : undefined
    const inRange =
      !activityMonthKey
        ? true
        : balance.outstanding !== 0 || lastMonth === activityMonthKey

    if (!inRange) continue

    entries.push({
      key: customer.customerId,
      name: customer.name,
      phone: customer.phone,
      customerId: customer.customerId,
      isRegistered: true,
      totalBills: balance.billCount,
      totalBilled: balance.totalBilled,
      totalPaid: balance.totalPaid,
      outstanding: balance.outstanding,
      openingBalance: balance.openingBalance,
      customerCreatedAt: toDate(customer.createdAt),
      lastBillDate: lastActivity,
      bills: [],
      ledgerRows: [],
    })
  }

  // Opening-balance-only customers not yet in balances (migration gap)
  for (const customer of customers) {
    if (balanceById.has(customer.customerId)) continue
    const ob = customer.openingBalance ?? 0
    if (ob <= 0) continue
    const created = toDate(customer.createdAt)
    const createdMonth = created ? toIstMonthKey(created) : undefined
    if (activityMonthKey && createdMonth !== activityMonthKey) continue
    entries.push({
      key: customer.customerId,
      name: customer.name,
      phone: customer.phone,
      customerId: customer.customerId,
      isRegistered: true,
      totalBills: 0,
      totalBilled: ob,
      totalPaid: 0,
      outstanding: ob,
      openingBalance: ob,
      customerCreatedAt: created,
      lastBillDate: created,
      bills: [],
      ledgerRows: [],
    })
  }

  return entries.sort((a, b) => Math.abs(b.outstanding) - Math.abs(a.outstanding))
}

export function buildNewCustomerLedger(
  bills: Bill[],
  registeredIds: Set<string>
): CustomerLedgerEntry[] {
  return bills
    .filter((b) => !b.customerId || !registeredIds.has(b.customerId))
    .map((bill) => ({
      key: bill.billId,
      name: bill.customerInfo?.name ?? 'Unknown Customer',
      phone: bill.customerInfo?.phone || '—',
      billNumber: bill.billNumber,
      isRegistered: false,
      totalBills: 1,
      totalBilled: bill.grandTotal,
      totalPaid: bill.amountPaid,
      outstanding: bill.remainingAmount,
      lastBillDate: billActivityDate(bill),
      bills: [bill],
      ledgerRows: [],
    }))
    .sort((a, b) => (b.lastBillDate?.getTime() ?? 0) - (a.lastBillDate?.getTime() ?? 0))
}

export function buildVendorLedger(purchases: PurchaseInvoice[]): CustomerLedgerEntry[] {
  return purchases
    .filter((p) => p.status === 'SAVED' && p.vendorType === 'new')
    .map((purchase) => {
      const outstanding = Math.max(0, purchase.remainingAmount ?? purchase.grandTotal - (purchase.amountPaid ?? 0))
      const totalPaid = purchase.amountPaid ?? purchase.grandTotal - outstanding
      return {
        key: purchase.purchaseId,
        purchaseId: purchase.purchaseId,
        name: purchase.vendorInfo?.name ?? 'Unknown Vendor',
        phone: purchase.vendorInfo?.phone || '—',
        billNumber: purchase.purchaseNumber,
        isRegistered: false,
        totalBills: 1,
        totalBilled: purchase.grandTotal,
        totalPaid,
        outstanding,
        lastBillDate: toDate(purchase.createdAt) ?? (purchase.purchaseDate ? new Date(purchase.purchaseDate) : undefined),
        bills: [],
        purchases: [purchase],
        ledgerRows: [],
      }
    })
    .sort((a, b) => (b.lastBillDate?.getTime() ?? 0) - (a.lastBillDate?.getTime() ?? 0))
}

export function matchesLedgerSearch(entry: CustomerLedgerEntry, q: string): boolean {
  const name = (entry.name ?? '').toLowerCase()
  const phone = entry.phone ?? ''
  const phoneDigits = phone.replace(/\D/g, '')
  const qDigits = q.replace(/\D/g, '')
  const billMatch = entry.billNumber?.toLowerCase().includes(q)

  if (name.includes(q)) return true
  if (billMatch) return true
  if (qDigits.length >= 3) return phoneDigits.includes(qDigits)
  return phone.toLowerCase().includes(q)
}
