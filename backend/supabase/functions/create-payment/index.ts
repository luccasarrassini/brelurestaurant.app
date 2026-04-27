import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
  const abacateApiKey = Deno.env.get('ABACATEPAY_API_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response('Server misconfigured', { status: 500, headers: corsHeaders })
  }

  // Auth check
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace('Bearer ', '')

  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey)

  const { data: userData, error: userError } = await admin.auth.getUser(token)
  if (userError || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: { order_id: string } | null = null
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!body?.order_id) {
    return new Response(JSON.stringify({ error: 'order_id required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Fetch order
  const { data: order, error: orderError } = await admin
    .from('orders')
    .select('id, total, restaurant_id, status')
    .eq('id', body.order_id)
    .single()

  if (orderError || !order) {
    return new Response(JSON.stringify({ error: 'Order not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Check user has access to this restaurant
  const { data: access } = await admin
    .from('restaurant_users')
    .select('role')
    .eq('user_id', userData.user.id)
    .eq('restaurant_id', order.restaurant_id)
    .maybeSingle()

  const { data: restaurant } = await admin
    .from('restaurants')
    .select('owner_id')
    .eq('id', order.restaurant_id)
    .single()

  if (!access && restaurant?.owner_id !== userData.user.id) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const totalReais = (order.total ?? 0) / 100

  // If AbacatePay key is not configured, return a mock response for dev
  if (!abacateApiKey) {
    console.log(`[Payment MOCK] Order ${body.order_id} - R$ ${totalReais.toFixed(2)}`)

    // Update billing_id with mock
    await admin
      .from('orders')
      .update({ billing_id: `mock_${body.order_id}` })
      .eq('id', body.order_id)

    return new Response(
      JSON.stringify({
        qr_code: '', // Empty base64 for mock
        copy_paste: '00020126580014br.gov.bcb.pix0116mock@brelu.com5204000053039865802BR5913BreluMock6008Brasilia62070503***6304MOCK',
        expires_at: new Date(Date.now() + 1800 * 1000).toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // Call AbacatePay API
  try {
    const response = await fetch('https://api.abacatepay.com/v1/billing', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${abacateApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: totalReais,
        expiresIn: 1800, // 30 minutes
        metadata: {
          order_id: order.id,
          restaurant_id: order.restaurant_id,
        },
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[AbacatePay Error]', errorText)
      return new Response(JSON.stringify({ error: 'Payment provider error' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const billing = await response.json()

    // Save billing_id on order
    await admin
      .from('orders')
      .update({ billing_id: billing.id })
      .eq('id', body.order_id)

    return new Response(
      JSON.stringify({
        qr_code: billing.qrCode,
        copy_paste: billing.pixCode,
        expires_at: billing.expiresAt,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[AbacatePay Exception]', err)
    return new Response(JSON.stringify({ error: 'Failed to create payment' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
