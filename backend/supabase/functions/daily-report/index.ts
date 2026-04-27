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

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('55') && digits.length >= 12) return digits
  if (digits.length === 11) return `55${digits}`
  return `55${digits}`
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

    // Fetch active restaurants
    const { data: restaurants, error: restError } = await supabase
      .from('restaurants')
      .select('id, name, phone, phone_whatsapp, owner_id')
      .eq('is_active', true)

    if (restError) throw restError

    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().split('T')[0]

    let processed = 0
    let errors = 0

    for (const restaurant of restaurants || []) {
      try {
        // Use phone_whatsapp or fallback to phone
        const whatsappPhone = restaurant.phone_whatsapp || restaurant.phone
        if (!whatsappPhone) {
          console.log(`[daily-report] Restaurant ${restaurant.id} has no phone, skip`)
          continue
        }

        // Today's orders (total is numeric/decimal, not cents)
        const { data: todayOrders } = await supabase
          .from('orders')
          .select(
            'id, total, status, created_at, order_items(id, quantity, product_id, products(name))',
          )
          .eq('restaurant_id', restaurant.id)
          .gte('created_at', `${todayStr}T00:00:00`)
          .neq('status', 'cancelled')

        // Yesterday's orders for comparison
        const { data: yesterdayOrders } = await supabase
          .from('orders')
          .select('total')
          .eq('restaurant_id', restaurant.id)
          .gte('created_at', `${yesterdayStr}T00:00:00`)
          .lt('created_at', `${todayStr}T00:00:00`)
          .neq('status', 'cancelled')

        const todayRevenue = todayOrders?.reduce((sum, o) => sum + (Number(o.total) || 0), 0) || 0
        const todayCount = todayOrders?.length || 0
        const avgTicket = todayCount > 0 ? todayRevenue / todayCount : 0

        const yesterdayRevenue =
          yesterdayOrders?.reduce((sum, o) => sum + (Number(o.total) || 0), 0) || 0
        const comparison =
          yesterdayRevenue > 0
            ? (((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100).toFixed(1)
            : '+0.0'

        // Most sold item
        const itemCounts: Record<string, { name: string; count: number }> = {}
        todayOrders?.forEach((order) => {
          const items = order.order_items as Array<{
            quantity: number
            products: { name: string } | null
          }> | null
          items?.forEach((item) => {
            const productName = item.products?.name || 'Produto'
            if (!itemCounts[productName]) {
              itemCounts[productName] = { name: productName, count: 0 }
            }
            itemCounts[productName].count += item.quantity
          })
        })

        const topItems = Object.values(itemCounts).sort((a, b) => b.count - a.count)
        const topItem = topItems[0]

        // Today's ratings
        const { data: ratings } = await supabase
          .from('ratings')
          .select('stars')
          .eq('restaurant_id', restaurant.id)
          .gte('created_at', `${todayStr}T00:00:00`)

        const avgRating = ratings?.length
          ? (ratings.reduce((sum, r) => sum + r.stars, 0) / ratings.length).toFixed(1)
          : 'N/A'

        const emoji = parseFloat(comparison) >= 0 ? '📈' : '📉'

        const message = `📊 *Resumo do Dia* - ${today.toLocaleDateString('pt-BR', {
          weekday: 'long',
          day: '2-digit',
          month: 'long',
        })}

💰 Faturamento: *${formatCurrency(todayRevenue)}*
🧾 Pedidos: *${todayCount}*
🎯 Ticket médio: *${formatCurrency(avgTicket)}*
${topItem ? `🏆 Mais vendido: *${topItem.name}* (${topItem.count}x)` : ''}
⭐ Avaliação média: *${avgRating}*

${emoji} vs ontem: *${comparison}%*

${parseFloat(comparison) >= 0 ? '🚀 Continue assim!' : '💪 Amanhã será melhor!'}`

        await sendWhatsApp(formatPhone(whatsappPhone), message)
        processed++
      } catch (error) {
        console.error(`[daily-report] Error restaurant ${restaurant.id}:`, error)
        errors++
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed, errors, timestamp: new Date().toISOString() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    console.error('[daily-report error]:', error)
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
