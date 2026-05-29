import { supabase } from '../lib/supabase'

export type RestaurantSummary = {
  id: string
  name: string
  slug: string
  phone: string | null
  address: string | null
  description: string | null
  is_open: boolean | null
  is_public: boolean | null
  is_active: boolean | null
  role: 'owner' | 'admin' | 'staff'
}

export type OrderSummary = {
  id: string
  status: string | null
  subtotal: number | null
  delivery_fee: number | null
  total: number | null
  payment_method: string | null
  customer_id: string | null
  printed: boolean | null
  created_at: string | null
  prepare_by: string | null
  nf_requested: boolean | null
  order_number: number | null
  customer_name: string | null
  customer_phone: string | null
  order_items: Array<{
    id: string
    product_id: string
    quantity: number
    price: number
    price_cents_snapshot: number
    name_snapshot: string
    notes: string | null
  }> | null
  deliveries: Array<{
    id: string
    delivery_type: 'delivery' | 'pickup' | 'dine_in'
    fee_cents: number
    street: string | null
    number: string | null
    neighborhood: string | null
    city: string | null
    complement: string | null
    driver_id?: string | null
  }> | null
  payments: Array<{
    id: string
    method: string
    amount_cents: number
    change_cents: number
  }> | null
}

export async function fetchRestaurantsForUser(userId: string) {
  const memberResult = await supabase
    .from('restaurant_users')
    .select('restaurant_id, role')
    .eq('user_id', userId)

  if (memberResult.error) return memberResult

  const memberIds = (memberResult.data ?? [])
    .filter((row) => row.role === 'owner' || row.role === 'admin')
    .map((row) => row.restaurant_id)
  const memberRoles = new Map(
    (memberResult.data ?? []).map((row) => [row.restaurant_id, row.role as RestaurantSummary['role']]),
  )

  const ownerResult = await supabase
    .from('restaurants')
    .select('id,name,slug,phone,address,description,is_open,is_public,is_active')
    .eq('owner_id', userId)

  if (ownerResult.error) return ownerResult

  const ownerIds = (ownerResult.data ?? []).map((row) => row.id)
  const allIds = Array.from(new Set([...memberIds, ...ownerIds]))

  if (allIds.length === 0) {
    return { data: [] as RestaurantSummary[], error: null }
  }

  const restaurantsResult = await supabase
    .from('restaurants')
    .select('id,name,slug,phone,address,description,is_open,is_public,is_active')
    .in('id', allIds)

  if (restaurantsResult.error) return restaurantsResult

  const restaurants = (restaurantsResult.data ?? []).map((row) => ({
    ...row,
    role: memberRoles.get(row.id) ?? (ownerIds.includes(row.id) ? 'owner' : 'staff'),
  })) as RestaurantSummary[]

  return { data: restaurants, error: null }
}

export async function fetchOrdersForRestaurant(restaurantId: string, limit?: number, startDate?: string, endDate?: string) {
  let query = supabase
    .from('orders')
    .select(`
      id,
      status,
      subtotal,
      delivery_fee,
      total,
      payment_method,
      customer_id,
      printed,
      created_at,
      prepare_by,
      nf_requested,
      customer_name,
      customer_phone,
      order_notes,
      delivery_type,
      order_number,
      order_items(id,product_id,quantity,price,price_cents_snapshot,name_snapshot,notes),
      deliveries(id,delivery_type,fee_cents,street,number,neighborhood,city,complement,driver_id),
      payments:order_payments(id,method,amount_cents,change_cents)
    `)
    .eq('restaurant_id', restaurantId)

  if (startDate) {
    query = query.gte('created_at', startDate)
  }
  
  if (endDate) {
    query = query.lte('created_at', endDate + 'T23:59:59.999Z')
  }

  query = query.order('created_at', { ascending: false })

  if (limit) {
    query = query.limit(limit)
  }

  return query
}

export async function updateOrderStatus(orderId: string, status: string) {
  return supabase.from('orders').update({ status }).eq('id', orderId).select().single()
}

export async function fetchOrderPayments(orderId: string) {
  return supabase
    .from('order_payments')
    .select('id, method, amount_cents, change_cents')
    .eq('order_id', orderId)
}
