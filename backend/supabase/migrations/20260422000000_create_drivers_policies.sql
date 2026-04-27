-- ================================================
-- Migration: Add RLS policies to drivers table
-- ensures the frontend can insert, update, and read drivers
-- ================================================

-- Create drivers table if it doesn't exist (it should, but just in case for local dev)
CREATE TABLE IF NOT EXISTS drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  vehicle_type VARCHAR(20) CHECK (vehicle_type IN ('moto', 'carro', 'bike')),
  status VARCHAR(20) DEFAULT 'offline' CHECK (status IN ('available', 'delivering', 'offline')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;

-- Select policy
CREATE POLICY "drivers: select for restaurant members"
  ON drivers FOR SELECT
  USING (
    restaurant_id IN (
      SELECT restaurant_id FROM restaurant_users WHERE user_id = auth.uid()
      UNION
      SELECT id FROM restaurants WHERE owner_id = auth.uid()
    )
  );

-- Insert policy
CREATE POLICY "drivers: insert for restaurant members"
  ON drivers FOR INSERT
  WITH CHECK (
    restaurant_id IN (
      SELECT restaurant_id FROM restaurant_users WHERE user_id = auth.uid()
      UNION
      SELECT id FROM restaurants WHERE owner_id = auth.uid()
    )
  );

-- Update policy
CREATE POLICY "drivers: update for restaurant members"
  ON drivers FOR UPDATE
  USING (
    restaurant_id IN (
      SELECT restaurant_id FROM restaurant_users WHERE user_id = auth.uid()
      UNION
      SELECT id FROM restaurants WHERE owner_id = auth.uid()
    )
  );

-- Delete policy
CREATE POLICY "drivers: delete for restaurant members"
  ON drivers FOR DELETE
  USING (
    restaurant_id IN (
      SELECT restaurant_id FROM restaurant_users WHERE user_id = auth.uid()
      UNION
      SELECT id FROM restaurants WHERE owner_id = auth.uid()
    )
  );
