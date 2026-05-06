import { supabase } from '../lib/supabase'

export type ProductImage = {
  id: string
  restaurant_id: string
  product_id: string
  url: string
  sort_order: number | null
  created_at: string
}

export async function fetchProductImages(restaurantId: string) {
  return supabase
    .from('product_images')
    .select('id,restaurant_id,product_id,url,sort_order,created_at')
    .eq('restaurant_id', restaurantId)
    .order('sort_order', { ascending: true })
}

export async function createProductImage(input: Omit<ProductImage, 'id' | 'created_at'>) {
  return supabase.from('product_images').insert(input).select().single()
}

export async function deleteProductImage(id: string) {
  return supabase.from('product_images').delete().eq('id', id)
}
