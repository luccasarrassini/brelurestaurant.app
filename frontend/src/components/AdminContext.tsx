import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { fetchRestaurantsForUser, type RestaurantSummary } from '../api/admin'
import { useAuth } from '../lib/auth'

type AdminContextValue = {
  restaurants: RestaurantSummary[]
  selectedRestaurantId: string
  setSelectedRestaurantId: (id: string) => void
  loading: boolean
  hasAccess: boolean
}

const AdminContext = createContext<AdminContextValue | undefined>(undefined)

const STORAGE_KEY = 'brelu_admin_restaurant'

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [restaurants, setRestaurants] = useState<RestaurantSummary[]>([])
  const [selectedRestaurantId, setSelectedRestaurantId] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function loadRestaurants() {
      if (!user) {
        setRestaurants([])
        setSelectedRestaurantId('')
        setLoading(false)
        return
      }

      setLoading(true)
      const result = await fetchRestaurantsForUser(user.id)
      if (!active) return

      const list = result.data ?? []
      setRestaurants(list)

      const stored = localStorage.getItem(STORAGE_KEY)
      const next =
        stored && list.some((item) => item.id === stored) ? stored : list[0]?.id ?? ''

      setSelectedRestaurantId(next)
      setLoading(false)
    }

    loadRestaurants()

    return () => {
      active = false
    }
  }, [user])

  function handleSelect(id: string) {
    setSelectedRestaurantId(id)
    if (id) {
      localStorage.setItem(STORAGE_KEY, id)
    }
  }

  const value = useMemo(
    () => ({
      restaurants,
      selectedRestaurantId,
      setSelectedRestaurantId: handleSelect,
      loading,
      hasAccess: restaurants.length > 0,
    }),
    [restaurants, selectedRestaurantId, loading],
  )

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>
}

export function useAdmin() {
  const ctx = useContext(AdminContext)
  if (!ctx) {
    throw new Error('useAdmin must be used within AdminProvider.')
  }
  return ctx
}
