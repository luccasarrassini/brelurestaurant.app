import { supabase } from '../lib/supabase'

export type CartItemInput = {
  product_id: string
  quantity: number
  notes?: string
}

export type CreateOrderResponse = {
  order_id: string
  total_cents: number
  items: Array<{
    product_id: string
    name: string
    price_cents: number
    quantity: number
  }>
}

export type OrderPaymentInput = {
  method: 'pix' | 'cash' | 'card' | 'other' | 'split'
  amount_cents: number
  change_cents?: number
}

export type OrderDeliveryInput = {
  type: 'delivery' | 'pickup' | 'dine_in'
  fee_cents?: number
  address_id?: string
  address?: {
    postal_code: string
    street: string
    number: string
    neighborhood: string
    city: string
    complement?: string
  }
}

export type PdvOrderInput = {
  source: 'pdv'
  customer?: {
    id?: string
    name?: string
    phone?: string
    phone_digits?: string
    notes?: string
  }
  delivery?: OrderDeliveryInput
  payments?: OrderPaymentInput[]
  nf_requested?: boolean
  prepare_by?: string
  status?: string
  order_notes?: string
}

export async function createOrder(
  restaurantId: string,
  items: CartItemInput[],
  pdvInput?: PdvOrderInput,
) {
  return supabase.functions.invoke<CreateOrderResponse>('create-order', {
    body: {
      restaurant_id: restaurantId,
      items,
      ...(pdvInput ?? {}),
    },
  })
}
