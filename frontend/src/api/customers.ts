import { supabase } from '../lib/supabase'

export type Customer = {
  id: string
  restaurant_id: string
  name: string
  phone: string
  phone_digits: string
  notes: string | null
  created_at: string
}

export type CustomerAddress = {
  id: string
  restaurant_id: string
  customer_id: string
  postal_code: string
  street: string
  number: string
  neighborhood: string
  city: string
  complement: string | null
  is_default: boolean
  created_at: string
}

export async function fetchCustomersByPhone(restaurantId: string, phoneDigits: string) {
  if (!phoneDigits) {
    return { data: [] as Customer[], error: null }
  }
  return supabase
    .from('customers')
    .select('id,restaurant_id,name,phone,phone_digits,notes,created_at')
    .eq('restaurant_id', restaurantId)
    .ilike('phone_digits', `%${phoneDigits}%`)
    .order('created_at', { ascending: false })
    .limit(5)
}

export async function upsertCustomer(input: {
  restaurant_id: string
  name: string
  phone: string
  phone_digits: string
  notes?: string | null
}) {
  return supabase
    .from('customers')
    .upsert(
      {
        restaurant_id: input.restaurant_id,
        name: input.name,
        phone: input.phone,
        phone_digits: input.phone_digits,
        notes: input.notes ?? null,
      },
      { onConflict: 'restaurant_id,phone_digits' },
    )
    .select()
    .single()
}

export async function fetchCustomerAddresses(customerId: string) {
  return supabase
    .from('customer_addresses')
    .select(
      'id,restaurant_id,customer_id,postal_code,street,number,neighborhood,city,complement,is_default,created_at',
    )
    .eq('customer_id', customerId)
    .order('is_default', { ascending: false })
}

export async function createCustomerAddress(
  input: Omit<CustomerAddress, 'id' | 'created_at'>,
) {
  return supabase.from('customer_addresses').insert(input).select().single()
}

export async function updateCustomerAddress(
  id: string,
  input: Partial<CustomerAddress>,
) {
  return supabase.from('customer_addresses').update(input).eq('id', id).select().single()
}

export async function deleteCustomerAddress(id: string) {
  return supabase.from('customer_addresses').delete().eq('id', id)
}
