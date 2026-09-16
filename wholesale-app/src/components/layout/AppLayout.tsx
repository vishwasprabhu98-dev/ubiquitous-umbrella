import { Outlet } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/uiStore'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'

export default function AppLayout() {
  const { sidebarCollapsed } = useUIStore()

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-[#181c26]">
      <Sidebar />
      <div
        className={cn(
          'flex flex-1 flex-col overflow-hidden transition-all duration-300',
          sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64',
        )}
      >
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto max-w-7xl p-4 pb-28 lg:p-6 lg:pb-6">
            <Outlet />
          </div>
        </main>
        <BottomNav />
      </div>
    </div>
  )
}
