import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://bqbgtkqouivqelgmaizj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxYmd0a3FvdWl2cWVsZ21haXpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyODQyMzIsImV4cCI6MjA4ODg2MDIzMn0.2XR6CsadVvJ8OlysLzlj1B0V01jlUZ4JDmWwQDFwYmc'
)

async function testUpsert() {
  console.log('Testing driver upsert...')
  const payload = {
    name: 'Test Driver',
    phone: '11999999999',
    vehicle_type: 'moto',
    status: 'offline',
    restaurant_id: '123e4567-e89b-12d3-a456-426614174000'
  }
  
  const { data, error } = await supabase.from('drivers').upsert([payload]).select().single()
  console.log('Upsert Error details:', JSON.stringify(error, null, 2))
}

testUpsert()
