import {
  collection,
  doc,
  getDocs,
  updateDoc,
  query,
  orderBy,
} from 'firebase/firestore'
import { db } from '@/firebase/config'
import { COLLECTIONS } from '@/firebase/collections'
import type { AppUser, UserRole } from '@/types'

const usersRef = () => collection(db, COLLECTIONS.USERS)

export const userRepository = {
  async getAll(): Promise<AppUser[]> {
    const q = query(usersRef(), orderBy('createdAt', 'desc'))
    const snapshot = await getDocs(q)
    return snapshot.docs.map((d) => ({ ...d.data(), uid: d.id }) as AppUser)
  },

  async updateRole(uid: string, role: UserRole): Promise<void> {
    await updateDoc(doc(db, COLLECTIONS.USERS, uid), { role })
  },
}
