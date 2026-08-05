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
} from 'firebase/firestore'
import { db } from '@/firebase/config'
import { COLLECTIONS } from '@/firebase/collections'
import { settingsRepository } from './settingsRepository'
import { sanitizeFirestoreData } from '@/lib/firestoreUtils'
import type { Bill } from '@/types'

const billsRef = () => collection(db, COLLECTIONS.BILLS)

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

  async create(data: Omit<Bill, 'billId' | 'createdAt'>): Promise<Bill> {
    const clean = sanitizeFirestoreData({
      ...data,
      customerInfo: sanitizeFirestoreData(data.customerInfo as unknown as Record<string, unknown>),
    } as Record<string, unknown>)
    const docRef = await addDoc(billsRef(), {
      ...clean,
      createdAt: serverTimestamp(),
    })
    return { ...data, billId: docRef.id, createdAt: serverTimestamp() } as Bill
  },

  async update(billId: string, data: Partial<Bill>): Promise<void> {
    const clean = sanitizeFirestoreData(data as Record<string, unknown>)
    await updateDoc(doc(db, COLLECTIONS.BILLS, billId), clean)
  },

  async generateBillNumber(): Promise<string> {
    return settingsRepository.generateAndIncrementBillNumber()
  },
}
