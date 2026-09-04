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
import type { CatalogProduct, CatalogProductFormData } from '@/types'

const catalogProductsRef = () => collection(db, COLLECTIONS.CATALOG_PRODUCTS)

function normalizeFormData(data: CatalogProductFormData | Partial<CatalogProductFormData>) {
  const imageUrls = (data.imageUrls ?? [])
    .map((u) => u.trim())
    .filter(Boolean)

  const sizes = (data.sizes ?? [])
    .map((s) => ({
      label: s.label.trim(),
      originalPrice: Number(s.originalPrice) || 0,
      discountedPrice: Number(s.discountedPrice) || 0,
    }))
    .filter((s) => s.label.length > 0)

  const unit = data.unit?.trim() || 'Piece'

  let originalPrice = data.originalPrice
  let discountedPrice = data.discountedPrice
  if (sizes.length > 0) {
    originalPrice = sizes[0].originalPrice
    discountedPrice = sizes[0].discountedPrice
  }

  return sanitizeFirestoreData({
    ...data,
    name: data.name?.trim(),
    description: data.description?.trim(),
    unit,
    badge: data.badge?.trim() || undefined,
    imageUrls,
    sizes,
    originalPrice,
    discountedPrice,
  } as Record<string, unknown>)
}

export const catalogProductRepository = {
  async getAll(): Promise<CatalogProduct[]> {
    const q = query(catalogProductsRef(), orderBy('createdAt', 'desc'))
    const snapshot = await getDocs(q)
    const items = snapshot.docs.map(
      (d) => ({ ...d.data(), catalogProductId: d.id }) as CatalogProduct
    )
    return items.sort((a, b) => {
      const ao = a.sortOrder ?? Number.MAX_SAFE_INTEGER
      const bo = b.sortOrder ?? Number.MAX_SAFE_INTEGER
      if (ao !== bo) return ao - bo
      return 0
    })
  },

  async create(data: CatalogProductFormData): Promise<CatalogProduct> {
    const payload = normalizeFormData(data)
    const docRef = await addDoc(catalogProductsRef(), {
      ...payload,
      createdAt: serverTimestamp(),
    })
    return {
      ...data,
      imageUrls: (payload.imageUrls as string[]) ?? [],
      catalogProductId: docRef.id,
      createdAt: serverTimestamp(),
    } as CatalogProduct
  },

  async update(
    catalogProductId: string,
    data: Partial<CatalogProductFormData>
  ): Promise<void> {
    await updateDoc(
      doc(db, COLLECTIONS.CATALOG_PRODUCTS, catalogProductId),
      normalizeFormData(data)
    )
  },

  async delete(catalogProductId: string): Promise<void> {
    await deleteDoc(doc(db, COLLECTIONS.CATALOG_PRODUCTS, catalogProductId))
  },
}
