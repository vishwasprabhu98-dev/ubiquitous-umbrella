import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import CustomerManagement from './CustomerManagement'
import ProductManagement from './ProductManagement'
import PricingManagement from './PricingManagement'
import NumberFormatSettings from './NumberFormatSettings'
import ShopProfileSettings from './ShopProfileSettings'
import LedgerMaintenanceSettings from './LedgerMaintenanceSettings'
import UserManagement from './UserManagement'
import { Users, Package, Tags, Hash, Store, ShieldCheck, RefreshCw } from 'lucide-react'

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
          Manage shop profile, users, customers, products, pricing, number formats, and ledger maintenance
        </p>
      </div>

      <Tabs defaultValue="shop">
        <TabsList className="grid w-full grid-cols-3 sm:grid-cols-7 lg:w-auto lg:inline-grid">
          <TabsTrigger value="shop" className="flex items-center gap-2">
            <Store className="h-4 w-4" />
            <span className="hidden sm:inline">Shop Profile</span>
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            <span className="hidden sm:inline">Users</span>
          </TabsTrigger>
          <TabsTrigger value="customers" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Customers</span>
          </TabsTrigger>
          <TabsTrigger value="products" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            <span className="hidden sm:inline">Products</span>
          </TabsTrigger>
          <TabsTrigger value="pricing" className="flex items-center gap-2">
            <Tags className="h-4 w-4" />
            <span className="hidden sm:inline">Custom Pricing</span>
          </TabsTrigger>
          <TabsTrigger value="numberformat" className="flex items-center gap-2">
            <Hash className="h-4 w-4" />
            <span className="hidden sm:inline">Number Format</span>
          </TabsTrigger>
          <TabsTrigger value="ledger" className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline">Ledger</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="shop" className="mt-6">
          <ShopProfileSettings />
        </TabsContent>
        <TabsContent value="users" className="mt-6">
          <UserManagement />
        </TabsContent>
        <TabsContent value="customers" className="mt-6">
          <CustomerManagement />
        </TabsContent>
        <TabsContent value="products" className="mt-6">
          <ProductManagement />
        </TabsContent>
        <TabsContent value="pricing" className="mt-6">
          <PricingManagement />
        </TabsContent>
        <TabsContent value="numberformat" className="mt-6">
          <NumberFormatSettings />
        </TabsContent>
        <TabsContent value="ledger" className="mt-6">
          <LedgerMaintenanceSettings />
        </TabsContent>
      </Tabs>
    </div>
  )
}
