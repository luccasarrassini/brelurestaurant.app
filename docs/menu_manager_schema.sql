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
