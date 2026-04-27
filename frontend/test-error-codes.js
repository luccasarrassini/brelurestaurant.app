import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://bqbgtkqouivqelgmaizj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxYmd0a3FvdWl2cWVsZ21haXpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyODQyMzIsImV4cCI6MjA4ODg2MDIzMn0.2XR6CsadVvJ8OlysLzlj1B0V01jlUZ4JDmWwQDFwYmc'
)

async function runTests() {
  // Test invalid UUID for restaurant_id
  const r1 = await supabase.from('drivers').upsert({
    name: 'test',
    restaurant_id: 'invalid-uuid',
    vehicle_type: 'moto',
    status: 'available'
  })
  console.log('Invalid UUID:', r1.error?.code, r1.error?.message)

  // Test Check constraint violation
  const r2 = await supabase.from('drivers').upsert({
    name: 'test',
    restaurant_id: '123e4567-e89b-12d3-a456-426614174000',
    vehicle_type: 'invalid',
    status: 'available'
  })
  console.log('Check constraint:', r2.error?.code, r2.error?.message)
}

runTests()
