import { useState, useEffect, useMemo } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import CustomerManagement from './CustomerManagement'
import ProductManagement from './ProductManagement'
import CatalogProductManagement from './CatalogProductManagement'
import PricingManagement from './PricingManagement'
import NumberFormatSettings from './NumberFormatSettings'
import ShopProfileSettings from './ShopProfileSettings'
import LedgerMaintenanceSettings from './LedgerMaintenanceSettings'
import UserManagement from './UserManagement'
import ActivityLogsSettings from './ActivityLogsSettings'
import {
  settingsSectionsForRole,
  generalOptionsForRole,
  canAccessSettingsSection,
  SETTINGS_SECTIONS,
  GENERAL_OPTIONS,
  type SettingsSectionKey,
  type GeneralOptionKey,
} from '@/lib/roleAccess'
import { useAuthStore } from '@/stores/authStore'
import type { UserRole } from '@/types'

export default function SettingsPage() {
  const role = (useAuthStore((s) => s.user?.role) ?? 'staff') as UserRole
  const [searchParams, setSearchParams] = useSearchParams()
  const availableSections = useMemo(() => settingsSectionsForRole(role), [role])
  const availableGeneral = useMemo(() => generalOptionsForRole(role), [role])

  const sectionFromUrl = searchParams.get('section') as SettingsSectionKey | null
  const optionFromUrl = searchParams.get('option') as GeneralOptionKey | null

  const [section, setSection] = useState<SettingsSectionKey | null>(() => {
    if (sectionFromUrl && canAccessSettingsSection(role, sectionFromUrl)) return sectionFromUrl
    return null
  })

  const [generalOption, setGeneralOption] = useState<GeneralOptionKey>(() => {
    if (optionFromUrl && availableGeneral.some((o) => o.value === optionFromUrl)) {
      return optionFromUrl
    }
    return availableGeneral[0]?.value ?? 'catalog'
  })

  const openCustomerCreate = searchParams.get('new') === '1' && section === 'customers'

  useEffect(() => {
    const fromUrl = searchParams.get('section') as SettingsSectionKey | null
    if (fromUrl && canAccessSettingsSection(role, fromUrl)) {
      setSection(fromUrl)
    } else {
      setSection(null)
    }
    const opt = searchParams.get('option') as GeneralOptionKey | null
    if (opt && availableGeneral.some((o) => o.value === opt)) {
      setGeneralOption(opt)
    }
  }, [searchParams, role, availableGeneral])

  const clearNewParam = () => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('new')
        return next
      },
      { replace: true },
    )
  }

  if (availableSections.length === 0) {
    return <Navigate to="/more" replace />
  }

  if (!section) {
    return <Navigate to="/more" replace />
  }

  const sectionMeta = SETTINGS_SECTIONS.find((s) => s.value === section)
  const generalMeta = GENERAL_OPTIONS.find((o) => o.value === generalOption)
  const title =
    section === 'general' ? (generalMeta?.label ?? 'General') : (sectionMeta?.label ?? 'Settings')

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link
          to="/more"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition-colors hover:bg-gray-50 dark:border-[#2a3040] dark:text-gray-300 dark:hover:bg-[#252d3d]"
          aria-label="Back to More"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{title}</h1>
      </div>

      <div>
        {section === 'shop' && <ShopProfileSettings />}
        {section === 'users' && <UserManagement />}
        {section === 'customers' && (
          <CustomerManagement
            autoOpenCreate={openCustomerCreate}
            onAutoOpenCreateHandled={clearNewParam}
          />
        )}
        {section === 'products' && <ProductManagement />}
        {section === 'pricing' && <PricingManagement />}
        {section === 'numberformat' && <NumberFormatSettings />}
        {section === 'general' && generalOption === 'catalog' && <CatalogProductManagement />}
        {section === 'general' && generalOption === 'ledger' && <LedgerMaintenanceSettings />}
        {section === 'general' && generalOption === 'activity' && <ActivityLogsSettings />}
      </div>
    </div>
  )
}
