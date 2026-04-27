-- Aggregate patch for missing schema pieces (idempotent)
-- Generated from current frontend/backend usage

-- Sync existing database to match docs/supabase_schema.sql (non-destructive)
-- Ensures price_cents is used (no float/decimal).

-- Categories (core)
alter table public.categories
  add column if not exists description text,
  add column if not exists sort_order integer not null default 0,
  add column if not exists is_active boolean not null default true;

-- Categories (menu manager extensions)
alter table public.categories
  add column if not exists model text,
  add column if not exists is_promo boolean not null default false,
  add column if not exists availability_mode text not null default 'always',
  add column if not exists availability_rules jsonb,
  add column if not exists channel_visibility jsonb;

-- Products (core)
alter table public.products
  add column if not exists description text,
  add column if not exists price_cents integer,
  add column if not exists stock_qty integer,
  add column if not exists is_active boolean not null default true;

-- Products (menu manager extensions)
alter table public.products
  add column if not exists sort_order integer not null default 0,
  add column if not exists is_out_of_stock boolean not null default false,
  add column if not exists is_sold_by_weight boolean not null default false,
  add column if not exists availability_mode text not null default 'always',
  add column if not exists availability_rules jsonb;

create index if not exists idx_products_sort_order on public.products(sort_order);

-- Backfill price_cents from legacy price (if present), then enforce not-null + check.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name = 'price'
  ) then
    execute '
      update public.products
      set price_cents = coalesce(price_cents, round(price * 100)::int, 0)
    ';
    begin
      execute 'alter table public.products alter column price drop not null';
    exception when others then
      -- ignore if already nullable or incompatible
      null;
    end;
  else
    execute '
      update public.products
      set price_cents = coalesce(price_cents, 0)
    ';
  end if;
end $$;

alter table public.products alter column price_cents set default 0;
alter table public.products alter column price_cents set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_price_cents_check'
  ) then
    execute 'alter table public.products add constraint products_price_cents_check check (price_cents >= 0)';
  end if;
end $$;

-- Refresh schema cache
select pg_notify('pgrst', 'reload schema');


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


-- Menu Manager schema additions (price remains price_cents)

-- Categories extensions
alter table public.categories
  add column if not exists model text,
  add column if not exists is_promo boolean not null default false,
  add column if not exists availability_mode text not null default 'always',
  add column if not exists availability_rules jsonb,
  add column if not exists channel_visibility jsonb;

-- Products extensions
alter table public.products
  add column if not exists sort_order integer not null default 0,
  add column if not exists is_out_of_stock boolean not null default false,
  add column if not exists is_sold_by_weight boolean not null default false,
  add column if not exists availability_mode text not null default 'always',
  add column if not exists availability_rules jsonb;

create index if not exists idx_products_sort_order on public.products(sort_order);

-- Tags
create table if not exists public.product_tags (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (restaurant_id, name)
);

create table if not exists public.product_tag_links (
  product_id uuid not null references public.products(id) on delete cascade,
  tag_id uuid not null references public.product_tags(id) on delete cascade,
  primary key (product_id, tag_id)
);

create index if not exists idx_product_tags_restaurant_id on public.product_tags(restaurant_id);
create index if not exists idx_product_tag_links_product_id on public.product_tag_links(product_id);

alter table public.product_tags enable row level security;
alter table public.product_tag_links enable row level security;

drop policy if exists "product_tags_member_read" on public.product_tags;
create policy "product_tags_member_read"
  on public.product_tags
  for select
  using (
    exists (
      select 1
      from public.restaurant_users ru
      where ru.restaurant_id = product_tags.restaurant_id
        and ru.user_id = auth.uid()
    )
  );

drop policy if exists "product_tags_owner_manage" on public.product_tags;
create policy "product_tags_owner_manage"
  on public.product_tags
  for all
  using (
    exists (
      select 1
      from public.restaurant_users ru
      where ru.restaurant_id = product_tags.restaurant_id
        and ru.user_id = auth.uid()
        and ru.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1
      from public.restaurant_users ru
      where ru.restaurant_id = product_tags.restaurant_id
        and ru.user_id = auth.uid()
        and ru.role in ('owner', 'admin')
    )
  );

drop policy if exists "product_tag_links_member_read" on public.product_tag_links;
create policy "product_tag_links_member_read"
  on public.product_tag_links
  for select
  using (
    exists (
      select 1
      from public.products p
      join public.restaurant_users ru on ru.restaurant_id = p.restaurant_id
      where p.id = product_tag_links.product_id
        and ru.user_id = auth.uid()
    )
  );

drop policy if exists "product_tag_links_owner_manage" on public.product_tag_links;
create policy "product_tag_links_owner_manage"
  on public.product_tag_links
  for all
  using (
    exists (
      select 1
      from public.products p
      join public.restaurant_users ru on ru.restaurant_id = p.restaurant_id
      where p.id = product_tag_links.product_id
        and ru.user_id = auth.uid()
        and ru.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1
      from public.products p
      join public.restaurant_users ru on ru.restaurant_id = p.restaurant_id
      where p.id = product_tag_links.product_id
        and ru.user_id = auth.uid()
        and ru.role in ('owner', 'admin')
    )
  );

-- Additionals
create table if not exists public.product_additional_groups (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  min_select integer not null default 0,
  max_select integer not null default 1,
  is_required boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.product_additionals (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.product_additional_groups(id) on delete cascade,
  name text not null,
  price_cents integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.product_additional_group_links (
  product_id uuid not null references public.products(id) on delete cascade,
  group_id uuid not null references public.product_additional_groups(id) on delete cascade,
  primary key (product_id, group_id)
);

create index if not exists idx_additional_groups_restaurant_id on public.product_additional_groups(restaurant_id);
create index if not exists idx_additionals_group_id on public.product_additionals(group_id);
create index if not exists idx_additional_group_links_product_id on public.product_additional_group_links(product_id);

alter table public.product_additional_groups enable row level security;
alter table public.product_additionals enable row level security;
alter table public.product_additional_group_links enable row level security;

drop policy if exists "additional_groups_member_read" on public.product_additional_groups;
create policy "additional_groups_member_read"
  on public.product_additional_groups
  for select
  using (
    exists (
      select 1
      from public.restaurant_users ru
      where ru.restaurant_id = product_additional_groups.restaurant_id
        and ru.user_id = auth.uid()
    )
  );

drop policy if exists "additional_groups_owner_manage" on public.product_additional_groups;
create policy "additional_groups_owner_manage"
  on public.product_additional_groups
  for all
  using (
    exists (
      select 1
      from public.restaurant_users ru
      where ru.restaurant_id = product_additional_groups.restaurant_id
        and ru.user_id = auth.uid()
        and ru.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1
      from public.restaurant_users ru
      where ru.restaurant_id = product_additional_groups.restaurant_id
        and ru.user_id = auth.uid()
        and ru.role in ('owner', 'admin')
    )
  );

drop policy if exists "additionals_member_read" on public.product_additionals;
create policy "additionals_member_read"
  on public.product_additionals
  for select
  using (
    exists (
      select 1
      from public.product_additional_groups g
      join public.restaurant_users ru on ru.restaurant_id = g.restaurant_id
      where g.id = product_additionals.group_id
        and ru.user_id = auth.uid()
    )
  );

drop policy if exists "additionals_owner_manage" on public.product_additionals;
create policy "additionals_owner_manage"
  on public.product_additionals
  for all
  using (
    exists (
      select 1
      from public.product_additional_groups g
      join public.restaurant_users ru on ru.restaurant_id = g.restaurant_id
      where g.id = product_additionals.group_id
        and ru.user_id = auth.uid()
        and ru.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1
      from public.product_additional_groups g
      join public.restaurant_users ru on ru.restaurant_id = g.restaurant_id
      where g.id = product_additionals.group_id
        and ru.user_id = auth.uid()
        and ru.role in ('owner', 'admin')
    )
  );

drop policy if exists "additional_group_links_member_read" on public.product_additional_group_links;
create policy "additional_group_links_member_read"
  on public.product_additional_group_links
  for select
  using (
    exists (
      select 1
      from public.products p
      join public.restaurant_users ru on ru.restaurant_id = p.restaurant_id
      where p.id = product_additional_group_links.product_id
        and ru.user_id = auth.uid()
    )
  );

drop policy if exists "additional_group_links_owner_manage" on public.product_additional_group_links;
create policy "additional_group_links_owner_manage"
  on public.product_additional_group_links
  for all
  using (
    exists (
      select 1
      from public.products p
      join public.restaurant_users ru on ru.restaurant_id = p.restaurant_id
      where p.id = product_additional_group_links.product_id
        and ru.user_id = auth.uid()
        and ru.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1
      from public.products p
      join public.restaurant_users ru on ru.restaurant_id = p.restaurant_id
      where p.id = product_additional_group_links.product_id
        and ru.user_id = auth.uid()
        and ru.role in ('owner', 'admin')
    )
  );

-- Refresh schema cache
select pg_notify('pgrst', 'reload schema');

