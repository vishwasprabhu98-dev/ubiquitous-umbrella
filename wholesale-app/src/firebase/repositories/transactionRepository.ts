import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  Timestamp,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore'
import { db } from '@/firebase/config'
import { COLLECTIONS } from '@/firebase/collections'
import { sanitizeFirestoreData } from '@/lib/firestoreUtils'
import { customerBalanceRepository } from './customerBalanceRepository'
import type { Transaction } from '@/types'

const transactionsRef = () => collection(db, COLLECTIONS.TRANSACTIONS)

function createdAtMs(value: { toMillis?: () => number } | undefined): number {
  return value?.toMillis?.() ?? 0
}

function inCreatedAtRange(
  createdAt: { toMillis?: () => number } | undefined,
  from: Date,
  to: Date
): boolean {
  const t = createdAtMs(createdAt)
  return t >= from.getTime() && t <= to.getTime()
}

export const transactionRepository = {
  async getAll(): Promise<Transaction[]> {
    const q = query(transactionsRef(), orderBy('createdAt', 'desc'))
    const snapshot = await getDocs(q)
    return snapshot.docs.map((d) => ({ ...d.data(), transactionId: d.id }) as Transaction)
  },

  async getByDateRange(from: Date, to: Date): Promise<Transaction[]> {
    try {
      const q = query(
        transactionsRef(),
        where('createdAt', '>=', Timestamp.fromDate(from)),
        where('createdAt', '<=', Timestamp.fromDate(to)),
        orderBy('createdAt', 'desc')
      )
      const snapshot = await getDocs(q)
      return snapshot.docs.map((d) => ({ ...d.data(), transactionId: d.id }) as Transaction)
    } catch (err) {
      const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : ''
      if (code !== 'failed-precondition') throw err
      const all = await this.getAll()
      return all.filter((tx) => inCreatedAtRange(tx.createdAt, from, to))
    }
  },

  async getByBill(billId: string): Promise<Transaction[]> {
    const q = query(transactionsRef(), where('billId', '==', billId))
    const snapshot = await getDocs(q)
    return snapshot.docs.map((d) => ({ ...d.data(), transactionId: d.id }) as Transaction)
  },

  async getByCustomer(customerId: string): Promise<Transaction[]> {
    const q = query(transactionsRef(), where('customerId', '==', customerId))
    const snapshot = await getDocs(q)
    return snapshot.docs
      .map((d) => ({ ...d.data(), transactionId: d.id }) as Transaction)
      .sort((a, b) => createdAtMs(b.createdAt) - createdAtMs(a.createdAt))
  },

  async getByCustomerInRange(customerId: string, from: Date, to: Date): Promise<Transaction[]> {
    try {
      const q = query(
        transactionsRef(),
        where('customerId', '==', customerId),
        where('createdAt', '>=', Timestamp.fromDate(from)),
        where('createdAt', '<=', Timestamp.fromDate(to)),
        orderBy('createdAt', 'desc')
      )
      const snapshot = await getDocs(q)
      return snapshot.docs.map((d) => ({ ...d.data(), transactionId: d.id }) as Transaction)
    } catch (err) {
      const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : ''
      if (code !== 'failed-precondition') throw err
      const all = await this.getByCustomer(customerId)
      return all.filter((tx) => inCreatedAtRange(tx.createdAt, from, to))
    }
  },

  async getByPurchase(purchaseId: string): Promise<Transaction[]> {
    const q = query(transactionsRef(), where('purchaseId', '==', purchaseId))
    const snapshot = await getDocs(q)
    return snapshot.docs
      .map((d) => ({ ...d.data(), transactionId: d.id }) as Transaction)
      .sort((a, b) => createdAtMs(b.createdAt) - createdAtMs(a.createdAt))
  },
  /** Transactions for a purchase (by purchaseId or legacy billId = purchaseId). */
  async getForPurchase(purchaseId: string): Promise<Transaction[]> {
    const [byPurchase, byBill] = await Promise.all([
      this.getByPurchase(purchaseId).catch(() => [] as Transaction[]),
      this.getByBill(purchaseId),
    ])
    const seen = new Set<string>()
    const merged: Transaction[] = []
    for (const tx of [...byPurchase, ...byBill]) {
      if (seen.has(tx.transactionId)) continue
      seen.add(tx.transactionId)
      merged.push(tx)
    }
    return merged
  },

  async getByCustomerPage(
    customerId: string,
    pageSize: number,
    cursor?: QueryDocumentSnapshot<DocumentData>
  ): Promise<{ transactions: Transaction[]; lastDoc: QueryDocumentSnapshot<DocumentData> | null }> {
    const base = [
      where('customerId', '==', customerId),
      orderBy('createdAt', 'desc'),
    ] as const
    const q = cursor
      ? query(transactionsRef(), ...base, startAfter(cursor), limit(pageSize))
      : query(transactionsRef(), ...base, limit(pageSize))
    const snapshot = await getDocs(q)
    return {
      transactions: snapshot.docs.map((d) => ({ ...d.data(), transactionId: d.id }) as Transaction),
      lastDoc: snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null,
    }
  },

  async create(data: Omit<Transaction, 'transactionId' | 'createdAt'>): Promise<Transaction> {
    const clean = sanitizeFirestoreData(data as Record<string, unknown>)
    const docRef = await addDoc(transactionsRef(), {
      ...clean,
      createdAt: serverTimestamp(),
    })
    if (data.customerId) {
      await customerBalanceRepository.refresh(data.customerId)
    }
    return { ...data, transactionId: docRef.id, createdAt: serverTimestamp() } as Transaction
  },
}
