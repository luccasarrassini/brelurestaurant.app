'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useAdmin } from './AdminContext'

export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const { loading, hasAccess } = useAdmin()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !hasAccess) {
      router.replace('/login')
    }
  }, [loading, hasAccess, router])

  if (loading) {
    return <p>Carregando...</p>
  }

  if (!hasAccess) {
    return null
  }

  return <>{children}</>
}
