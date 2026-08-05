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
import { settingsRepository } from './settingsRepository'
import { sanitizeFirestoreData } from '@/lib/firestoreUtils'
import type { Order, OrderStatus } from '@/types'

const ordersRef = () => collection(db, COLLECTIONS.ORDERS)

export const orderRepository = {
  async getAll(): Promise<Order[]> {
    const q = query(ordersRef(), orderBy('createdAt', 'desc'))
    const snapshot = await getDocs(q)
    return snapshot.docs.map((d) => ({ ...d.data(), orderId: d.id }) as Order)
  },

  async create(data: Omit<Order, 'orderId' | 'createdAt'>): Promise<Order> {
    const clean = sanitizeFirestoreData({
      ...data,
      customerInfo: sanitizeFirestoreData(data.customerInfo as unknown as Record<string, unknown>),
    } as Record<string, unknown>)
    const docRef = await addDoc(ordersRef(), {
      ...clean,
      createdAt: serverTimestamp(),
    })
    return { ...data, orderId: docRef.id, createdAt: serverTimestamp() } as Order
  },

  async update(orderId: string, data: Partial<Omit<Order, 'orderId' | 'createdAt'>>): Promise<void> {
    const clean = sanitizeFirestoreData({
      ...data,
      ...(data.customerInfo
        ? { customerInfo: sanitizeFirestoreData(data.customerInfo as unknown as Record<string, unknown>) }
        : {}),
    } as Record<string, unknown>)
    await updateDoc(doc(db, COLLECTIONS.ORDERS, orderId), clean)
  },

  async updateStatus(orderId: string, status: OrderStatus): Promise<void> {
    await updateDoc(doc(db, COLLECTIONS.ORDERS, orderId), { status })
  },

  async delete(orderId: string): Promise<void> {
    await deleteDoc(doc(db, COLLECTIONS.ORDERS, orderId))
  },

  async generateOrderNumber(): Promise<string> {
    return settingsRepository.generateAndIncrementOrderNumber()
  },
}
