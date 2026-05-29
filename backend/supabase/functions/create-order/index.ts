import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type CreateOrderPayload = {
  restaurant_id: string
  items: Array<{ product_id: string; quantity: number; notes?: string }>
  source?: 'public' | 'pdv'
  customer?: {
    id?: string
    name?: string
    phone?: string
    phone_digits?: string
    notes?: string
  }
  delivery?: {
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
  payments?: Array<{
    method: 'pix' | 'cash' | 'card' | 'other' | 'split'
    amount_cents: number
    change_cents?: number
  }>
  nf_requested?: boolean
  prepare_by?: string
  status?: string
  order_notes?: string
}

type OrderSummaryItem = {
  product_id: string
  name: string
  price_cents: number
  quantity: number
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? serviceRoleKey

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response('Server misconfigured', { status: 500, headers: corsHeaders })
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace('Bearer ', '')

  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // User-scoped client for auth verification only
  const userClient = createClient(supabaseUrl, anonKey!, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: userData, error: userError } = await userClient.auth.getUser()

  if (userError || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized', detail: userError?.message }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Admin client for DB operations (service role bypasses RLS)
  const admin = createClient(supabaseUrl, serviceRoleKey)

  let payload: CreateOrderPayload | null = null
  try {
    payload = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!payload?.restaurant_id || !Array.isArray(payload.items)) {
    return new Response(JSON.stringify({ error: 'Invalid payload' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (payload.items.length === 0 || payload.items.length > 100) {
    return new Response(JSON.stringify({ error: 'Invalid items length' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  for (const item of payload.items) {
    if (!item.product_id || typeof item.quantity !== 'number' || item.quantity <= 0) {
      return new Response(JSON.stringify({ error: 'Invalid items' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (item.notes && item.notes.length > 200) {
      return new Response(JSON.stringify({ error: 'Notes too long' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  if (payload.order_notes && payload.order_notes.length > 500) {
    return new Response(JSON.stringify({ error: 'Notes too long' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const source = payload.source === 'pdv' ? 'pdv' : 'public'
  const statusInput = payload.status ?? (source === 'pdv' ? 'pending' : 'created')
  const deliveryFeeCents = Math.max(0, payload.delivery?.fee_cents ?? 0)
  const customerPhoneDigits =
    payload.customer?.phone_digits ??
    (payload.customer?.phone ? payload.customer.phone.replace(/\D/g, '') : null)

  let customerRefId: string | null = payload.customer?.id ?? null
  let customerName: string | null = payload.customer?.name ?? null
  let customerPhone: string | null = payload.customer?.phone ?? null

  if (source === 'pdv' && customerRefId) {
    const existingCustomer = await admin
      .from('customers')
      .select('id,name,phone')
      .eq('id', customerRefId)
      .single()

    if (existingCustomer.error) {
      return new Response(JSON.stringify({ error: existingCustomer.error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    customerName = existingCustomer.data?.name ?? customerName
    customerPhone = existingCustomer.data?.phone ?? customerPhone
  }

  if (source === 'pdv' && customerPhoneDigits && !customerRefId) {
    const upsertResult = await admin
      .from('customers')
      .upsert(
        {
          restaurant_id: payload.restaurant_id,
          name: customerName ?? 'Cliente',
          phone: customerPhone ?? customerPhoneDigits,
          phone_digits: customerPhoneDigits,
        },
        { onConflict: 'restaurant_id,phone' },
      )
      .select('id,name,phone')
      .single()

    if (upsertResult.error) {
      return new Response(JSON.stringify({ error: upsertResult.error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    customerRefId = upsertResult.data?.id ?? null
    customerName = upsertResult.data?.name ?? customerName
    customerPhone = upsertResult.data?.phone ?? customerPhone
  }

  // FALLBACK FIX: Perform standard inserts instead of missing 'create_order_secure' RPC
  // 1. Fetch products
  const productIds = payload.items.map((i) => i.product_id)
  const { data: products, error: productsError } = await admin
    .from('products')
    .select('id, name, price_cents, stock_qty')
    .in('id', productIds)
    .eq('restaurant_id', payload.restaurant_id)
    .eq('is_active', true)

  if (productsError || !products || products.length !== productIds.length) {
    return new Response(JSON.stringify({ error: 'Um ou mais itens são inválidos ou estão inativos.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // 2. Compute total
  let subtotalSum = 0
  for (const requested of payload.items) {
    const p = products.find((x) => x.id === requested.product_id)
    if (!p) continue
    if (p.stock_qty !== null && p.stock_qty < requested.quantity) {
      return new Response(JSON.stringify({ error: `Estoque insuficiente para ${p.name}.` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    subtotalSum += p.price_cents * requested.quantity
  }
  const orderTotal = subtotalSum + deliveryFeeCents

  // 3. Create Order
  const { data: orderResult, error: orderError } = await admin
    .from('orders')
    .insert({
      restaurant_id: payload.restaurant_id,
      customer_id: source === 'pdv' ? null : userData.user.id,
      status: statusInput ?? 'pending',
      subtotal: subtotalSum,
      delivery_fee: deliveryFeeCents,
      total: orderTotal,
      payment_method: payload.payments?.[0]?.method ?? null,
      source: source,
      prepare_by: payload.prepare_by ?? new Date(Date.now() + 30 * 60000).toISOString(),
      customer_name: customerName,
      customer_phone: customerPhone,
      order_notes: payload.order_notes ?? null,
      delivery_type: payload.delivery?.type ?? 'local',
      nf_requested: payload.nf_requested ?? false,
    })
    .select('id')
    .single()

  if (orderError || !orderResult) {
    return new Response(JSON.stringify({ error: orderError?.message ?? 'Falha ao criar pedido.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // 4. Create items
  const orderItemsInsert = payload.items.map((requested) => {
    const p = products.find((x) => x.id === requested.product_id)!
    return {
      order_id: orderResult.id,
      product_id: requested.product_id,
      name_snapshot: p.name,
      price_cents_snapshot: p.price_cents,
      quantity: requested.quantity,
      notes: requested.notes ?? null,
    }
  })

  await admin.from('order_items').insert(orderItemsInsert)

  // 5. Update stock logic (simplified async)
  for (const requested of payload.items) {
    const p = products.find((x) => x.id === requested.product_id)!
    if (p.stock_qty !== null) {
      await admin.from('products').update({ stock_qty: p.stock_qty - requested.quantity }).eq('id', p.id)
    }
  }

  const result = { order_id: orderResult.id, total_cents: orderTotal }
  
  const items = payload.items.map((requested) => {
    const p = products.find((x) => x.id === requested.product_id)!
    return {
      product_id: p.id,
      name: p.name,
      price_cents: p.price_cents,
      quantity: requested.quantity
    }
  }) as OrderSummaryItem[]

  if (payload.delivery) {
    let deliveryPayload: Record<string, unknown> = {
      order_id: result?.order_id,
      delivery_type: payload.delivery.type,
      fee_cents: deliveryFeeCents,
    }

    if (payload.delivery.type === 'delivery') {
      if (payload.delivery.address_id) {
        const addressResult = await admin
          .from('customer_addresses')
          .select(
            'id,postal_code,street,number,neighborhood,city,complement',
          )
          .eq('id', payload.delivery.address_id)
          .single()

        if (addressResult.error) {
          return new Response(JSON.stringify({ error: addressResult.error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        deliveryPayload = {
          ...deliveryPayload,
          customer_address_id: addressResult.data?.id ?? null,
          postal_code: addressResult.data?.postal_code ?? null,
          street: addressResult.data?.street ?? null,
          number: addressResult.data?.number ?? null,
          neighborhood: addressResult.data?.neighborhood ?? null,
          city: addressResult.data?.city ?? null,
          complement: addressResult.data?.complement ?? null,
        }
      } else if (payload.delivery.address) {
        if (customerRefId) {
          const insertAddress = await admin
            .from('customer_addresses')
            .insert({
              restaurant_id: payload.restaurant_id,
              customer_id: customerRefId,
              postal_code: payload.delivery.address.postal_code,
              street: payload.delivery.address.street,
              number: payload.delivery.address.number,
              neighborhood: payload.delivery.address.neighborhood,
              city: payload.delivery.address.city,
              complement: payload.delivery.address.complement ?? null,
            })
            .select('id,postal_code,street,number,neighborhood,city,complement')
            .single()

          if (insertAddress.error) {
            return new Response(JSON.stringify({ error: insertAddress.error.message }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
          }

          deliveryPayload = {
            ...deliveryPayload,
            customer_address_id: insertAddress.data?.id ?? null,
            postal_code: insertAddress.data?.postal_code ?? null,
            street: insertAddress.data?.street ?? null,
            number: insertAddress.data?.number ?? null,
            neighborhood: insertAddress.data?.neighborhood ?? null,
            city: insertAddress.data?.city ?? null,
            complement: insertAddress.data?.complement ?? null,
          }
        } else {
          deliveryPayload = {
            ...deliveryPayload,
            postal_code: payload.delivery.address.postal_code,
            street: payload.delivery.address.street,
            number: payload.delivery.address.number,
            neighborhood: payload.delivery.address.neighborhood,
            city: payload.delivery.address.city,
            complement: payload.delivery.address.complement ?? null,
          }
        }
      }
    }

    const { error: deliveryInsertError } = await admin
      .from('deliveries')
      .insert(deliveryPayload)

    if (deliveryInsertError) {
      return new Response(JSON.stringify({ error: deliveryInsertError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  if (payload.payments && payload.payments.length > 0) {
    const paymentsInsert = await admin.from('order_payments').insert(
      payload.payments.map((payment) => ({
        order_id: result?.order_id,
        method: payment.method,
        amount_cents: payment.amount_cents,
        change_cents: Math.max(0, payment.change_cents ?? 0),
      })),
    )
    if (paymentsInsert.error) {
      return new Response(JSON.stringify({ error: paymentsInsert.error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  return new Response(
    JSON.stringify({
      order_id: result?.order_id,
      total_cents: result?.total_cents,
      items,
    }),
    {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  )
})
