import { NavLink, useLocation } from 'react-router-dom'
import {
  ShoppingBag,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { NAV_ITEMS } from '@/lib/roleAccess'
import { useUIStore } from '@/stores/uiStore'
import { useAuthStore } from '@/stores/authStore'
import { useShopName } from '@/hooks/useShopName'
import { Button } from '@/components/ui/button'
import type { UserRole } from '@/types'

export default function Sidebar() {
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const shopName = useShopName({ syncDocumentTitle: false })
  const { sidebarCollapsed, toggleSidebar } = useUIStore()

  const role = (user?.role ?? 'staff') as UserRole
  const visibleNavItems = NAV_ITEMS.filter((item) => item.roles.includes(role))

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-30 hidden h-full flex-col border-r border-gray-200 bg-white shadow-none transition-all duration-300 lg:flex dark:border-[#2a3040] dark:bg-[#1e2330]',
        sidebarCollapsed ? 'w-16' : 'w-64',
      )}
    >
      <div
        className={cn(
          'flex h-16 items-center border-b border-gray-200 px-4 dark:border-[#2a3040]',
          sidebarCollapsed ? 'justify-center' : 'justify-between',
        )}
      >
        {!sidebarCollapsed && (
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
              <ShoppingBag className="h-4 w-4 text-white" />
            </div>
            <span
              className="max-w-[10rem] truncate text-sm font-bold text-gray-900 dark:text-white"
              title={shopName}
            >
              {shopName}
            </span>
          </div>
        )}
        {sidebarCollapsed && (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
            <ShoppingBag className="h-4 w-4 text-white" />
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-4">
        <ul className="space-y-1">
          {visibleNavItems.map((item) => {
            const Icon = item.icon
            const isActive = item.exact
              ? location.pathname === item.to
              : item.to === '/more'
                ? location.pathname === '/more' ||
                  location.pathname.startsWith('/settings') ||
                  location.pathname.startsWith('/purchases') ||
                  location.pathname.startsWith('/balance-sheet')
                : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)

            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-[#2a3348] dark:hover:text-white',
                    sidebarCollapsed && 'justify-center px-2',
                  )}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {!sidebarCollapsed && <span>{item.label}</span>}
                </NavLink>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="flex justify-end border-t border-gray-200 p-2 dark:border-[#2a3040]">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="h-8 w-8 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          {sidebarCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>
    </aside>
  )
}
