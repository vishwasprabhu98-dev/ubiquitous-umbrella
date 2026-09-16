import type { UserRole } from '@/types'
import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Receipt,
  ShoppingCart,
  ShoppingBag,
  MoreHorizontal,
  BookOpen,
  BarChart3,
  Store,
  Package,
  Tags,
  Users,
  ShieldCheck,
  Hash,
  Images,
  RefreshCw,
  ScrollText,
} from 'lucide-react'

/** Routes each role may access (path prefixes). */
export const ROLE_ROUTE_ACCESS: Record<UserRole, string[]> = {
  staff: ['/', '/billing', '/orders', '/ledger', '/more'],
  finance: ['/', '/billing', '/orders', '/ledger', '/purchases', '/balance-sheet', '/settings', '/more'],
  admin: ['/', '/billing', '/orders', '/ledger', '/purchases', '/balance-sheet', '/settings', '/more'],
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

/** Primary nav (sidebar + bottom bar). */
export const NAV_ITEMS: {
  to: string
  label: string
  exact?: boolean
  roles: UserRole[]
  icon: LucideIcon
}[] = [
  { to: '/', label: 'Dashboard', exact: true, roles: ['staff', 'finance', 'admin'], icon: LayoutDashboard },
  { to: '/billing', label: 'Invoice', roles: ['staff', 'finance', 'admin'], icon: Receipt },
  { to: '/orders', label: 'Order', roles: ['staff', 'finance', 'admin'], icon: ShoppingCart },
  { to: '/ledger', label: 'Ledger', roles: ['staff', 'finance', 'admin'], icon: BookOpen },
  { to: '/more', label: 'More', roles: ['staff', 'finance', 'admin'], icon: MoreHorizontal },
]

export type SettingsSectionKey =
  | 'shop'
  | 'users'
  | 'customers'
  | 'products'
  | 'pricing'
  | 'numberformat'
  | 'general'

export type GeneralOptionKey = 'catalog' | 'ledger' | 'activity'

export const SETTINGS_SECTIONS: {
  value: SettingsSectionKey
  label: string
  icon: LucideIcon
  roles: UserRole[]
}[] = [
  { value: 'shop', label: 'Shop Profile', icon: Store, roles: ['finance', 'admin'] },
  { value: 'products', label: 'Products', icon: Package, roles: ['finance', 'admin'] },
  { value: 'pricing', label: 'Custom Pricing', icon: Tags, roles: ['finance', 'admin'] },
  { value: 'customers', label: 'Customers', icon: Users, roles: ['admin'] },
  { value: 'users', label: 'Users', icon: ShieldCheck, roles: ['admin'] },
  { value: 'numberformat', label: 'Number Format', icon: Hash, roles: ['admin'] },
  { value: 'general', label: 'General', icon: RefreshCw, roles: ['admin'] },
]

export const GENERAL_OPTIONS: {
  value: GeneralOptionKey
  label: string
  icon: LucideIcon
  roles: UserRole[]
}[] = [
  { value: 'catalog', label: 'Catalog Products', icon: Images, roles: ['admin'] },
  { value: 'ledger', label: 'Ledger Maintenance', icon: RefreshCw, roles: ['admin'] },
  { value: 'activity', label: 'Activity Logs', icon: ScrollText, roles: ['admin'] },
]

export function settingsSectionsForRole(role: UserRole) {
  return SETTINGS_SECTIONS.filter((s) => s.roles.includes(role))
}

export function generalOptionsForRole(role: UserRole) {
  return GENERAL_OPTIONS.filter((o) => o.roles.includes(role))
}

export function canAccessSettingsSection(role: UserRole, section: SettingsSectionKey): boolean {
  return SETTINGS_SECTIONS.some((s) => s.value === section && s.roles.includes(role))
}

/** Modules shown on the More page, grouped like Zoho. */
export const MORE_MODULE_GROUPS: {
  title?: string
  roles: UserRole[]
  items: {
    label: string
    to: string
    icon: LucideIcon
    roles: UserRole[]
  }[]
}[] = [
  {
    title: 'Accounts',
    roles: ['finance', 'admin'],
    items: [
      { label: 'Purchase', to: '/purchases', icon: ShoppingBag, roles: ['finance', 'admin'] },
      { label: 'Balance Sheet', to: '/balance-sheet', icon: BarChart3, roles: ['finance', 'admin'] },
    ],
  },
  {
    title: 'Shop',
    roles: ['finance', 'admin'],
    items: [
      { label: 'Shop Profile', to: '/settings?section=shop', icon: Store, roles: ['finance', 'admin'] },
      { label: 'Products', to: '/settings?section=products', icon: Package, roles: ['finance', 'admin'] },
      { label: 'Custom Pricing', to: '/settings?section=pricing', icon: Tags, roles: ['finance', 'admin'] },
    ],
  },
  {
    title: 'Directory',
    roles: ['admin'],
    items: [
      { label: 'Customers', to: '/settings?section=customers', icon: Users, roles: ['admin'] },
      { label: 'Users', to: '/settings?section=users', icon: ShieldCheck, roles: ['admin'] },
    ],
  },
  {
    title: 'Setup',
    roles: ['admin'],
    items: [
      { label: 'Number Format', to: '/settings?section=numberformat', icon: Hash, roles: ['admin'] },
      {
        label: 'Catalog Products',
        to: '/settings?section=general&option=catalog',
        icon: Images,
        roles: ['admin'],
      },
      {
        label: 'Ledger Maintenance',
        to: '/settings?section=general&option=ledger',
        icon: RefreshCw,
        roles: ['admin'],
      },
      {
        label: 'Activity Logs',
        to: '/settings?section=general&option=activity',
        icon: ScrollText,
        roles: ['admin'],
      },
    ],
  },
]

export function moreGroupsForRole(role: UserRole) {
  return MORE_MODULE_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.roles.includes(role)),
  })).filter((group) => group.roles.includes(role) && group.items.length > 0)
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  finance: 'Finance',
  staff: 'Staff',
}

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  staff: 'Dashboard, billing, orders, ledger, and account',
  finance: 'Staff access plus purchases, balance sheet, shop profile, products, and custom pricing',
  admin: 'Full access including users, customers, and all settings',
}
