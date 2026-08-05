import { useEffect } from 'react'
import type { User } from 'firebase/auth'
import {
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '@/firebase/config'
import { isAuthBypassEnabled } from '@/lib/devAuth'
import { useAuthStore } from '@/stores/authStore'
import type { AppUser } from '@/types'

async function syncUserProfile(firebaseUser: User): Promise<AppUser> {
  const userRef = doc(db, 'users', firebaseUser.uid)
  const userDoc = await getDoc(userRef)
  const devBypass = isAuthBypassEnabled()

  if (userDoc.exists()) {
    const profile = userDoc.data() as AppUser
    if (devBypass) {
      return { ...profile, role: 'admin', displayName: profile.displayName || 'Dev User' }
    }
    return profile
  }

  const newUser: AppUser = {
    uid: firebaseUser.uid,
    email: firebaseUser.email ?? (devBypass ? 'dev@localhost' : ''),
    displayName: devBypass
      ? 'Dev User'
      : (firebaseUser.displayName ?? firebaseUser.email ?? ''),
    role: 'staff',
    createdAt: serverTimestamp() as AppUser['createdAt'],
  }

  await setDoc(userRef, newUser)
  return devBypass ? { ...newUser, role: 'admin' } : newUser
}

export function useAuth() {
  const { user, loading, setUser, setLoading } = useAuthStore()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const profile = await syncUserProfile(firebaseUser)
          setUser(profile)
        } catch (error) {
          console.error('Failed to load user profile:', error)
          setUser(null)
        }
        setLoading(false)
        return
      }

      if (isAuthBypassEnabled()) {
        try {
          await signInAnonymously(auth)
          return
        } catch (error) {
          console.error(
            'Dev sign-in failed. Enable Anonymous auth in Firebase Console → Authentication → Sign-in method.',
            error
          )
        }
      }

      setUser(null)
      setLoading(false)
    })
    return unsubscribe
  }, [setUser, setLoading])

  const login = async (email: string, password: string) => {
    setLoading(true)
    try {
      const credential = await signInWithEmailAndPassword(auth, email, password)
      const profile = await syncUserProfile(credential.user)
      setUser(profile)
    } catch (error) {
      setUser(null)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    await signOut(auth)
    setUser(null)
  }

  return { user, loading, login, logout }
}
