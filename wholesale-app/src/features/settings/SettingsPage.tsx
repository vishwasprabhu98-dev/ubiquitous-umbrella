import { useState } from 'react'
import {
  Users,
  Package,
  Tags,
  Hash,
  Store,
  ShieldCheck,
  RefreshCw,
  Images,
  ScrollText,
  SlidersHorizontal,
} from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import CustomerManagement from './CustomerManagement'
import ProductManagement from './ProductManagement'
import CatalogProductManagement from './CatalogProductManagement'
import PricingManagement from './PricingManagement'
import NumberFormatSettings from './NumberFormatSettings'
import ShopProfileSettings from './ShopProfileSettings'
import LedgerMaintenanceSettings from './LedgerMaintenanceSettings'
import UserManagement from './UserManagement'
import ActivityLogsSettings from './ActivityLogsSettings'

const SETTINGS_SECTIONS = [
  { value: 'shop', label: 'Shop Profile', icon: Store },
  { value: 'users', label: 'Users', icon: ShieldCheck },
  { value: 'customers', label: 'Customers', icon: Users },
  { value: 'products', label: 'Products', icon: Package },
  { value: 'pricing', label: 'Custom Pricing', icon: Tags },
  { value: 'numberformat', label: 'Number Format', icon: Hash },
  { value: 'general', label: 'General', icon: SlidersHorizontal },
] as const

const GENERAL_OPTIONS = [
  { value: 'catalog', label: 'Catalog Products', icon: Images },
  { value: 'ledger', label: 'Ledger', icon: RefreshCw },
  { value: 'activity', label: 'Activity Logs', icon: ScrollText },
] as const

type SettingsSection = (typeof SETTINGS_SECTIONS)[number]['value']
type GeneralOption = (typeof GENERAL_OPTIONS)[number]['value']

export default function SettingsPage() {
  const [section, setSection] = useState<SettingsSection>('shop')
  const [generalOption, setGeneralOption] = useState<GeneralOption>('catalog')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
          Manage shop profile, users, customers, products, pricing, and general options
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
        <div className="space-y-2">
          <Label htmlFor="settings-section">Settings section</Label>
          <Select value={section} onValueChange={(v) => setSection(v as SettingsSection)}>
            <SelectTrigger id="settings-section" className="h-11">
              <SelectValue placeholder="Select section" />
            </SelectTrigger>
            <SelectContent>
              {SETTINGS_SECTIONS.map((item) => {
                const Icon = item.icon
                return (
                  <SelectItem key={item.value} value={item.value}>
                    <span className="flex items-center gap-2">
                      <Icon className="h-4 w-4 shrink-0 text-gray-500" />
                      {item.label}
                    </span>
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </div>

        {section === 'general' && (
          <div className="space-y-2">
            <Label htmlFor="general-option">General</Label>
            <Select
              value={generalOption}
              onValueChange={(v) => setGeneralOption(v as GeneralOption)}
            >
              <SelectTrigger id="general-option" className="h-11">
                <SelectValue placeholder="Select option" />
              </SelectTrigger>
              <SelectContent>
                {GENERAL_OPTIONS.map((item) => {
                  const Icon = item.icon
                  return (
                    <SelectItem key={item.value} value={item.value}>
                      <span className="flex items-center gap-2">
                        <Icon className="h-4 w-4 shrink-0 text-gray-500" />
                        {item.label}
                      </span>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="mt-2">
        {section === 'shop' && <ShopProfileSettings />}
        {section === 'users' && <UserManagement />}
        {section === 'customers' && <CustomerManagement />}
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
