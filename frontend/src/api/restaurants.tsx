import { supabase } from '../lib/supabase'

export type Restaurant = {
  id: string
  name: string
  slug: string
  phone: string | null
  created_at: string
}

export async function fetchRestaurantBySlug(slug: string) {
  return supabase
    .from('restaurants')
    .select('id,name,slug,phone,created_at')
    .eq('slug', slug)
    .maybeSingle()
}
