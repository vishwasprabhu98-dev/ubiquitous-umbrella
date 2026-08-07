import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { useEffect } from 'react'
import { useThemeStore } from '@/stores/themeStore'
import { useAuth } from '@/hooks/useAuth'
import { useShopName } from '@/hooks/useShopName'
import AppLayout from '@/components/layout/AppLayout'
import ProtectedRoute from '@/routes/ProtectedRoute'
import LoginPage from '@/features/auth/LoginPage'
import DashboardPage from '@/features/dashboard/DashboardPage'
import BillingPage from '@/features/billing/BillingPage'
import OrdersPage from '@/features/orders/OrdersPage'
import BalanceSheetPage from '@/features/balance-sheet/BalanceSheetPage'
import SettingsPage from '@/features/settings/SettingsPage'
import LedgerPage from '@/features/ledger/LedgerPage'
import PurchasePage from '@/features/purchases/PurchasePage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
})

function ThemeInitializer() {
  const { isDark } = useThemeStore()
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
  }, [isDark])
  return null
}

function AuthInitializer() {
  useAuth()
  return null
}

function ShopNameInitializer() {
  useShopName()
  return null
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeInitializer />
        <AuthInitializer />
        <ShopNameInitializer />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="billing" element={<BillingPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="ledger" element={<LedgerPage />} />
            <Route path="ledger/new" element={<LedgerPage />} />
            <Route
              path="purchases"
              element={
                <ProtectedRoute allowedRoles={['finance', 'admin']}>
                  <PurchasePage />
                </ProtectedRoute>
              }
            />
            <Route path="balance-sheet" element={<BalanceSheetPage />} />
            <Route
              path="settings"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <SettingsPage />
                </ProtectedRoute>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster position="top-right" richColors closeButton />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
