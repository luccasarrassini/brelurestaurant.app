'use client'

import ProtectedRoute from '@/components/ProtectedRoute'
import AdminRoute from '@/components/AdminRoute'

export default function DeliveriesLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <AdminRoute>
        {children}
      </AdminRoute>
    </ProtectedRoute>
  )
}
