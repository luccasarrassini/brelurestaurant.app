-- ================================================
-- Fix RLS on orders table
-- The previous policies used auth.uid() = restaurant_id which is wrong
-- restaurant_id is a UUID referencing the restaurant, not the user
-- ================================================

-- Drop old incorrect policies
DROP POLICY IF EXISTS orders_select_policy ON orders;
DROP POLICY IF EXISTS orders_insert_policy ON orders;
DROP POLICY IF EXISTS orders_update_policy ON orders;
DROP POLICY IF EXISTS orders_delete_policy ON orders;

-- Correct multi-tenant SELECT policy
-- Users can see orders for restaurants they belong to (via restaurant_users or as owner)
CREATE POLICY "orders: select for restaurant members"
  ON orders FOR SELECT
  TO authenticated
  USING (
    restaurant_id IN (
      SELECT ru.restaurant_id FROM restaurant_users ru WHERE ru.user_id = auth.uid()
      UNION
      SELECT r.id FROM restaurants r WHERE r.owner_id = auth.uid()
    )
  );

-- Public SELECT via tracking_token (for OrderTracking page)
CREATE POLICY "orders: select by tracking_token"
  ON orders FOR SELECT
  TO anon, authenticated
  USING (tracking_token IS NOT NULL);

-- INSERT: blocked for direct client inserts (use Edge Function with service_role_key)
CREATE POLICY "orders: insert blocked"
  ON orders FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- UPDATE: only restaurant members can update (for status changes)
CREATE POLICY "orders: update for restaurant members"
  ON orders FOR UPDATE
  TO authenticated
  USING (
    restaurant_id IN (
      SELECT ru.restaurant_id FROM restaurant_users ru WHERE ru.user_id = auth.uid()
      UNION
      SELECT r.id FROM restaurants r WHERE r.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    restaurant_id IN (
      SELECT ru.restaurant_id FROM restaurant_users ru WHERE ru.user_id = auth.uid()
      UNION
      SELECT r.id FROM restaurants r WHERE r.owner_id = auth.uid()
    )
  );

-- DELETE: disabled (soft delete via status)
CREATE POLICY "orders: delete blocked"
  ON orders FOR DELETE
  TO authenticated
  USING (false);
