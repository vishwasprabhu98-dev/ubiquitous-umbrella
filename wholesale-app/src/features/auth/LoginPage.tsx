import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, ShoppingCart, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { getAuthErrorMessage } from '@/lib/authErrors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

type LoginFormData = z.infer<typeof loginSchema>

export default function LoginPage() {
  const { user, loading, login } = useAuth()
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!loading && user) {
      navigate('/', { replace: true })
    }
  }, [user, loading, navigate])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({ resolver: zodResolver(loginSchema) })

  const onSubmit = async (data: LoginFormData) => {
    setError('')
    try {
      await login(data.email, data.password)
      navigate('/', { replace: true })
    } catch (err) {
      console.error('Login failed:', err)
      setError(getAuthErrorMessage(err))
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-100 dark:from-[#141720] dark:via-[#181c26] dark:to-[#1a1f2e] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="h-14 w-14 rounded-2xl bg-blue-600 flex items-center justify-center mb-4 shadow-lg">
            <ShoppingCart className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">WholesalePro</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Business Management System
          </p>
        </div>

        <Card className="shadow-xl border-0 bg-white/80 dark:bg-[#1e2330]/90 backdrop-blur-sm">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl">Sign in to your account</CardTitle>
            <CardDescription>Enter your credentials to access the dashboard</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  {...register('email')}
                  className={errors.email ? 'border-red-500' : ''}
                />
                {errors.email && (
                  <p className="text-xs text-red-500">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    {...register('password')}
                    className={errors.password ? 'border-red-500 pr-10' : 'pr-10'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-xs text-red-500">{errors.password.message}</p>
                )}
              </div>

              {error && (
                <div className="rounded-md bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 p-3 space-y-1">
                  <p className="text-sm font-medium text-red-700 dark:text-red-300">Sign-in failed</p>
                  <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
                  <a
                    href="https://console.firebase.google.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 underline block mt-1"
                  >
                    Open Firebase Console →
                  </a>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign in'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-gray-500 dark:text-gray-400 mt-6">
          © 2024 WholesalePro · Secure Business Management
        </p>
      </div>
    </div>
  )
}
