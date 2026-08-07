import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { settingsRepository } from '@/firebase/repositories/settingsRepository'
import { useAuthStore } from '@/stores/authStore'

const FALLBACK_NAME = 'Wholesale'

/** Shop profile business name; also keeps `document.title` in sync when signed in. */
export function useShopName(options?: { syncDocumentTitle?: boolean }) {
  const syncDocumentTitle = options?.syncDocumentTitle ?? true
  const user = useAuthStore((s) => s.user)

  const { data: shopProfile } = useQuery({
    queryKey: ['shopProfile'],
    queryFn: () => settingsRepository.getShopProfile(),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  })

  const name = shopProfile?.name?.trim() || FALLBACK_NAME

  useEffect(() => {
    if (!syncDocumentTitle) return
    document.title = name
  }, [name, syncDocumentTitle])

  return name
}
