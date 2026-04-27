import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://bqbgtkqouivqelgmaizj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxYmd0a3FvdWl2cWVsZ21haXpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyODQyMzIsImV4cCI6MjA4ODg2MDIzMn0.2XR6CsadVvJ8OlysLzlj1B0V01jlUZ4JDmWwQDFwYmc'
)

async function test() {
  const result = await supabase
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
      order_items(id,product_id,quantity,price,notes),
      deliveries(id,fee_cents,street,number,neighborhood,city,complement)
    `)
    .limit(1)

  console.log('Result:', JSON.stringify(result, null, 2))
}

test()
