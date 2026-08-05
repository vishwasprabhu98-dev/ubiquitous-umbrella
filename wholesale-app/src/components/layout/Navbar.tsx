import { Menu, Moon, Sun, LogOut, User } from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'
import { useThemeStore } from '@/stores/themeStore'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export default function Navbar() {
  const { setSidebarOpen } = useUIStore()
  const { isDark, toggleTheme } = useThemeStore()
  const { user, logout } = useAuth()

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-gray-200 dark:border-[#2a3040] bg-white/90 dark:bg-[#1e2330]/95 backdrop-blur-sm px-4 lg:px-6">
      {/* Mobile hamburger */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={() => setSidebarOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="ml-auto flex items-center gap-2">
        {/* Theme toggle */}
        <Button variant="ghost" size="icon" onClick={toggleTheme}>
          {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="flex items-center gap-2 h-9 px-2"
            >
              <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-semibold">
                {user?.displayName?.charAt(0)?.toUpperCase() ?? 'U'}
              </div>
              <div className="hidden md:block text-left">
                <p className="text-sm font-medium leading-none">{user?.displayName ?? 'User'}</p>
                <p className="text-xs text-gray-500 capitalize mt-0.5">{user?.role ?? 'staff'}</p>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <User className="h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={logout}
              className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
