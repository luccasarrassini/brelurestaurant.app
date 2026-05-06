import { supabase } from '../lib/supabase'

export type Category = {
  id: string
  restaurant_id: string
  name: string
  description: string | null
  sort_order: number | null
  is_active: boolean
  model: string | null
  is_promo: boolean
  availability_mode: string
  availability_rules: Record<string, unknown> | null
  channel_visibility: Record<string, boolean> | null
}

export type Product = {
  id: string
  restaurant_id: string
  category_id: string | null
  name: string
  description: string | null
  price_cents: number
  stock_qty: number | null
  is_active: boolean
  sort_order: number | null
  is_out_of_stock: boolean
  is_sold_by_weight: boolean
  availability_mode: string
  availability_rules: Record<string, unknown> | null
}

export async function fetchCategories(restaurantId: string) {
  return supabase
    .from('categories')
    .select(
      'id,restaurant_id,name,description,sort_order,is_active,model,is_promo,availability_mode,availability_rules,channel_visibility',
    )
    .eq('restaurant_id', restaurantId)
    .order('sort_order', { ascending: true })
}

export async function fetchCategoryById(id: string) {
  return supabase
    .from('categories')
    .select(
      'id,restaurant_id,name,description,sort_order,is_active,model,is_promo,availability_mode,availability_rules,channel_visibility',
    )
    .eq('id', id)
    .single()
}

export async function fetchProducts(restaurantId: string) {
  return supabase
    .from('products')
    .select(
      'id,restaurant_id,category_id,name,description,price_cents,stock_qty,is_active,sort_order,is_out_of_stock,is_sold_by_weight,availability_mode,availability_rules',
    )
    .eq('restaurant_id', restaurantId)
    .order('sort_order', { ascending: true })
}

export async function fetchProductById(id: string) {
  return supabase
    .from('products')
    .select(
      'id,restaurant_id,category_id,name,description,price_cents,stock_qty,is_active,sort_order,is_out_of_stock,is_sold_by_weight,availability_mode,availability_rules',
    )
    .eq('id', id)
    .single()
}

export async function createCategory(input: Omit<Category, 'id'>) {
  return supabase.from('categories').insert(input).select().single()
}

export async function updateCategory(id: string, input: Partial<Category>) {
  return supabase.from('categories').update(input).eq('id', id).select().single()
}

export async function deleteCategory(id: string) {
  return supabase.from('categories').delete().eq('id', id)
}

export async function createProduct(input: Omit<Product, 'id'>) {
  return supabase.from('products').insert(input).select().single()
}

export async function updateProduct(id: string, input: Partial<Product>) {
  return supabase.from('products').update(input).eq('id', id).select().single()
}

export async function deleteProduct(id: string) {
  return supabase.from('products').delete().eq('id', id)
}

export async function updateProductsBulk(ids: string[], input: Partial<Product>) {
  if (ids.length === 0) {
    return { data: [], error: null }
  }
  return supabase.from('products').update(input).in('id', ids).select()
}
