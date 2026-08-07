import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Receipt,
  ShoppingCart,
  BarChart3,
  Settings,
  ShoppingBag,
  ChevronLeft,
  ChevronRight,
  X,
  BookOpen,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NAV_ITEMS } from '@/lib/roleAccess'
import { useUIStore } from '@/stores/uiStore'
import { useAuthStore } from '@/stores/authStore'
import { useShopName } from '@/hooks/useShopName'
import { Button } from '@/components/ui/button'
import type { UserRole } from '@/types'

const NAV_ICONS: Record<string, LucideIcon> = {
  '/': LayoutDashboard,
  '/billing': Receipt,
  '/orders': ShoppingCart,
  '/ledger': BookOpen,
  '/purchases': ShoppingBag,
  '/balance-sheet': BarChart3,
  '/settings': Settings,
}

export default function Sidebar() {
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const shopName = useShopName({ syncDocumentTitle: false })
  const { sidebarCollapsed, sidebarOpen, setSidebarOpen, toggleSidebar } = useUIStore()

  const role = user?.role ?? 'staff'
  const visibleNavItems = NAV_ITEMS.filter((item) => item.roles.includes(role as UserRole))

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-full flex-col bg-white dark:bg-[#1e2330] border-r border-gray-200 dark:border-[#2a3040] transition-all duration-300 shadow-lg lg:shadow-none lg:z-30',
          sidebarCollapsed ? 'w-16' : 'w-64',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Logo */}
        <div className={cn('flex items-center h-16 px-4 border-b border-gray-200 dark:border-[#2a3040]', sidebarCollapsed ? 'justify-center' : 'justify-between')}>
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center">
                <ShoppingBag className="h-4 w-4 text-white" />
              </div>
              <span className="font-bold text-gray-900 dark:text-white text-sm truncate max-w-[10rem]" title={shopName}>
                {shopName}
              </span>
            </div>
          )}
          {sidebarCollapsed && (
            <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <ShoppingBag className="h-4 w-4 text-white" />
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-gray-500 hover:text-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-2">
          <ul className="space-y-1">
            {visibleNavItems.map((item) => {
              const Icon = NAV_ICONS[item.to] ?? LayoutDashboard
              const isActive = item.exact
                ? location.pathname === item.to
                : location.pathname.startsWith(item.to)

              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                      isActive
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#2a3348] hover:text-gray-900 dark:hover:text-white',
                      sidebarCollapsed && 'justify-center px-2'
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

        {/* Collapse toggle - desktop only */}
        <div className="hidden lg:flex border-t border-gray-200 dark:border-[#2a3040] p-2 justify-end">
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
    </>
  )
}
