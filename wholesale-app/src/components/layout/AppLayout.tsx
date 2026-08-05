import { Outlet } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/uiStore'
import Sidebar from './Sidebar'
import Navbar from './Navbar'

export default function AppLayout() {
  const { sidebarCollapsed } = useUIStore()

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-[#181c26]">
      <Sidebar />
      <div
        className={cn(
          'flex flex-col flex-1 overflow-hidden transition-all duration-300',
          sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'
        )}
      >
        <Navbar />
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto p-4 lg:p-6 max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
