async function inspectSchema() {
  const url = 'https://bqbgtkqouivqelgmaizj.supabase.co/rest/v1/'
  const apikey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxYmd0a3FvdWl2cWVsZ21haXpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyODQyMzIsImV4cCI6MjA4ODg2MDIzMn0.2XR6CsadVvJ8OlysLzlj1B0V01jlUZ4JDmWwQDFwYmc'
  
  try {
    const res = await fetch(url, {
      headers: {
        'apikey': apikey,
        'Authorization': `Bearer ${apikey}`
      }
    })
    const json = await res.json()
    
    // Check drivers table definition
    const definitions = json.definitions || json.components?.schemas
    if (definitions && definitions.drivers) {
      console.log('DRIVERS COLUMNS:', JSON.stringify(definitions.drivers.properties, null, 2))
    } else {
      console.log('DRIVERS TABLE NOT FOUND IN SCHEMA CACHE')
    }
  } catch (err) {
    console.error('Error fetching schema:', err)
  }
}

inspectSchema()
