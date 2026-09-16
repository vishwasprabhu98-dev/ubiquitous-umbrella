import { NavLink, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { NAV_ITEMS } from '@/lib/roleAccess'
import { useAuthStore } from '@/stores/authStore'
import type { UserRole } from '@/types'

function isNavItemActive(pathname: string, item: (typeof NAV_ITEMS)[number]): boolean {
  if (item.exact) return pathname === item.to
  if (item.to === '/more') {
    return (
      pathname === '/more' ||
      pathname.startsWith('/settings') ||
      pathname.startsWith('/purchases') ||
      pathname.startsWith('/balance-sheet')
    )
  }
  return pathname === item.to || pathname.startsWith(`${item.to}/`)
}

export default function BottomNav() {
  const location = useLocation()
  const role = (useAuthStore((s) => s.user?.role) ?? 'staff') as UserRole
  const items = NAV_ITEMS.filter((item) => item.roles.includes(role))

  return (
    <nav
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden"
      aria-label="Primary"
    >
      <div className="pointer-events-auto flex w-full max-w-md items-stretch gap-0.5 rounded-full border border-gray-200/70 bg-white/70 px-1.5 py-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.12)] backdrop-blur-2xl supports-[backdrop-filter]:bg-white/55 dark:border-[#2a3040]/80 dark:bg-[#1e2330]/70 dark:shadow-[0_8px_30px_rgba(0,0,0,0.55)] dark:supports-[backdrop-filter]:bg-[#1e2330]/55">
        {items.map((item) => {
          const Icon = item.icon
          const isActive = isNavItemActive(location.pathname, item)

          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn(
                'flex min-w-0 flex-1 items-center justify-center px-0.5 py-0.5',
              )}
            >
              <span
                className={cn(
                  'flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-full px-2.5 py-1.5 text-[10px] font-medium transition-colors',
                  isActive
                    ? 'bg-gray-200/90 text-blue-600 dark:bg-[#3a4150] dark:text-blue-400'
                    : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200',
                )}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={isActive ? 2.25 : 1.75} />
                <span className="truncate leading-none">{item.label}</span>
              </span>
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
