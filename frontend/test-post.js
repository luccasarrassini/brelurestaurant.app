import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://bqbgtkqouivqelgmaizj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxYmd0a3FvdWl2cWVsZ21haXpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyODQyMzIsImV4cCI6MjA4ODg2MDIzMn0.2XR6CsadVvJ8OlysLzlj1B0V01jlUZ4JDmWwQDFwYmc'
)

async function runTests() {
  // Test upsert without an ID - we need to see what happens when the table has no primary key, but we can't create one.
  // Instead, let's just make a POST using standard fetch to see the raw error from `/drivers` with our payload.
  const payload = {
    name: 'test',
    restaurant_id: '123e4567-e89b-12d3-a456-426614174000',
    vehicle_type: 'moto',
    status: 'available'
  }
  
  const res = await fetch('https://bqbgtkqouivqelgmaizj.supabase.co/rest/v1/drivers?on_conflict=id&select=*', {
    method: 'POST',
    headers: {
      'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxYmd0a3FvdWl2cWVsZ21haXpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyODQyMzIsImV4cCI6MjA4ODg2MDIzMn0.2XR6CsadVvJ8OlysLzlj1B0V01jlUZ4JDmWwQDFwYmc',
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates, return=representation'
    },
    body: JSON.stringify(payload)
  })
  
  const text = await res.text()
  console.log('HTTP Status:', res.status)
  console.log('Response body:', text)
}

runTests()
