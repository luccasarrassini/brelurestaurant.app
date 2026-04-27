import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** Send WhatsApp — mocks automatically when Evolution API not configured */
async function sendWhatsApp(phone: string, message: string) {
  const url = Deno.env.get('EVOLUTION_API_URL')
  const key = Deno.env.get('EVOLUTION_API_KEY')
  const isDev = Deno.env.get('NODE_ENV') === 'development'

  if (isDev || !url) {
    const safePhone = phone.length > 4 ? `***${phone.slice(-4)}` : '****'
    console.log(`[WhatsApp MOCK] ${safePhone}: ${message.slice(0, 80)}...`)
    return { success: true, mock: true }
  }

  try {
    const res = await fetch(`${url}/message/sendText`, {
      method: 'POST',
      headers: {
        apikey: key || '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ number: phone, text: message }),
    })
    return { success: res.ok }
  } catch (e) {
    console.error('[WhatsApp Error]', e)
    return { success: false, error: String(e) }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response('Server misconfigured', { status: 500, headers: corsHeaders })
  }

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const THRESHOLD_MINUTES = 12
    const thresholdTime = new Date()
    thresholdTime.setMinutes(thresholdTime.getMinutes() - THRESHOLD_MINUTES)

    // Find stuck orders: pending or preparing, not updated in > 12 min
    const { data: stuckOrders, error: stuckError } = await supabase
      .from('orders')
      .select(
        'id, order_number, status, updated_at, restaurant_id, restaurant:restaurants(id, name, phone, phone_whatsapp)',
      )
      .in('status', ['pending', 'preparing'])
      .lt('updated_at', thresholdTime.toISOString())

    if (stuckError) throw stuckError

    let alerted = 0
    const DEDUP_WINDOW_MS = 30 * 60 * 1000 // 30 minutes

    for (const order of stuckOrders || []) {
      try {
        // Deduplication: check if we already alerted for this order in the last 30 min
        const { data: recentAlert } = await supabase
          .from('whatsapp_alerts_log')
          .select('id')
          .eq('order_id', order.id)
          .eq('type', 'pedido_parado')
          .gte('sent_at', new Date(Date.now() - DEDUP_WINDOW_MS).toISOString())
          .limit(1)

        if (recentAlert && recentAlert.length > 0) continue

        const restaurant = order.restaurant as {
          id: string
          name: string
          phone: string | null
          phone_whatsapp: string | null
        } | null
        if (!restaurant) continue

        const whatsappPhone = restaurant.phone_whatsapp || restaurant.phone
        if (!whatsappPhone) continue

        const minutesStuck = Math.floor(
          (Date.now() - new Date(order.updated_at).getTime()) / 60_000,
        )

        const statusLabel = order.status === 'pending' ? 'Pendente' : 'Em preparo'

        const message = `⚠️ *ATENÇÃO: Pedido Parado!*

Pedido: *#${order.order_number || order.id.slice(0, 6)}*
Status: *${statusLabel}*
Sem atualização há: *${minutesStuck} minutos*

Por favor, verifique o KDS! 🍳`

        const digits = whatsappPhone.replace(/\D/g, '')
        const phone = digits.startsWith('55') ? digits : `55${digits}`
        await sendWhatsApp(phone, message)

        // Log the alert for deduplication
        await supabase.from('whatsapp_alerts_log').insert({
          restaurant_id: restaurant.id,
          order_id: order.id,
          type: 'pedido_parado',
        })

        alerted++
      } catch (err) {
        console.error(`[order-stuck-alert] Error for order ${order.id}:`, err)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        alerted,
        checked: stuckOrders?.length || 0,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    console.error('[order-stuck-alert error]:', error)
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
