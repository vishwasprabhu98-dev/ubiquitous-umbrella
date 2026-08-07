import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
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
import type { PurchaseInvoice } from '@/types'

const purchasesRef = () => collection(db, COLLECTIONS.PURCHASES)

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

export const purchaseRepository = {
  async getAll(): Promise<PurchaseInvoice[]> {
    const q = query(purchasesRef(), orderBy('createdAt', 'desc'))
    const snapshot = await getDocs(q)
    return snapshot.docs.map((d) => ({ ...d.data(), purchaseId: d.id }) as PurchaseInvoice)
  },

  async getById(purchaseId: string): Promise<PurchaseInvoice | null> {
    const snapshot = await getDoc(doc(db, COLLECTIONS.PURCHASES, purchaseId))
    if (!snapshot.exists()) return null
    return { ...snapshot.data(), purchaseId: snapshot.id } as PurchaseInvoice
  },

  async getByCustomer(customerId: string): Promise<PurchaseInvoice[]> {
    const q = query(purchasesRef(), where('customerId', '==', customerId))
    const snapshot = await getDocs(q)
    return snapshot.docs
      .map((d) => ({ ...d.data(), purchaseId: d.id }) as PurchaseInvoice)
      .sort((a, b) => createdAtMs(b.createdAt) - createdAtMs(a.createdAt))
  },

  async getByCustomerInRange(customerId: string, from: Date, to: Date): Promise<PurchaseInvoice[]> {
    try {
      const q = query(
        purchasesRef(),
        where('customerId', '==', customerId),
        where('createdAt', '>=', Timestamp.fromDate(from)),
        where('createdAt', '<=', Timestamp.fromDate(to)),
        orderBy('createdAt', 'desc')
      )
      const snapshot = await getDocs(q)
      return snapshot.docs.map((d) => ({ ...d.data(), purchaseId: d.id }) as PurchaseInvoice)
    } catch (err) {
      const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : ''
      if (code !== 'failed-precondition') throw err
      const all = await this.getByCustomer(customerId)
      return all.filter((p) => inCreatedAtRange(p.createdAt, from, to))
    }
  },

  async getVendorPurchasesByDateRange(from: Date, to: Date): Promise<PurchaseInvoice[]> {
    try {
      const q = query(
        purchasesRef(),
        where('vendorType', '==', 'new'),
        where('createdAt', '>=', Timestamp.fromDate(from)),
        where('createdAt', '<=', Timestamp.fromDate(to)),
        orderBy('createdAt', 'desc')
      )
      const snapshot = await getDocs(q)
      return snapshot.docs
        .map((d) => ({ ...d.data(), purchaseId: d.id }) as PurchaseInvoice)
        .filter((p) => p.status === 'SAVED')
    } catch (err) {
      const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : ''
      if (code !== 'failed-precondition') throw err
      const all = await this.getAll()
      return all.filter(
        (p) =>
          p.status === 'SAVED' &&
          p.vendorType === 'new' &&
          inCreatedAtRange(p.createdAt, from, to)
      )
    }
  },

  async getVendorPurchasesPage(
    from: Date,
    to: Date,
    pageSize: number,
    cursor?: QueryDocumentSnapshot<DocumentData>
  ): Promise<{ purchases: PurchaseInvoice[]; lastDoc: QueryDocumentSnapshot<DocumentData> | null }> {
    const base = [
      where('vendorType', '==', 'new'),
      where('createdAt', '>=', Timestamp.fromDate(from)),
      where('createdAt', '<=', Timestamp.fromDate(to)),
      orderBy('createdAt', 'desc'),
    ] as const
    const q = cursor
      ? query(purchasesRef(), ...base, startAfter(cursor), limit(pageSize))
      : query(purchasesRef(), ...base, limit(pageSize))
    const snapshot = await getDocs(q)
    const purchases = snapshot.docs
      .map((d) => ({ ...d.data(), purchaseId: d.id }) as PurchaseInvoice)
      .filter((p) => p.status === 'SAVED')
    return {
      purchases,
      lastDoc: snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null,
    }
  },

  async create(data: Omit<PurchaseInvoice, 'purchaseId' | 'createdAt'>): Promise<PurchaseInvoice> {
    const clean = sanitizeFirestoreData({
      ...data,
      vendorInfo: sanitizeFirestoreData(data.vendorInfo as unknown as Record<string, unknown>),
    } as Record<string, unknown>)
    const docRef = await addDoc(purchasesRef(), {
      ...clean,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    await syncBalance(data.customerId)
    return { ...data, purchaseId: docRef.id, createdAt: serverTimestamp() } as PurchaseInvoice
  },

  async update(purchaseId: string, data: Partial<Omit<PurchaseInvoice, 'purchaseId' | 'createdAt'>>): Promise<void> {
    const existing = await this.getById(purchaseId)
    const clean = sanitizeFirestoreData({
      ...data,
      ...(data.vendorInfo
        ? { vendorInfo: sanitizeFirestoreData(data.vendorInfo as unknown as Record<string, unknown>) }
        : {}),
      updatedAt: serverTimestamp(),
    } as Record<string, unknown>)
    await updateDoc(doc(db, COLLECTIONS.PURCHASES, purchaseId), clean)
    await syncBalance(data.customerId ?? existing?.customerId)
    if (existing?.customerId && data.customerId && data.customerId !== existing.customerId) {
      await syncBalance(existing.customerId)
    }
  },

  async delete(purchaseId: string): Promise<void> {
    const existing = await this.getById(purchaseId)
    await deleteDoc(doc(db, COLLECTIONS.PURCHASES, purchaseId))
    await syncBalance(existing?.customerId)
  },

  async generatePurchaseNumber(): Promise<string> {
    return settingsRepository.generateAndIncrementPurchaseNumber()
  },
}
