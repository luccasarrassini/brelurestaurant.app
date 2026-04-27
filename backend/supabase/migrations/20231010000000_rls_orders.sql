-- Enable RLS on orders table
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- 1. SELECT: auth.uid() = restaurant_id (dono vê seus pedidos)
CREATE POLICY orders_select_policy ON orders
FOR SELECT
TO authenticated
USING (auth.uid() = restaurant_id);

-- 2. INSERT: apenas via Edge Function autenticada (nunca direto do client)
-- Aqui garantimos que client insert fale. O bypass da Edge Function eh garantido via service_role key 
CREATE POLICY orders_insert_policy ON orders
FOR INSERT
TO authenticated
WITH CHECK (false); -- Prevent direct client inserts

-- 3. UPDATE: auth.uid() = restaurant_id (só o dono muda status)
CREATE POLICY orders_update_policy ON orders
FOR UPDATE
TO authenticated
USING (auth.uid() = restaurant_id)
WITH CHECK (auth.uid() = restaurant_id);

-- 4. DELETE: desabilitado (soft delete se necessário)
CREATE POLICY orders_delete_policy ON orders
FOR DELETE
TO authenticated
USING (false);
