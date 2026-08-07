import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from 'firebase/firestore'
import { db } from '@/firebase/config'
import { COLLECTIONS } from '@/firebase/collections'
import { sanitizeFirestoreData } from '@/lib/firestoreUtils'
import { previousMonthKey, toIstMonthKey } from '@/lib/istDate'
import { LEDGER_PAYMENT_REF } from './customerBalanceRepository.constants'
import type { Bill, Customer, CustomerBalance, CustomerMonthlySnapshot, PurchaseInvoice, Transaction } from '@/types'

export { LEDGER_PAYMENT_REF } from './customerBalanceRepository.constants'

const balancesRef = () => collection(db, COLLECTIONS.CUSTOMER_BALANCES)

function snapshotsRef(customerId: string) {
  return collection(db, COLLECTIONS.CUSTOMER_BALANCES, customerId, 'monthlySnapshots')
}

function toDate(ts: unknown): Date | undefined {
  if (!ts) return undefined
  if (ts instanceof Date) return ts
  if (typeof ts === 'object' && 'toDate' in (ts as object)) {
    return (ts as { toDate: () => Date }).toDate()
  }
  return undefined
}

async function fetchCustomerBills(customerId: string): Promise<Bill[]> {
  const q = query(
    collection(db, COLLECTIONS.BILLS),
    where('customerId', '==', customerId)
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => ({ ...d.data(), billId: d.id }) as Bill)
}

async function fetchCustomerTransactions(customerId: string): Promise<Transaction[]> {
  const q = query(
    collection(db, COLLECTIONS.TRANSACTIONS),
    where('customerId', '==', customerId)
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => ({ ...d.data(), transactionId: d.id }) as Transaction)
}

async function fetchCustomerPurchases(customerId: string): Promise<PurchaseInvoice[]> {
  const q = query(
    collection(db, COLLECTIONS.PURCHASES),
    where('customerId', '==', customerId)
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => ({ ...d.data(), purchaseId: d.id }) as PurchaseInvoice)
}

function computeBalance(
  customerId: string,
  customer: Customer,
  bills: Bill[],
  transactions: Transaction[],
  purchases: PurchaseInvoice[]
): CustomerBalance {
  const openingBalance = Math.max(0, customer.openingBalance ?? 0)
  const savedPurchases = purchases.filter(
    (p) => p.status === 'SAVED' && (p.vendorType === 'customer' || !!p.customerId)
  )

  const billsTotal = bills.reduce((s, b) => s + (b.grandTotal ?? 0), 0)
  const billLevelPaid = bills.reduce((s, b) => s + (b.amountPaid ?? 0), 0)
  const ledgerPaid = transactions
    .filter((tx) => tx.billId === LEDGER_PAYMENT_REF)
    .reduce((s, tx) => s + tx.amount, 0)
  const purchaseCredits = savedPurchases.reduce((s, p) => s + (p.grandTotal ?? 0), 0)

  const totalBilled = billsTotal + openingBalance
  const totalPaid = billLevelPaid + ledgerPaid
  const outstanding = Math.max(0, openingBalance + billsTotal - totalPaid - purchaseCredits)

  const activityTimes: number[] = []
  const created = toDate(customer.createdAt)
  if (created) activityTimes.push(created.getTime())
  for (const b of bills) {
    const d = toDate(b.createdAt)
    if (d) activityTimes.push(d.getTime())
  }
  for (const tx of transactions) {
    const d = toDate(tx.createdAt)
    if (d) activityTimes.push(d.getTime())
  }
  for (const p of savedPurchases) {
    const d = toDate(p.createdAt)
    if (d) activityTimes.push(d.getTime())
  }

  const lastMs = activityTimes.length ? Math.max(...activityTimes) : undefined

  return {
    customerId,
    openingBalance,
    totalBilled,
    totalPaid,
    purchaseCredits,
    outstanding,
    billCount: bills.length,
    lastActivityAt: lastMs != null ? Timestamp.fromDate(new Date(lastMs)) : undefined,
  }
}

type LedgerEvent = { date: Date; delta: number }

/** Build month-end closing balances (IST month keys) from full history. */
function computeMonthlyClosings(
  customer: Customer,
  bills: Bill[],
  transactions: Transaction[],
  purchases: PurchaseInvoice[]
): Map<string, number> {
  const events: LedgerEvent[] = []
  const openingBalance = Math.max(0, customer.openingBalance ?? 0)
  const openingDate = toDate(customer.createdAt) ?? new Date(0)
  if (openingBalance > 0) {
    events.push({ date: openingDate, delta: openingBalance })
  }

  const billIds = new Set(bills.map((b) => b.billId))
  const txByBill: Record<string, Transaction[]> = {}
  for (const tx of transactions) {
    if (billIds.has(tx.billId)) {
      if (!txByBill[tx.billId]) txByBill[tx.billId] = []
      txByBill[tx.billId].push(tx)
    }
  }

  for (const bill of bills) {
    const d = toDate(bill.createdAt) ?? new Date(0)
    events.push({ date: d, delta: bill.grandTotal })
    const billTxs = txByBill[bill.billId] ?? []
    let txCredits = 0
    for (const tx of billTxs) {
      txCredits += tx.amount
      events.push({ date: toDate(tx.createdAt) ?? d, delta: -tx.amount })
    }
    const unrecorded = bill.amountPaid - txCredits
    if (unrecorded > 0.001) {
      events.push({ date: d, delta: -unrecorded })
    }
  }

  for (const tx of transactions) {
    if (tx.billId === LEDGER_PAYMENT_REF && tx.customerId === customer.customerId) {
      events.push({ date: toDate(tx.createdAt) ?? new Date(0), delta: -tx.amount })
    }
  }

  for (const purchase of purchases) {
    if (purchase.status !== 'SAVED') continue
    events.push({
      date: toDate(purchase.createdAt) ?? new Date(0),
      delta: -purchase.grandTotal,
    })
  }

  events.sort((a, b) => a.date.getTime() - b.date.getTime())

  const closings = new Map<string, number>()
  let balance = 0
  for (const ev of events) {
    balance += ev.delta
    closings.set(toIstMonthKey(ev.date), balance)
  }

  // Carry forward across gap months between first and last activity
  const keys = [...closings.keys()].sort()
  if (keys.length >= 2) {
    let cursor = keys[0]
    let last = closings.get(cursor) ?? 0
    const end = keys[keys.length - 1]
    while (cursor < end) {
      const next = (() => {
        const [y, m] = cursor.split('-').map(Number)
        return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
      })()
      if (!closings.has(next)) closings.set(next, last)
      else last = closings.get(next) ?? last
      cursor = next
    }
  }

  return closings
}

async function writeMonthlySnapshots(customerId: string, closings: Map<string, number>) {
  const existing = await getDocs(snapshotsRef(customerId))
  const existingKeys = new Set(existing.docs.map((d) => d.id))

  const entries = [...closings.entries()]
  // Firestore batches max 500
  for (let i = 0; i < entries.length; i += 400) {
    const batch = writeBatch(db)
    for (const [monthKey, closingBalance] of entries.slice(i, i + 400)) {
      batch.set(
        doc(db, COLLECTIONS.CUSTOMER_BALANCES, customerId, 'monthlySnapshots', monthKey),
        sanitizeFirestoreData({
          monthKey,
          closingBalance,
          updatedAt: serverTimestamp(),
        } as Record<string, unknown>),
        { merge: true }
      )
      existingKeys.delete(monthKey)
    }
    await batch.commit()
  }

  // Remove stale snapshot months no longer in history (optional cleanup)
  const stale = [...existingKeys]
  for (let i = 0; i < stale.length; i += 400) {
    const batch = writeBatch(db)
    for (const key of stale.slice(i, i + 400)) {
      batch.delete(doc(db, COLLECTIONS.CUSTOMER_BALANCES, customerId, 'monthlySnapshots', key))
    }
    await batch.commit()
  }
}

export const customerBalanceRepository = {
  async getAll(): Promise<CustomerBalance[]> {
    const q = query(balancesRef(), orderBy('outstanding', 'desc'))
    const snapshot = await getDocs(q)
    return snapshot.docs.map((d) => ({ ...d.data(), customerId: d.id }) as CustomerBalance)
  },

  async get(customerId: string): Promise<CustomerBalance | null> {
    const snapshot = await getDoc(doc(db, COLLECTIONS.CUSTOMER_BALANCES, customerId))
    if (!snapshot.exists()) return null
    return { ...snapshot.data(), customerId: snapshot.id } as CustomerBalance
  },

  async getMonthlySnapshot(
    customerId: string,
    monthKey: string
  ): Promise<CustomerMonthlySnapshot | null> {
    const snapshot = await getDoc(
      doc(db, COLLECTIONS.CUSTOMER_BALANCES, customerId, 'monthlySnapshots', monthKey)
    )
    if (!snapshot.exists()) return null
    return { ...snapshot.data(), monthKey: snapshot.id } as CustomerMonthlySnapshot
  },

  /**
   * Balance brought into `monthKey` = previous month's closing snapshot.
   * Walks back up to 36 months; falls back to customer openingBalance if dated before this month.
   */
  async getBroughtForward(customerId: string, monthKey: string): Promise<number> {
    let cursor = previousMonthKey(monthKey)
    for (let i = 0; i < 36 && cursor; i++) {
      const snap = await this.getMonthlySnapshot(customerId, cursor)
      if (snap) return snap.closingBalance
      cursor = previousMonthKey(cursor)
    }

    const customerSnap = await getDoc(doc(db, COLLECTIONS.CUSTOMERS, customerId))
    if (!customerSnap.exists()) return 0
    const customer = { ...customerSnap.data(), customerId } as Customer
    const ob = Math.max(0, customer.openingBalance ?? 0)
    if (ob <= 0) return 0
    const created = toDate(customer.createdAt)
    if (!created) return ob
    const obMonth = toIstMonthKey(created)
    return obMonth < monthKey ? ob : 0
  },

  /** Recompute and upsert balance + monthly snapshots for one customer. */
  async refresh(customerId: string | undefined | null): Promise<CustomerBalance | null> {
    if (!customerId) return null

    const customerSnap = await getDoc(doc(db, COLLECTIONS.CUSTOMERS, customerId))
    if (!customerSnap.exists()) {
      await deleteDoc(doc(db, COLLECTIONS.CUSTOMER_BALANCES, customerId)).catch(() => undefined)
      return null
    }

    const customer = { ...customerSnap.data(), customerId } as Customer
    const [bills, transactions, purchases] = await Promise.all([
      fetchCustomerBills(customerId),
      fetchCustomerTransactions(customerId),
      fetchCustomerPurchases(customerId),
    ])

    const balance = computeBalance(customerId, customer, bills, transactions, purchases)
    const hasActivity =
      balance.openingBalance > 0 ||
      balance.billCount > 0 ||
      balance.totalPaid > 0 ||
      balance.purchaseCredits > 0

    const ref = doc(db, COLLECTIONS.CUSTOMER_BALANCES, customerId)
    if (!hasActivity) {
      await deleteDoc(ref).catch(() => undefined)
      return null
    }

    await setDoc(
      ref,
      sanitizeFirestoreData({
        ...balance,
        updatedAt: serverTimestamp(),
      } as Record<string, unknown>),
      { merge: true }
    )

    const closings = computeMonthlyClosings(customer, bills, transactions, purchases)
    await writeMonthlySnapshots(customerId, closings)

    return balance
  },

  /** One-time / repair: refresh every customer. */
  async rebuildAll(): Promise<number> {
    const snapshot = await getDocs(collection(db, COLLECTIONS.CUSTOMERS))
    let count = 0
    for (const d of snapshot.docs) {
      await this.refresh(d.id)
      count++
    }
    const metaRef = doc(db, COLLECTIONS.SETTINGS, 'customerBalancesMeta')
    await setDoc(
      metaRef,
      { migrated: true, migratedAt: serverTimestamp() },
      { merge: true }
    )
    return count
  },

  async ensureBuilt(customers: Customer[]): Promise<CustomerBalance[]> {
    let balances = await this.getAll()
    const balanceIds = new Set(balances.map((b) => b.customerId))
    const missing = customers.filter((c) => {
      if (balanceIds.has(c.customerId)) return false
      return (c.openingBalance ?? 0) > 0
    })

    const metaRef = doc(db, COLLECTIONS.SETTINGS, 'customerBalancesMeta')
    const metaSnap = await getDoc(metaRef)
    const migrated = metaSnap.exists() && metaSnap.data()?.migrated === true

    if (!migrated) {
      await this.rebuildAll()
      await setDoc(
        metaRef,
        { migrated: true, migratedAt: serverTimestamp() },
        { merge: true }
      )
      return this.getAll()
    }

    for (const c of missing) {
      await this.refresh(c.customerId)
    }

    if (missing.length > 0) {
      balances = await this.getAll()
    }
    return balances
  },
}
