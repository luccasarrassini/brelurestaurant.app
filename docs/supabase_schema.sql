-- Brelu: base schema and RLS policies
-- This file is safe to run multiple times.

-- Restaurants: add visibility flag if missing
alter table public.restaurants
  add column if not exists is_public boolean not null default true,
  add column if not exists is_active boolean not null default true;

-- Membership table
create table if not exists public.restaurant_users (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'staff')),
  created_at timestamptz not null default now(),
  unique (restaurant_id, user_id)
);

-- Categories
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Products
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  description text,
  price_cents integer not null check (price_cents >= 0),
  stock_qty integer check (stock_qty >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_restaurant_users_user_id on public.restaurant_users(user_id);
create index if not exists idx_restaurant_users_restaurant_id on public.restaurant_users(restaurant_id);
create index if not exists idx_categories_restaurant_id on public.categories(restaurant_id);
create index if not exists idx_products_restaurant_id on public.products(restaurant_id);
create index if not exists idx_products_category_id on public.products(category_id);
create unique index if not exists idx_restaurants_slug on public.restaurants(slug);

-- Orders
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid references auth.users(id) on delete set null,
  status text not null check (status in ('created', 'paid', 'preparing', 'ready', 'delivering', 'delivered', 'cancelled')),
  total_cents integer not null check (total_cents >= 0),
  created_at timestamptz not null default now()
);

-- Order items
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name_snapshot text not null,
  price_cents_snapshot integer not null check (price_cents_snapshot >= 0),
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_orders_restaurant_id on public.orders(restaurant_id);
create index if not exists idx_orders_customer_id on public.orders(customer_id);
create index if not exists idx_order_items_order_id on public.order_items(order_id);

-- Enable RLS
alter table public.restaurants enable row level security;
alter table public.restaurant_users enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- Public read for published restaurants
drop policy if exists "restaurants_public_read" on public.restaurants;
create policy "restaurants_public_read"
  on public.restaurants
  for select
  using (is_public = true);

-- Authenticated read for members
drop policy if exists "restaurants_member_read" on public.restaurants;
create policy "restaurants_member_read"
  on public.restaurants
  for select
  using (
    exists (
      select 1
      from public.restaurant_users ru
      where ru.restaurant_id = restaurants.id
        and ru.user_id = auth.uid()
    )
  );

-- Updates only for owners/admins
drop policy if exists "restaurants_owner_update" on public.restaurants;
create policy "restaurants_owner_update"
  on public.restaurants
  for update
  using (
    exists (
      select 1
      from public.restaurant_users ru
      where ru.restaurant_id = restaurants.id
        and ru.user_id = auth.uid()
        and ru.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1
      from public.restaurant_users ru
      where ru.restaurant_id = restaurants.id
        and ru.user_id = auth.uid()
        and ru.role in ('owner', 'admin')
    )
  );

-- restaurant_users: members can see themselves, owners/admins can see all for their restaurant
drop policy if exists "restaurant_users_read" on public.restaurant_users;
create policy "restaurant_users_read"
  on public.restaurant_users
  for select
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.restaurant_users ru
      where ru.restaurant_id = restaurant_users.restaurant_id
        and ru.user_id = auth.uid()
        and ru.role in ('owner', 'admin')
    )
  );

-- Categories: public read only if restaurant is public and category is active
drop policy if exists "categories_public_read" on public.categories;
create policy "categories_public_read"
  on public.categories
  for select
  using (
    is_active = true
    and exists (
      select 1
      from public.restaurants r
      where r.id = categories.restaurant_id
        and r.is_public = true
    )
  );

-- Categories: members can read, owners/admins can manage
drop policy if exists "categories_member_read" on public.categories;
create policy "categories_member_read"
  on public.categories
  for select
  using (
    exists (
      select 1
      from public.restaurant_users ru
      where ru.restaurant_id = categories.restaurant_id
        and ru.user_id = auth.uid()
    )
  );

drop policy if exists "categories_owner_manage" on public.categories;
create policy "categories_owner_manage"
  on public.categories
  for all
  using (
    exists (
      select 1
      from public.restaurant_users ru
      where ru.restaurant_id = categories.restaurant_id
        and ru.user_id = auth.uid()
        and ru.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1
      from public.restaurant_users ru
      where ru.restaurant_id = categories.restaurant_id
        and ru.user_id = auth.uid()
        and ru.role in ('owner', 'admin')
    )
  );

-- Products: public read only if restaurant is public and product is active
drop policy if exists "products_public_read" on public.products;
create policy "products_public_read"
  on public.products
  for select
  using (
    is_active = true
    and exists (
      select 1
      from public.restaurants r
      where r.id = products.restaurant_id
        and r.is_public = true
    )
  );

-- Products: members can read, owners/admins can manage
drop policy if exists "products_member_read" on public.products;
create policy "products_member_read"
  on public.products
  for select
  using (
    exists (
      select 1
      from public.restaurant_users ru
      where ru.restaurant_id = products.restaurant_id
        and ru.user_id = auth.uid()
    )
  );

drop policy if exists "products_owner_manage" on public.products;
create policy "products_owner_manage"
  on public.products
  for all
  using (
    exists (
      select 1
      from public.restaurant_users ru
      where ru.restaurant_id = products.restaurant_id
        and ru.user_id = auth.uid()
        and ru.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1
      from public.restaurant_users ru
      where ru.restaurant_id = products.restaurant_id
        and ru.user_id = auth.uid()
        and ru.role in ('owner', 'admin')
    )
  );

-- Orders: customer can read own orders, restaurant owners/admins can read and manage
drop policy if exists "orders_customer_read" on public.orders;
create policy "orders_customer_read"
  on public.orders
  for select
  using (customer_id = auth.uid());

drop policy if exists "orders_restaurant_read" on public.orders;
create policy "orders_restaurant_read"
  on public.orders
  for select
  using (
    exists (
      select 1
      from public.restaurant_users ru
      where ru.restaurant_id = orders.restaurant_id
        and ru.user_id = auth.uid()
        and ru.role in ('owner', 'admin')
    )
  );

-- Inserts/updates/deletes are handled by Edge Functions with service_role.

-- Order items: access via parent order and restaurant membership
drop policy if exists "order_items_customer_read" on public.order_items;
create policy "order_items_customer_read"
  on public.order_items
  for select
  using (
    exists (
      select 1
      from public.orders o
      where o.id = order_items.order_id
        and o.customer_id = auth.uid()
    )
  );

drop policy if exists "order_items_restaurant_read" on public.order_items;
create policy "order_items_restaurant_read"
  on public.order_items
  for select
  using (
    exists (
      select 1
      from public.orders o
      join public.restaurant_users ru on ru.restaurant_id = o.restaurant_id
      where o.id = order_items.order_id
        and ru.user_id = auth.uid()
        and ru.role in ('owner', 'admin')
    )
  );

-- Inserts/updates/deletes are handled by Edge Functions with service_role.

-- Edge helper: transactional order creation (service_role only)
create or replace function public.create_order_secure(
  restaurant_id_input uuid,
  items_input jsonb,
  customer_id_input uuid
)
returns table (
  order_id uuid,
  total_cents integer,
  items jsonb
)
language plpgsql
as $$
declare
  item_count integer;
  order_total integer;
begin
  if restaurant_id_input is null or customer_id_input is null then
    raise exception 'missing required data';
  end if;

  if jsonb_typeof(items_input) <> 'array' then
    raise exception 'items must be an array';
  end if;

  select count(*)
  into item_count
  from jsonb_array_elements(items_input);

  if item_count = 0 then
    raise exception 'items cannot be empty';
  end if;

  -- Validate restaurant
  if not exists (
    select 1 from public.restaurants r
    where r.id = restaurant_id_input
      and r.is_public = true
      and r.is_active = true
  ) then
    raise exception 'restaurant not available';
  end if;

  -- Validate products and compute total
  with requested as (
    select
      (item->>'product_id')::uuid as product_id,
      greatest((item->>'quantity')::int, 0) as quantity
    from jsonb_array_elements(items_input) as item
  ),
  products as (
    select p.id, p.restaurant_id, p.is_active, p.price_cents, p.stock_qty, p.name
    from public.products p
    join requested r on r.product_id = p.id
  ),
  checks as (
    select
      count(*) = (select count(*) from requested) as all_found,
      bool_and(p.restaurant_id = restaurant_id_input) as all_match_restaurant,
      bool_and(p.is_active = true) as all_active,
      bool_and((p.stock_qty is null) or (p.stock_qty >= r.quantity)) as stock_ok,
      sum(p.price_cents * r.quantity) as total_sum
    from requested r
    join products p on p.id = r.product_id
  )
  select total_sum
  into order_total
  from checks
  where all_found and all_match_restaurant and all_active and stock_ok;

  if order_total is null then
    raise exception 'invalid items';
  end if;

  insert into public.orders (restaurant_id, customer_id, status, total_cents)
  values (restaurant_id_input, customer_id_input, 'created', order_total)
  returning id into order_id;

  with requested as (
    select
      (item->>'product_id')::uuid as product_id,
      greatest((item->>'quantity')::int, 0) as quantity
    from jsonb_array_elements(items_input) as item
  )
  insert into public.order_items (
    order_id,
    product_id,
    name_snapshot,
    price_cents_snapshot,
    quantity
  )
  select
    order_id,
    p.id,
    p.name,
    p.price_cents,
    r.quantity
  from requested r
  join public.products p on p.id = r.product_id;

  update public.products p
  set stock_qty = p.stock_qty - r.quantity
  from (
    select
      (item->>'product_id')::uuid as product_id,
      greatest((item->>'quantity')::int, 0) as quantity
    from jsonb_array_elements(items_input) as item
  ) r
  where p.id = r.product_id
    and p.stock_qty is not null;

  items := jsonb_agg(
    jsonb_build_object(
      'product_id', p.id,
      'name', p.name,
      'price_cents', p.price_cents,
      'quantity', r.quantity
    )
  )
  from (
    select
      (item->>'product_id')::uuid as product_id,
      greatest((item->>'quantity')::int, 0) as quantity
    from jsonb_array_elements(items_input) as item
  ) r
  join public.products p on p.id = r.product_id;

  total_cents := order_total;
  return next;
end;
$$;
