-- ================================================
-- Migration: Add tracking_token, billing_id, paid_at, cancel_reason to orders
-- Create new tables: deliveries, ratings, daily_goals, subscriptions, whatsapp_alerts_log
-- ================================================

-- Add new columns to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_token UUID UNIQUE DEFAULT gen_random_uuid();
ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_id VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- ================================================
-- Deliveries table
-- ================================================
CREATE TABLE IF NOT EXISTS deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES drivers(id),
  tracking_token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  lat DECIMAL(10, 8),
  lng DECIMAL(11, 8),
  started_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deliveries: select for restaurant members"
  ON deliveries FOR SELECT
  USING (
    order_id IN (
      SELECT o.id FROM orders o WHERE o.restaurant_id IN (
        SELECT restaurant_id FROM restaurant_users WHERE user_id = auth.uid()
        UNION
        SELECT id FROM restaurants WHERE owner_id = auth.uid()
      )
    )
  );

CREATE POLICY "deliveries: insert for restaurant members"
  ON deliveries FOR INSERT
  WITH CHECK (
    order_id IN (
      SELECT o.id FROM orders o WHERE o.restaurant_id IN (
        SELECT restaurant_id FROM restaurant_users WHERE user_id = auth.uid()
        UNION
        SELECT id FROM restaurants WHERE owner_id = auth.uid()
      )
    )
  );

CREATE POLICY "deliveries: update for restaurant members"
  ON deliveries FOR UPDATE
  USING (
    order_id IN (
      SELECT o.id FROM orders o WHERE o.restaurant_id IN (
        SELECT restaurant_id FROM restaurant_users WHERE user_id = auth.uid()
        UNION
        SELECT id FROM restaurants WHERE owner_id = auth.uid()
      )
    )
  );

-- ================================================
-- Ratings table
-- ================================================
CREATE TABLE IF NOT EXISTS ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  stars INT CHECK (stars BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ratings: select for restaurant members"
  ON ratings FOR SELECT
  USING (
    restaurant_id IN (
      SELECT restaurant_id FROM restaurant_users WHERE user_id = auth.uid()
      UNION
      SELECT id FROM restaurants WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "ratings: insert authenticated"
  ON ratings FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ================================================
-- Daily Goals table
-- ================================================
CREATE TABLE IF NOT EXISTS daily_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  goal_amount INT NOT NULL,
  achieved_amount INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(restaurant_id, date)
);

ALTER TABLE daily_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_goals: select for restaurant members"
  ON daily_goals FOR SELECT
  USING (
    restaurant_id IN (
      SELECT restaurant_id FROM restaurant_users WHERE user_id = auth.uid()
      UNION
      SELECT id FROM restaurants WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "daily_goals: insert for restaurant members"
  ON daily_goals FOR INSERT
  WITH CHECK (
    restaurant_id IN (
      SELECT restaurant_id FROM restaurant_users WHERE user_id = auth.uid()
      UNION
      SELECT id FROM restaurants WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "daily_goals: update for restaurant members"
  ON daily_goals FOR UPDATE
  USING (
    restaurant_id IN (
      SELECT restaurant_id FROM restaurant_users WHERE user_id = auth.uid()
      UNION
      SELECT id FROM restaurants WHERE owner_id = auth.uid()
    )
  );

-- ================================================
-- Subscriptions table
-- ================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  abacate_subscription_id VARCHAR(255) UNIQUE,
  plan VARCHAR(20) CHECK (plan IN ('basic', 'pro')),
  status VARCHAR(20) DEFAULT 'active',
  next_billing_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscriptions: select for restaurant members"
  ON subscriptions FOR SELECT
  USING (
    restaurant_id IN (
      SELECT restaurant_id FROM restaurant_users WHERE user_id = auth.uid()
      UNION
      SELECT id FROM restaurants WHERE owner_id = auth.uid()
    )
  );

-- ================================================
-- WhatsApp Alerts Log table
-- ================================================
CREATE TABLE IF NOT EXISTS whatsapp_alerts_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  type VARCHAR(50),
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE whatsapp_alerts_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "whatsapp_alerts_log: select for restaurant members"
  ON whatsapp_alerts_log FOR SELECT
  USING (
    restaurant_id IN (
      SELECT restaurant_id FROM restaurant_users WHERE user_id = auth.uid()
      UNION
      SELECT id FROM restaurants WHERE owner_id = auth.uid()
    )
  );
