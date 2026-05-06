'use client'

import { AuthProvider } from '@/lib/auth'
import { AdminProvider } from '@/components/AdminContext'
import { ToastProvider } from '@/components/Toast'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AdminProvider>
        <ToastProvider>
          {children}
        </ToastProvider>
      </AdminProvider>
    </AuthProvider>
  )
}
