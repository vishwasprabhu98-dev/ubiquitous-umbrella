import { FirebaseError } from 'firebase/app'

function isPermissionDenied(error: unknown): boolean {
  return (
    error instanceof FirebaseError && error.code === 'permission-denied'
  ) || (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === 'permission-denied'
  )
}

export function getAuthErrorMessage(error: unknown): string {
  if (isPermissionDenied(error)) {
    return 'Signed in, but Firestore denied access to your profile. Update Firestore security rules for the users collection.'
  }

  if (error instanceof FirebaseError) {
    switch (error.code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Invalid email or password. Check your credentials or reset the password in Firebase Console.'
      case 'auth/invalid-email':
        return 'Invalid email address.'
      case 'auth/user-disabled':
        return 'This account has been disabled.'
      case 'auth/too-many-requests':
        return 'Too many failed attempts. Please try again later.'
      case 'auth/operation-not-allowed':
        return 'Email/password sign-in is not enabled in Firebase Console.'
      case 'auth/invalid-api-key':
      case 'auth/app-not-authorized':
        return 'Firebase configuration error. Verify your .env values and restart the dev server.'
      case 'auth/network-request-failed':
        return 'Network error. Check your internet connection and try again.'
      case 'unavailable':
        return 'Firebase Auth is unreachable. In Firebase Console → Authentication → Sign-in method, enable Email/Password. Also ensure "localhost" is in Authorized Domains.'
      default:
        return `Sign-in failed (${error.code}). In Firebase Console → Authentication → Sign-in method, make sure Email/Password is enabled.`
    }
  }

  return 'An unexpected error occurred. Please try again.'
}
