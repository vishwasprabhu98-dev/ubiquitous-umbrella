import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  serverTimestamp,
  query,
  orderBy,
  where,
  Timestamp,
  limit,
  startAfter,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore'
import { db } from '@/firebase/config'
import { COLLECTIONS } from '@/firebase/collections'
import { settingsRepository } from './settingsRepository'
import { sanitizeFirestoreData } from '@/lib/firestoreUtils'
import { customerBalanceRepository } from './customerBalanceRepository'
import type { Bill } from '@/types'

const billsRef = () => collection(db, COLLECTIONS.BILLS)

async function syncBalance(customerId?: string | null) {
  if (!customerId) return
  await customerBalanceRepository.refresh(customerId)
}

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

export const billRepository = {
  async getAll(): Promise<Bill[]> {
    const q = query(billsRef(), orderBy('createdAt', 'desc'))
    const snapshot = await getDocs(q)
    return snapshot.docs.map((d) => ({ ...d.data(), billId: d.id }) as Bill)
  },

  async getById(billId: string): Promise<Bill | null> {
    const snapshot = await getDoc(doc(db, COLLECTIONS.BILLS, billId))
    if (!snapshot.exists()) return null
    return { ...snapshot.data(), billId: snapshot.id } as Bill
  },

  async getByCustomer(customerId: string): Promise<Bill[]> {
    // Equality-only query (no composite index). Sort client-side.
    const q = query(billsRef(), where('customerId', '==', customerId))
    const snapshot = await getDocs(q)
    return snapshot.docs
      .map((d) => ({ ...d.data(), billId: d.id }) as Bill)
      .sort((a, b) => createdAtMs(b.createdAt) - createdAtMs(a.createdAt))
  },

  /** Prefer indexed range query; fall back to customer fetch + client filter if index missing. */
  async getByCustomerInRange(customerId: string, from: Date, to: Date): Promise<Bill[]> {
    try {
      const q = query(
        billsRef(),
        where('customerId', '==', customerId),
        where('createdAt', '>=', Timestamp.fromDate(from)),
        where('createdAt', '<=', Timestamp.fromDate(to)),
        orderBy('createdAt', 'desc')
      )
      const snapshot = await getDocs(q)
      return snapshot.docs.map((d) => ({ ...d.data(), billId: d.id }) as Bill)
    } catch (err) {
      const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : ''
      if (code !== 'failed-precondition') throw err
      const all = await this.getByCustomer(customerId)
      return all.filter((b) => inCreatedAtRange(b.createdAt, from, to))
    }
  },
  async getByDateRange(from: Date, to: Date): Promise<Bill[]> {
    const q = query(
      billsRef(),
      where('createdAt', '>=', Timestamp.fromDate(from)),
      where('createdAt', '<=', Timestamp.fromDate(to)),
      orderBy('createdAt', 'desc')
    )
    const snapshot = await getDocs(q)
    return snapshot.docs.map((d) => ({ ...d.data(), billId: d.id }) as Bill)
  },

  async getByDateRangePage(
    from: Date,
    to: Date,
    pageSize: number,
    cursor?: QueryDocumentSnapshot<DocumentData>
  ): Promise<{ bills: Bill[]; lastDoc: QueryDocumentSnapshot<DocumentData> | null }> {
    const constraints = [
      where('createdAt', '>=', Timestamp.fromDate(from)),
      where('createdAt', '<=', Timestamp.fromDate(to)),
      orderBy('createdAt', 'desc'),
      limit(pageSize),
    ]
    const q = cursor
      ? query(billsRef(), ...constraints.slice(0, 3), startAfter(cursor), limit(pageSize))
      : query(billsRef(), ...constraints)
    const snapshot = await getDocs(q)
    const bills = snapshot.docs.map((d) => ({ ...d.data(), billId: d.id }) as Bill)
    const lastDoc = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null
    return { bills, lastDoc }
  },

  async create(data: Omit<Bill, 'billId' | 'createdAt'>): Promise<Bill> {
    const clean = sanitizeFirestoreData({
      ...data,
      customerInfo: sanitizeFirestoreData(data.customerInfo as unknown as Record<string, unknown>),
    } as Record<string, unknown>)
    const docRef = await addDoc(billsRef(), {
      ...clean,
      createdAt: serverTimestamp(),
    })
    await syncBalance(data.customerId)
    return { ...data, billId: docRef.id, createdAt: serverTimestamp() } as Bill
  },

  async update(billId: string, data: Partial<Bill>): Promise<void> {
    const existing = await this.getById(billId)
    const clean = sanitizeFirestoreData(data as Record<string, unknown>)
    await updateDoc(doc(db, COLLECTIONS.BILLS, billId), clean)
    const customerId = data.customerId ?? existing?.customerId
    await syncBalance(customerId)
    if (existing?.customerId && data.customerId && data.customerId !== existing.customerId) {
      await syncBalance(existing.customerId)
    }
  },

  async generateBillNumber(): Promise<string> {
    return settingsRepository.generateAndIncrementBillNumber()
  },
}
