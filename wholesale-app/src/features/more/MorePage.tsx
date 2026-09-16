import { Link } from 'react-router-dom'
import { ChevronRight, LogOut, Moon, Sun, User } from 'lucide-react'
import { moreGroupsForRole, ROLE_LABELS } from '@/lib/roleAccess'
import { useAuth } from '@/hooks/useAuth'
import { useThemeStore } from '@/stores/themeStore'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/button'
import type { UserRole } from '@/types'

export default function MorePage() {
  const role = (useAuthStore((s) => s.user?.role) ?? 'staff') as UserRole
  const { user, logout } = useAuth()
  const { isDark, toggleTheme } = useThemeStore()
  const groups = moreGroupsForRole(role)

  return (
    <div className="mx-auto max-w-lg space-y-6 pb-4">
      <div className="text-center sm:text-left">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">More Modules</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Tools, settings, and your account
        </p>
      </div>

      {groups.length > 0 && (
        <div className="space-y-5">
          {groups.map((group) => (
            <section key={group.title ?? group.items[0]?.to} className="space-y-2">
              {group.title && (
                <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  {group.title}
                </h2>
              )}
              <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-[#2a3040] dark:bg-[#1e2330]">
                {group.items.map((item, index) => {
                  const Icon = item.icon
                  return (
                    <div key={item.to}>
                      {index > 0 && (
                        <div className="mx-4 border-t border-gray-100 dark:border-[#2a3040]" />
                      )}
                      <Link
                        to={item.to}
                        className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-gray-50 dark:hover:bg-[#252d3d]"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-700 dark:bg-[#2a3348] dark:text-gray-200">
                          <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                        </span>
                        <span className="flex-1 text-sm font-medium text-gray-900 dark:text-white">
                          {item.label}
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
                      </Link>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <section className="space-y-2">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Account
        </h2>
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-[#2a3040] dark:bg-[#1e2330]">
          <div className="flex items-center gap-3 px-4 py-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
              {user?.displayName?.charAt(0)?.toUpperCase() ?? <User className="h-4 w-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                {user?.displayName ?? 'User'}
              </p>
              <p className="truncate text-xs text-gray-500">
                {ROLE_LABELS[role]}
                {user?.email ? ` · ${user.email}` : ''}
              </p>
            </div>
          </div>

          <div className="mx-4 border-t border-gray-100 dark:border-[#2a3040]" />

          <button
            type="button"
            onClick={toggleTheme}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-[#252d3d]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-700 dark:bg-[#2a3348] dark:text-gray-200">
              {isDark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </span>
            <span className="flex-1 text-sm font-medium text-gray-900 dark:text-white">
              {isDark ? 'Light mode' : 'Dark mode'}
            </span>
          </button>

          <div className="mx-4 border-t border-gray-100 dark:border-[#2a3040]" />

          <div className="p-3">
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full justify-center gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900/50 dark:hover:bg-red-950/40"
              onClick={() => void logout()}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
