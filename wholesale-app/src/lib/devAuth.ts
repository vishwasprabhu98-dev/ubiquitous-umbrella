export function isAuthBypassEnabled(): boolean {
  if (import.meta.env.VITE_BYPASS_AUTH === 'false') return false
  return import.meta.env.DEV || import.meta.env.VITE_BYPASS_AUTH === 'true'
}
