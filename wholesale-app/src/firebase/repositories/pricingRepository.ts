import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from '@/firebase/config'
import { COLLECTIONS } from '@/firebase/collections'
import type { CustomerProductPricing } from '@/types'

const pricingRef = () => collection(db, COLLECTIONS.CUSTOMER_PRODUCT_PRICING)

export type CustomerPriceEntry = {
  productId: string
  /** null clears custom pricing and falls back to base price */
  customPrice: number | null
}

export const pricingRepository = {
  async getAll(): Promise<CustomerProductPricing[]> {
    const snapshot = await getDocs(pricingRef())
    return snapshot.docs.map((d) => ({ ...d.data(), mappingId: d.id }) as CustomerProductPricing)
  },

  async getByCustomer(customerId: string): Promise<CustomerProductPricing[]> {
    const q = query(pricingRef(), where('customerId', '==', customerId))
    const snapshot = await getDocs(q)
    return snapshot.docs.map((d) => ({ ...d.data(), mappingId: d.id }) as CustomerProductPricing)
  },

  async getPrice(customerId: string, productId: string, basePrice: number): Promise<number> {
    const q = query(
      pricingRef(),
      where('customerId', '==', customerId),
      where('productId', '==', productId)
    )
    const snapshot = await getDocs(q)
    if (!snapshot.empty) {
      const pricing = snapshot.docs[0].data() as CustomerProductPricing
      return pricing.customPrice
    }
    return basePrice
  },

  async create(data: Omit<CustomerProductPricing, 'mappingId'>): Promise<CustomerProductPricing> {
    const docRef = await addDoc(pricingRef(), data)
    return { ...data, mappingId: docRef.id }
  },

  async update(mappingId: string, customPrice: number): Promise<void> {
    await updateDoc(doc(db, COLLECTIONS.CUSTOMER_PRODUCT_PRICING, mappingId), { customPrice })
  },

  async delete(mappingId: string): Promise<void> {
    await deleteDoc(doc(db, COLLECTIONS.CUSTOMER_PRODUCT_PRICING, mappingId))
  },

  /** Create, update, or remove custom prices for one customer in a single batch. */
  async saveForCustomer(customerId: string, entries: CustomerPriceEntry[]): Promise<void> {
    const existing = await this.getByCustomer(customerId)
    const byProduct = new Map(existing.map((p) => [p.productId, p]))
    const batch = writeBatch(db)

    for (const entry of entries) {
      const current = byProduct.get(entry.productId)
      if (entry.customPrice === null || Number.isNaN(entry.customPrice)) {
        if (current) {
          batch.delete(doc(db, COLLECTIONS.CUSTOMER_PRODUCT_PRICING, current.mappingId))
        }
        continue
      }
      if (current) {
        if (current.customPrice !== entry.customPrice) {
          batch.update(doc(db, COLLECTIONS.CUSTOMER_PRODUCT_PRICING, current.mappingId), {
            customPrice: entry.customPrice,
          })
        }
      } else {
        const ref = doc(pricingRef())
        batch.set(ref, {
          customerId,
          productId: entry.productId,
          customPrice: entry.customPrice,
        })
      }
    }

    await batch.commit()
  },
}
