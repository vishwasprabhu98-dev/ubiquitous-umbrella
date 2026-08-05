import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Loader2, Shield, UserCog } from 'lucide-react'
import { toast } from 'sonner'
import { userRepository } from '@/firebase/repositories/userRepository'
import { getFirestoreErrorMessage } from '@/lib/firestoreUtils'
import { useAuthStore } from '@/stores/authStore'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatDate } from '@/lib/utils'
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/roleAccess'
import type { AppUser, UserRole } from '@/types'

const ROLE_STYLES: Record<UserRole, string> = {
  admin: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  finance: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  staff: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
}

export default function UserManagement() {
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  const [search, setSearch] = useState('')

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: userRepository.getAll,
  })

  const roleMutation = useMutation({
    mutationFn: ({ uid, role }: { uid: string; role: UserRole }) =>
      userRepository.updateRole(uid, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('User role updated')
    },
    onError: (error) => toast.error(getFirestoreErrorMessage(error)),
  })

  const filtered = users.filter(
    (u) =>
      u.displayName.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  )

  const handleRoleChange = (user: AppUser, role: UserRole) => {
    if (user.uid === currentUser?.uid) {
      toast.error('You cannot change your own role')
      return
    }
    if (user.role === role) return
    roleMutation.mutate({ uid: user.uid, role })
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-100 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-950/30 p-4 text-sm text-blue-800 dark:text-blue-200">
        <p className="font-medium flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Role management
        </p>
        <p className="mt-1 text-blue-700/80 dark:text-blue-300/80">
          <strong>Staff</strong> — {ROLE_DESCRIPTIONS.staff}.{' '}
          <strong>Finance</strong> — {ROLE_DESCRIPTIONS.finance}.{' '}
          <strong>Admin</strong> — {ROLE_DESCRIPTIONS.admin}.
          New users default to <strong>staff</strong> on first login.
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search users..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <UserCog className="h-10 w-10 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">No users found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((user) => {
            const isSelf = user.uid === currentUser?.uid
            return (
              <Card key={user.uid} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-300 font-semibold text-sm shrink-0">
                        {user.displayName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-gray-900 dark:text-white">{user.displayName}</p>
                          {isSelf && (
                            <span className="text-xs text-gray-400">(you)</span>
                          )}
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${ROLE_STYLES[user.role]}`}>
                            {user.role}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 truncate">{user.email || '—'}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Joined {user.createdAt?.toDate ? formatDate(user.createdAt.toDate()) : '—'}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 w-32">
                      <Select
                        value={user.role}
                        onValueChange={(value) => handleRoleChange(user, value as UserRole)}
                        disabled={isSelf || roleMutation.isPending}
                      >
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="staff">{ROLE_LABELS.staff}</SelectItem>
                          <SelectItem value="finance">{ROLE_LABELS.finance}</SelectItem>
                          <SelectItem value="admin">{ROLE_LABELS.admin}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {roleMutation.isPending && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Updating role...
        </div>
      )}
    </div>
  )
}
