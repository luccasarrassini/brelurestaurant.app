import { supabase } from '../lib/supabase'

export type Driver = {
  id: string
  restaurant_id: string
  name: string
  phone: string | null
  vehicle_type: 'moto' | 'carro' | 'bike' | null
  status: 'available' | 'delivering' | 'offline'
  created_at?: string
}

export async function fetchDrivers(restaurantId: string) {
  return supabase
    .from('drivers')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('name')
}

export async function upsertDriver(driver: Partial<Driver> & { restaurant_id: string }) {
  if (driver.id) {
    const { id, ...updateData } = driver
    return supabase
      .from('drivers')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()
  } else {
    return supabase
      .from('drivers')
      .insert(driver)
      .select()
      .single()
  }
}

export async function deleteDriver(id: string) {
  return supabase.from('drivers').delete().eq('id', id)
}
