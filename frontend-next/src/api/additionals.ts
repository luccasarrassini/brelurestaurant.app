import { supabase } from '../lib/supabase'

export type AdditionalGroup = {
  id: string
  restaurant_id: string
  name: string
  min_select: number
  max_select: number
  is_required: boolean
  sort_order: number
  created_at: string
}

export type AdditionalItem = {
  id: string
  group_id: string
  name: string
  price_cents: number
  created_at: string
}

export async function fetchAdditionalGroups(restaurantId: string) {
  return supabase
    .from('product_additional_groups')
    .select('id,restaurant_id,name,min_select,max_select,is_required,sort_order,created_at')
    .eq('restaurant_id', restaurantId)
    .order('sort_order', { ascending: true })
}

export async function createAdditionalGroup(
  input: Omit<AdditionalGroup, 'id' | 'created_at'>,
) {
  return supabase.from('product_additional_groups').insert(input).select().single()
}

export async function deleteAdditionalGroup(id: string) {
  return supabase.from('product_additional_groups').delete().eq('id', id)
}

export async function fetchAdditionals(groupId: string) {
  return supabase
    .from('product_additionals')
    .select('id,group_id,name,price_cents,created_at')
    .eq('group_id', groupId)
    .order('created_at', { ascending: true })
}

export async function createAdditional(
  input: Omit<AdditionalItem, 'id' | 'created_at'>,
) {
  return supabase.from('product_additionals').insert(input).select().single()
}

export async function deleteAdditional(id: string) {
  return supabase.from('product_additionals').delete().eq('id', id)
}

export async function fetchAdditionalGroupLinks(productId: string) {
  return supabase
    .from('product_additional_group_links')
    .select('product_id,group_id')
    .eq('product_id', productId)
}

export async function addGroupToProduct(productId: string, groupId: string) {
  return supabase
    .from('product_additional_group_links')
    .insert({ product_id: productId, group_id: groupId })
    .select()
    .single()
}

export async function removeGroupFromProduct(productId: string, groupId: string) {
  return supabase
    .from('product_additional_group_links')
    .delete()
    .eq('product_id', productId)
    .eq('group_id', groupId)
}
