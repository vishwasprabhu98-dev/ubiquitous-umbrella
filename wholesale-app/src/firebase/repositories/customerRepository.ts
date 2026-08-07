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
import { sanitizeFirestoreData } from '@/lib/firestoreUtils'
import { customerBalanceRepository } from './customerBalanceRepository'
import type { Customer, CustomerFormData } from '@/types'

const customersRef = () => collection(db, COLLECTIONS.CUSTOMERS)

export const customerRepository = {
  async getAll(): Promise<Customer[]> {
    const q = query(customersRef(), orderBy('createdAt', 'desc'))
    const snapshot = await getDocs(q)
    return snapshot.docs.map((d) => ({ ...d.data(), customerId: d.id }) as Customer)
  },

  async getById(customerId: string): Promise<Customer | null> {
    const snapshot = await getDoc(doc(db, COLLECTIONS.CUSTOMERS, customerId))
    if (!snapshot.exists()) return null
    return { ...snapshot.data(), customerId: snapshot.id } as Customer
  },

  async create(data: CustomerFormData): Promise<Customer> {
    const docRef = await addDoc(customersRef(), {
      ...sanitizeFirestoreData(data as Record<string, unknown>),
      createdAt: serverTimestamp(),
    })
    await customerBalanceRepository.refresh(docRef.id)
    return { ...data, customerId: docRef.id, createdAt: serverTimestamp() } as Customer
  },

  async update(customerId: string, data: Partial<CustomerFormData>): Promise<void> {
    await updateDoc(
      doc(db, COLLECTIONS.CUSTOMERS, customerId),
      sanitizeFirestoreData(data as Record<string, unknown>)
    )
    await customerBalanceRepository.refresh(customerId)
  },

  async delete(customerId: string): Promise<void> {
    await deleteDoc(doc(db, COLLECTIONS.CUSTOMERS, customerId))
    await customerBalanceRepository.refresh(customerId)
  },
}
