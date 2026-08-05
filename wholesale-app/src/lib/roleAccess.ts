import type { UserRole } from '@/types'

/** Routes each role may access (path prefixes). Settings is admin-only. */
export const ROLE_ROUTE_ACCESS: Record<UserRole, string[]> = {
  staff: ['/', '/billing', '/orders'],
  finance: ['/', '/billing', '/orders', '/ledger', '/balance-sheet', '/purchases'],
  admin: ['/', '/billing', '/orders', '/ledger', '/balance-sheet', '/purchases', '/settings'],
}

export function canAccessRoute(role: UserRole, pathname: string): boolean {
  const allowed = ROLE_ROUTE_ACCESS[role]
  return allowed.some((route) =>
    route === '/' ? pathname === '/' : pathname === route || pathname.startsWith(`${route}/`)
  )
}

export function getHomeRouteForRole(role: UserRole): string {
  return ROLE_ROUTE_ACCESS[role][0] ?? '/'
}

export const NAV_ITEMS: {
  to: string
  label: string
  exact?: boolean
  roles: UserRole[]
}[] = [
  { to: '/', label: 'Dashboard', exact: true, roles: ['staff', 'finance', 'admin'] },
  { to: '/billing', label: 'Billing', roles: ['staff', 'finance', 'admin'] },
  { to: '/orders', label: 'Orders', roles: ['staff', 'finance', 'admin'] },
  { to: '/ledger', label: 'Ledger', roles: ['finance', 'admin'] },
  { to: '/purchases', label: 'Purchases', roles: ['finance', 'admin'] },
  { to: '/balance-sheet', label: 'Balance Sheet', roles: ['finance', 'admin'] },
  { to: '/settings', label: 'Settings', roles: ['admin'] },
]

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  finance: 'Finance',
  staff: 'Staff',
}

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  staff: 'Dashboard, billing, and orders',
  finance: 'All pages except settings',
  admin: 'Full access including settings and user management',
}
