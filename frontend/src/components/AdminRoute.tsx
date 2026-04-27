import { Navigate, useLocation } from 'react-router-dom'
import { useAdmin } from './AdminContext'

export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const { loading, hasAccess } = useAdmin()
  const location = useLocation()

  if (loading) {
    return <p>Carregando...</p>
  }

  if (!hasAccess) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <>{children}</>
}
