-- Brelu test seed data (run in a dedicated test project)
-- Assumes RLS enabled. Use service_role when inserting.

-- Restaurants
insert into public.restaurants (id, name, slug, phone, is_public, is_active)
values
  ('11111111-1111-1111-1111-111111111111', 'Pizzaria Teste Publica', 'pizzaria-teste-publica', '11999990001', true, true),
  ('22222222-2222-2222-2222-222222222222', 'Pizzaria Teste Privada', 'pizzaria-teste-privada', '11999990002', false, true)
on conflict (id) do nothing;

-- Users (create via Supabase Auth first; then add into restaurant_users)
-- Replace the UUIDs below with real auth.users ids.
-- client_user_id: customer
-- owner_user_id: owner/admin
-- other_user_id: another customer

insert into public.restaurant_users (restaurant_id, user_id, role)
values
  ('11111111-1111-1111-1111-111111111111', 'CLIENT_USER_ID', 'staff'),
  ('11111111-1111-1111-1111-111111111111', 'OWNER_USER_ID', 'owner')
on conflict (restaurant_id, user_id) do nothing;

-- Categories
insert into public.categories (id, restaurant_id, name, description, sort_order, is_active)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Pizzas', 'Pizzas da casa', 1, true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'Bebidas', 'Bebidas geladas', 2, true)
on conflict (id) do nothing;

-- Products (active/inactive, different stock)
insert into public.products (
  id, restaurant_id, category_id, name, description, price_cents, stock_qty, is_active
)
values
  ('p1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Pizza Margherita', 'Classica', 4500, 10, true),
  ('p2222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Pizza Calabresa', 'Picante', 4800, 2, true),
  ('p3333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Refrigerante Lata', '350ml', 600, 0, true),
  ('p4444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Suco Inativo', 'Sem estoque', 700, 10, false),
  ('p5555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222', null, 'Produto Outro Restaurante', 'Privado', 990, 5, true)
on conflict (id) do nothing;
