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
