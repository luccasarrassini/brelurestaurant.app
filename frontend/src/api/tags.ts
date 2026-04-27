import { supabase } from '../lib/supabase'

export type ProductTag = {
  id: string
  restaurant_id: string
  name: string
  created_at: string
}

export type ProductTagLink = {
  product_id: string
  tag_id: string
}

export async function fetchTags(restaurantId: string) {
  return supabase
    .from('product_tags')
    .select('id,restaurant_id,name,created_at')
    .eq('restaurant_id', restaurantId)
    .order('name', { ascending: true })
}

export async function createTag(input: Omit<ProductTag, 'id' | 'created_at'>) {
  return supabase.from('product_tags').insert(input).select().single()
}

export async function deleteTag(id: string) {
  return supabase.from('product_tags').delete().eq('id', id)
}

export async function fetchTagLinks(productId: string) {
  return supabase
    .from('product_tag_links')
    .select('product_id,tag_id')
    .eq('product_id', productId)
}

export async function addTagToProduct(productId: string, tagId: string) {
  return supabase
    .from('product_tag_links')
    .insert({ product_id: productId, tag_id: tagId })
    .select()
    .single()
}

export async function removeTagFromProduct(productId: string, tagId: string) {
  return supabase.from('product_tag_links').delete().eq('product_id', productId).eq('tag_id', tagId)
}
