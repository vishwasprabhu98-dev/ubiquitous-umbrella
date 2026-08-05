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
} from 'firebase/firestore'
import { db } from '@/firebase/config'
import { COLLECTIONS } from '@/firebase/collections'
import { settingsRepository } from './settingsRepository'
import { sanitizeFirestoreData } from '@/lib/firestoreUtils'
import type { PurchaseInvoice } from '@/types'

const purchasesRef = () => collection(db, COLLECTIONS.PURCHASES)

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
    return { ...data, purchaseId: docRef.id, createdAt: serverTimestamp() } as PurchaseInvoice
  },

  async update(purchaseId: string, data: Partial<Omit<PurchaseInvoice, 'purchaseId' | 'createdAt'>>): Promise<void> {
    const clean = sanitizeFirestoreData({
      ...data,
      ...(data.vendorInfo
        ? { vendorInfo: sanitizeFirestoreData(data.vendorInfo as unknown as Record<string, unknown>) }
        : {}),
      updatedAt: serverTimestamp(),
    } as Record<string, unknown>)
    await updateDoc(doc(db, COLLECTIONS.PURCHASES, purchaseId), clean)
  },

  async delete(purchaseId: string): Promise<void> {
    await deleteDoc(doc(db, COLLECTIONS.PURCHASES, purchaseId))
  },

  async generatePurchaseNumber(): Promise<string> {
    return settingsRepository.generateAndIncrementPurchaseNumber()
  },
}
