import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
} from 'firebase/firestore'
import { db } from '@/firebase/config'
import { COLLECTIONS } from '@/firebase/collections'
import { sanitizeFirestoreData } from '@/lib/firestoreUtils'
import type { Customer, CustomerFormData } from '@/types'

const customersRef = () => collection(db, COLLECTIONS.CUSTOMERS)

export const customerRepository = {
  async getAll(): Promise<Customer[]> {
    const q = query(customersRef(), orderBy('createdAt', 'desc'))
    const snapshot = await getDocs(q)
    return snapshot.docs.map((d) => ({ ...d.data(), customerId: d.id }) as Customer)
  },

  async create(data: CustomerFormData): Promise<Customer> {
    const docRef = await addDoc(customersRef(), {
      ...sanitizeFirestoreData(data as Record<string, unknown>),
      createdAt: serverTimestamp(),
    })
    return { ...data, customerId: docRef.id, createdAt: serverTimestamp() } as Customer
  },

  async update(customerId: string, data: Partial<CustomerFormData>): Promise<void> {
    await updateDoc(
      doc(db, COLLECTIONS.CUSTOMERS, customerId),
      sanitizeFirestoreData(data as Record<string, unknown>)
    )
  },

  async delete(customerId: string): Promise<void> {
    await deleteDoc(doc(db, COLLECTIONS.CUSTOMERS, customerId))
  },
}
