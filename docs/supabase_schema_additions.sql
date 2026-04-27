-- Additions for missing tables and policies

-- Ensure category description exists (for older schemas)
alter table public.categories
  add column if not exists description text;

-- Product images
create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  url text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_product_images_restaurant_id on public.product_images(restaurant_id);
create index if not exists idx_product_images_product_id on public.product_images(product_id);

alter table public.product_images enable row level security;

-- Public read for images if restaurant is public and product is active
drop policy if exists "product_images_public_read" on public.product_images;
create policy "product_images_public_read"
  on public.product_images
  for select
  using (
    exists (
      select 1
      from public.products p
      join public.restaurants r on r.id = p.restaurant_id
      where p.id = product_images.product_id
        and p.is_active = true
        and r.is_public = true
    )
  );

-- Members can read, owners/admins can manage
drop policy if exists "product_images_member_read" on public.product_images;
create policy "product_images_member_read"
  on public.product_images
  for select
  using (
    exists (
      select 1
      from public.restaurant_users ru
      where ru.restaurant_id = product_images.restaurant_id
        and ru.user_id = auth.uid()
    )
  );

drop policy if exists "product_images_owner_manage" on public.product_images;
create policy "product_images_owner_manage"
  on public.product_images
  for all
  using (
    exists (
      select 1
      from public.restaurant_users ru
      where ru.restaurant_id = product_images.restaurant_id
        and ru.user_id = auth.uid()
        and ru.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1
      from public.restaurant_users ru
      where ru.restaurant_id = product_images.restaurant_id
        and ru.user_id = auth.uid()
        and ru.role in ('owner', 'admin')
    )
  );

-- Delivery drivers
create table if not exists public.delivery_drivers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  phone text,
  vehicle_type text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_delivery_drivers_restaurant_id on public.delivery_drivers(restaurant_id);

alter table public.delivery_drivers enable row level security;

drop policy if exists "delivery_drivers_member_read" on public.delivery_drivers;
create policy "delivery_drivers_member_read"
  on public.delivery_drivers
  for select
  using (
    exists (
      select 1
      from public.restaurant_users ru
      where ru.restaurant_id = delivery_drivers.restaurant_id
        and ru.user_id = auth.uid()
    )
  );

drop policy if exists "delivery_drivers_owner_manage" on public.delivery_drivers;
create policy "delivery_drivers_owner_manage"
  on public.delivery_drivers
  for all
  using (
    exists (
      select 1
      from public.restaurant_users ru
      where ru.restaurant_id = delivery_drivers.restaurant_id
        and ru.user_id = auth.uid()
        and ru.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1
      from public.restaurant_users ru
      where ru.restaurant_id = delivery_drivers.restaurant_id
        and ru.user_id = auth.uid()
        and ru.role in ('owner', 'admin')
    )
  );

-- Allow owners/admins to update order status
drop policy if exists "orders_restaurant_update" on public.orders;
create policy "orders_restaurant_update"
  on public.orders
  for update
  using (
    exists (
      select 1
      from public.restaurant_users ru
      where ru.restaurant_id = orders.restaurant_id
        and ru.user_id = auth.uid()
        and ru.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1
      from public.restaurant_users ru
      where ru.restaurant_id = orders.restaurant_id
        and ru.user_id = auth.uid()
        and ru.role in ('owner', 'admin')
    )
  );
