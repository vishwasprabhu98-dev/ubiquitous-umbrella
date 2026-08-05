export function sanitizeFirestoreData<T extends Record<string, unknown>>(data: T): T {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== '' && value !== undefined && value !== null)
  ) as T
}

export function getFirestoreErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: string }).code
    switch (code) {
      case 'permission-denied':
        return 'Permission denied. Sign in or check Firestore security rules.'
      case 'unauthenticated':
        return 'Not signed in. Please refresh and try again.'
      case 'failed-precondition':
        return 'Database index missing. Check the browser console for a setup link.'
      default:
        return `Database error (${code}).`
    }
  }

  if (error instanceof Error) return error.message
  return 'Something went wrong. Please try again.'
}
