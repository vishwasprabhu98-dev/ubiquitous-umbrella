import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
} from 'firebase/firestore'
import { db } from '@/firebase/config'
import { COLLECTIONS } from '@/firebase/collections'
import { sanitizeFirestoreData } from '@/lib/firestoreUtils'
import type { Transaction } from '@/types'

const transactionsRef = () => collection(db, COLLECTIONS.TRANSACTIONS)

export const transactionRepository = {
  async getAll(): Promise<Transaction[]> {
    const q = query(transactionsRef(), orderBy('createdAt', 'desc'))
    const snapshot = await getDocs(q)
    return snapshot.docs.map((d) => ({ ...d.data(), transactionId: d.id }) as Transaction)
  },

  async getByBill(billId: string): Promise<Transaction[]> {
    const q = query(transactionsRef(), where('billId', '==', billId))
    const snapshot = await getDocs(q)
    return snapshot.docs.map((d) => ({ ...d.data(), transactionId: d.id }) as Transaction)
  },

  async create(data: Omit<Transaction, 'transactionId' | 'createdAt'>): Promise<Transaction> {
    const clean = sanitizeFirestoreData(data as Record<string, unknown>)
    const docRef = await addDoc(transactionsRef(), {
      ...clean,
      createdAt: serverTimestamp(),
    })
    return { ...data, transactionId: docRef.id, createdAt: serverTimestamp() } as Transaction
  },
}
