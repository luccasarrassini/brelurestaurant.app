import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-abacatepay-signature',
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
  const webhookSecret = Deno.env.get('ABACATEPAY_WEBHOOK_SECRET')

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response('Server misconfigured', { status: 500 })
  }

  // STEP 1: Validate HMAC-SHA256 signature BEFORE anything else
  const signature = req.headers.get('x-abacatepay-signature')
  const rawBody = await req.text()

  if (webhookSecret && signature) {
    try {
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(webhookSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify'],
      )

      const signatureBytes = new Uint8Array(
        signature.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)),
      )

      const isValid = await crypto.subtle.verify(
        'HMAC',
        key,
        signatureBytes,
        new TextEncoder().encode(rawBody),
      )

      if (!isValid) {
        console.error('[Webhook] Invalid HMAC signature')
        return new Response('Forbidden', { status: 403 })
      }
    } catch (err) {
      console.error('[Webhook] HMAC verification error:', err)
      return new Response('Forbidden', { status: 403 })
    }
  } else if (webhookSecret && !signature) {
    // Secret is configured but no signature provided — reject
    console.error('[Webhook] Missing signature header')
    return new Response('Forbidden', { status: 403 })
  } else {
    // No webhook secret configured — dev mode, log warning
    console.warn('[Webhook] No ABACATEPAY_WEBHOOK_SECRET configured, skipping HMAC validation')
  }

  // STEP 2: Parse event
  let payload: { event: string; data: Record<string, unknown> }
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const { event, data } = payload

  // STEP 3: Process events
  if (event === 'billing.paid') {
    const metadata = data.metadata as { order_id?: string; restaurant_id?: string } | undefined
    const orderId = metadata?.order_id

    if (!orderId) {
      console.error('[Webhook] billing.paid missing order_id in metadata')
      return new Response('OK', { status: 200 })
    }

    // Idempotency check
    const { data: order } = await admin
      .from('orders')
      .select('status')
      .eq('id', orderId)
      .single()

    if (order?.status === 'paid') {
      console.log(`[Webhook] Order ${orderId} already paid, skip`)
      return new Response('OK', { status: 200 })
    }

    // Update order status
    const { error: updateError } = await admin
      .from('orders')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
      })
      .eq('id', orderId)

    if (updateError) {
      console.error('[Webhook] Error updating order:', updateError)
    } else {
      console.log(`[Webhook] Order ${orderId} marked as paid`)
    }

    // WhatsApp notification (mock in dev)
    console.log(`[WhatsApp] Pagamento confirmado! Pedido ${orderId} em preparo.`)
  }

  if (event === 'subscription.cancelled') {
    const metadata = data.metadata as { restaurant_id?: string } | undefined
    const restaurantId = metadata?.restaurant_id

    if (restaurantId) {
      await admin
        .from('restaurants')
        .update({ is_active: false })
        .eq('id', restaurantId)

      console.log(`[Webhook] Restaurant ${restaurantId} deactivated — subscription cancelled`)
    }
  }

  if (event === 'subscription.payment_failed') {
    const metadata = data.metadata as { restaurant_id?: string } | undefined
    console.log(`[WhatsApp] Falha no pagamento da mensalidade! Restaurant: ${metadata?.restaurant_id}`)
  }

  // STEP 4: Always respond 200
  return new Response('OK', { status: 200 })
})
