import { billRepository } from '@/firebase/repositories/billRepository'
import { customerRepository } from '@/firebase/repositories/customerRepository'
import { customerBalanceRepository } from '@/firebase/repositories/customerBalanceRepository'
import { purchaseRepository } from '@/firebase/repositories/purchaseRepository'
import { transactionRepository } from '@/firebase/repositories/transactionRepository'
import {
  buildLedgerRows,
  buildVendorPurchaseRows,
  toDate,
  type CustomerLedgerEntry,
  type LedgerDetailData,
} from '@/lib/ledgerBuild'
import { istMonthBounds, toIstMonthKey } from '@/lib/istDate'
import type { PurchaseInvoice, Transaction } from '@/types'

export function ledgerDetailQueryKey(
  entry: CustomerLedgerEntry,
  monthKey?: string
) {
  return [
    'ledger-detail',
    entry.key,
    entry.customerId ?? null,
    entry.purchaseId ?? null,
    monthKey ?? 'all',
  ] as const
}

async function safePurchasesInRange(
  customerId: string,
  from: Date,
  to: Date
): Promise<PurchaseInvoice[]> {
  try {
    return await purchaseRepository.getByCustomerInRange(customerId, from, to)
  } catch {
    return []
  }
}

async function safeTransactionsInRange(
  customerId: string,
  from: Date,
  to: Date
): Promise<Transaction[]> {
  try {
    return await transactionRepository.getByCustomerInRange(customerId, from, to)
  } catch {
    return []
  }
}

export interface LedgerPeriod {
  monthKey: string
}

/** Fetch history for one entry — scoped to a month when provided. */
export async function loadLedgerDetail(
  entry: CustomerLedgerEntry,
  period?: LedgerPeriod
): Promise<LedgerDetailData> {
  if (entry.isRegistered && entry.customerId) {
    const customerId = entry.customerId
    const monthKey = period?.monthKey
    const bounds = monthKey ? istMonthBounds(monthKey) : null

    if (bounds && monthKey) {
      const [customer, bills, transactions, purchases, broughtForward] = await Promise.all([
        customerRepository.getById(customerId),
        billRepository.getByCustomerInRange(customerId, bounds.from, bounds.to),
        safeTransactionsInRange(customerId, bounds.from, bounds.to),
        safePurchasesInRange(customerId, bounds.from, bounds.to),
        customerBalanceRepository.getBroughtForward(customerId, monthKey, {
          openingBalance: entry.openingBalance,
          createdAt: entry.customerCreatedAt,
        }),
      ])

      const openingBalance = Math.max(0, customer?.openingBalance ?? entry.openingBalance ?? 0)
      const created = toDate(customer?.createdAt ?? entry.customerCreatedAt)
      const openingMonth = created ? toIstMonthKey(created) : null
      const openingInThisMonth = openingBalance > 0 && openingMonth === monthKey

      let seedAmount = broughtForward
      let seedKind: 'opening' | 'broughtForward' = 'broughtForward'
      let seedDate: Date | undefined = bounds.from

      if (openingInThisMonth) {
        // Opening falls in this month — never mix with brought forward (avoids double-count).
        seedAmount = openingBalance
        seedKind = 'opening'
        seedDate = created
      }

      const ledgerRows = buildLedgerRows(
        bills,
        transactions,
        customerId,
        purchases.filter((p) => p.status === 'SAVED'),
        seedAmount,
        seedDate,
        seedKind
      )
      return { ledgerRows, bills, purchases, transactions }
    }

    // Full history (share / no period)
    const [customer, bills, transactions, purchases] = await Promise.all([
      customerRepository.getById(customerId),
      billRepository.getByCustomer(customerId),
      transactionRepository.getByCustomer(customerId).catch(() => [] as Transaction[]),
      purchaseRepository.getByCustomer(customerId).catch(() => [] as PurchaseInvoice[]),
    ])
    const openingBalance = customer?.openingBalance ?? entry.openingBalance ?? 0
    const ledgerRows = buildLedgerRows(
      bills,
      transactions,
      customerId,
      purchases.filter((p) => p.status === 'SAVED'),
      openingBalance,
      toDate(customer?.createdAt),
      'opening'
    )
    return { ledgerRows, bills, purchases, transactions }
  }

  if (entry.purchaseId) {
    const purchase =
      entry.purchases?.[0] ?? (await purchaseRepository.getById(entry.purchaseId))
    if (!purchase) {
      return { ledgerRows: [], bills: [], purchases: [], transactions: [] }
    }
    const transactions = await transactionRepository.getForPurchase(purchase.purchaseId)
    return {
      ledgerRows: buildVendorPurchaseRows(purchase, transactions),
      bills: [],
      purchases: [purchase],
      transactions,
    }
  }

  const billId = entry.bills[0]?.billId ?? entry.key
  const bill = entry.bills[0] ?? (await billRepository.getById(billId))
  if (!bill) {
    return { ledgerRows: [], bills: [], purchases: [], transactions: [] }
  }
  const transactions = await transactionRepository.getByBill(bill.billId)
  return {
    ledgerRows: buildLedgerRows([bill], transactions),
    bills: [bill],
    purchases: [],
    transactions,
  }
}

export function mergeEntryWithDetail(
  entry: CustomerLedgerEntry,
  detail: LedgerDetailData
): CustomerLedgerEntry {
  return {
    ...entry,
    bills: detail.bills,
    purchases: detail.purchases,
    ledgerRows: detail.ledgerRows,
  }
}
