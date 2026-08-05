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
import type { Product, ProductFormData } from '@/types'

const productsRef = () => collection(db, COLLECTIONS.PRODUCTS)

export const productRepository = {
  async getAll(): Promise<Product[]> {
    const q = query(productsRef(), orderBy('createdAt', 'desc'))
    const snapshot = await getDocs(q)
    return snapshot.docs.map((d) => ({ ...d.data(), productId: d.id }) as Product)
  },

  async create(data: ProductFormData): Promise<Product> {
    const docRef = await addDoc(productsRef(), {
      ...sanitizeFirestoreData(data as Record<string, unknown>),
      createdAt: serverTimestamp(),
    })
    return { ...data, productId: docRef.id, createdAt: serverTimestamp() } as Product
  },

  async update(productId: string, data: Partial<ProductFormData>): Promise<void> {
    await updateDoc(
      doc(db, COLLECTIONS.PRODUCTS, productId),
      sanitizeFirestoreData(data as Record<string, unknown>)
    )
  },

  async delete(productId: string): Promise<void> {
    await deleteDoc(doc(db, COLLECTIONS.PRODUCTS, productId))
  },
}
