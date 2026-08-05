import { Navigate, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { canAccessRoute, getHomeRouteForRole } from '@/lib/roleAccess'
import type { UserRole } from '@/types'

interface ProtectedRouteProps {
  children: React.ReactNode
  allowedRoles?: UserRole[]
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#181c26]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={getHomeRouteForRole(user.role)} replace />
  }

  if (!allowedRoles && !canAccessRoute(user.role, location.pathname)) {
    return <Navigate to={getHomeRouteForRole(user.role)} replace />
  }

  return <>{children}</>
}
