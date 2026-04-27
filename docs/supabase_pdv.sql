-- Brelu: PDV + Kanban additions
-- Safe to run multiple times.

-- Customers
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  phone text not null,
  phone_digits text not null,
  notes text,
  created_at timestamptz not null default now(),
  unique (restaurant_id, phone_digits)
);

create index if not exists idx_customers_restaurant_id on public.customers(restaurant_id);
create index if not exists idx_customers_phone_digits on public.customers(phone_digits);

alter table public.customers enable row level security;

drop policy if exists "customers_member_read" on public.customers;
create policy "customers_member_read"
  on public.customers
  for select
  using (
    exists (
      select 1
      from public.restaurant_users ru
      where ru.restaurant_id = customers.restaurant_id
        and ru.user_id = auth.uid()
    )
  );

drop policy if exists "customers_member_manage" on public.customers;
create policy "customers_member_manage"
  on public.customers
  for all
  using (
    exists (
      select 1
      from public.restaurant_users ru
      where ru.restaurant_id = customers.restaurant_id
        and ru.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.restaurant_users ru
      where ru.restaurant_id = customers.restaurant_id
        and ru.user_id = auth.uid()
    )
  );

-- Customer addresses
create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  postal_code text not null,
  street text not null,
  number text not null,
  neighborhood text not null,
  city text not null,
  complement text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_customer_addresses_customer_id on public.customer_addresses(customer_id);
create index if not exists idx_customer_addresses_restaurant_id on public.customer_addresses(restaurant_id);

alter table public.customer_addresses enable row level security;

drop policy if exists "customer_addresses_member_read" on public.customer_addresses;
create policy "customer_addresses_member_read"
  on public.customer_addresses
  for select
  using (
    exists (
      select 1
      from public.restaurant_users ru
      where ru.restaurant_id = customer_addresses.restaurant_id
        and ru.user_id = auth.uid()
    )
  );

drop policy if exists "customer_addresses_member_manage" on public.customer_addresses;
create policy "customer_addresses_member_manage"
  on public.customer_addresses
  for all
  using (
    exists (
      select 1
      from public.restaurant_users ru
      where ru.restaurant_id = customer_addresses.restaurant_id
        and ru.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.restaurant_users ru
      where ru.restaurant_id = customer_addresses.restaurant_id
        and ru.user_id = auth.uid()
    )
  );

-- Orders additions
create sequence if not exists public.order_number_seq;
create sequence if not exists public.customer_badge_seq;

alter table public.orders
  add column if not exists order_number bigint,
  add column if not exists customer_name text,
  add column if not exists customer_phone text,
  add column if not exists customer_badge bigint,
  add column if not exists customer_ref_id uuid references public.customers(id) on delete set null,
  add column if not exists source text,
  add column if not exists delivery_fee_cents integer not null default 0 check (delivery_fee_cents >= 0),
  add column if not exists prepare_by timestamptz,
  add column if not exists nf_requested boolean not null default false,
  add column if not exists cancel_reason text,
  add column if not exists order_notes text;

alter table public.orders
  alter column order_number set default nextval('public.order_number_seq'),
  alter column customer_badge set default nextval('public.customer_badge_seq');

update public.orders
  set order_number = nextval('public.order_number_seq')
  where order_number is null;

update public.orders
  set customer_badge = nextval('public.customer_badge_seq')
  where customer_badge is null;

update public.orders
  set prepare_by = created_at + interval '30 minutes'
  where prepare_by is null;

create unique index if not exists idx_orders_order_number on public.orders(order_number);
create index if not exists idx_orders_customer_ref_id on public.orders(customer_ref_id);

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'orders_status_check') then
    alter table public.orders drop constraint orders_status_check;
  end if;
end$$;

alter table public.orders
  add constraint orders_status_check
  check (
    status in (
      'created',
      'paid',
      'pending',
      'preparing',
      'ready',
      'delivering',
      'out_for_delivery',
      'delivered',
      'cancelled'
    )
  );

-- Order delivery
create table if not exists public.order_delivery (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  delivery_type text not null check (delivery_type in ('delivery', 'pickup', 'dine_in')),
  customer_address_id uuid references public.customer_addresses(id) on delete set null,
  postal_code text,
  street text,
  number text,
  neighborhood text,
  city text,
  complement text,
  delivery_fee_cents integer not null default 0 check (delivery_fee_cents >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_order_delivery_order_id on public.order_delivery(order_id);

alter table public.order_delivery enable row level security;

drop policy if exists "order_delivery_member_read" on public.order_delivery;
create policy "order_delivery_member_read"
  on public.order_delivery
  for select
  using (
    exists (
      select 1
      from public.orders o
      join public.restaurant_users ru on ru.restaurant_id = o.restaurant_id
      where o.id = order_delivery.order_id
        and ru.user_id = auth.uid()
    )
  );

drop policy if exists "order_delivery_member_manage" on public.order_delivery;
create policy "order_delivery_member_manage"
  on public.order_delivery
  for all
  using (
    exists (
      select 1
      from public.orders o
      join public.restaurant_users ru on ru.restaurant_id = o.restaurant_id
      where o.id = order_delivery.order_id
        and ru.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.orders o
      join public.restaurant_users ru on ru.restaurant_id = o.restaurant_id
      where o.id = order_delivery.order_id
        and ru.user_id = auth.uid()
    )
  );

-- Order payments
create table if not exists public.order_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  method text not null check (method in ('pix', 'cash', 'card', 'other', 'split')),
  amount_cents integer not null check (amount_cents >= 0),
  change_cents integer not null default 0 check (change_cents >= 0),
  status text not null default 'paid' check (status in ('pending', 'paid', 'failed', 'refunded')),
  created_at timestamptz not null default now()
);

create index if not exists idx_order_payments_order_id on public.order_payments(order_id);

alter table public.order_payments enable row level security;

drop policy if exists "order_payments_member_read" on public.order_payments;
create policy "order_payments_member_read"
  on public.order_payments
  for select
  using (
    exists (
      select 1
      from public.orders o
      join public.restaurant_users ru on ru.restaurant_id = o.restaurant_id
      where o.id = order_payments.order_id
        and ru.user_id = auth.uid()
    )
  );

drop policy if exists "order_payments_member_manage" on public.order_payments;
create policy "order_payments_member_manage"
  on public.order_payments
  for all
  using (
    exists (
      select 1
      from public.orders o
      join public.restaurant_users ru on ru.restaurant_id = o.restaurant_id
      where o.id = order_payments.order_id
        and ru.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.orders o
      join public.restaurant_users ru on ru.restaurant_id = o.restaurant_id
      where o.id = order_payments.order_id
        and ru.user_id = auth.uid()
    )
  );

-- Order status logs
create table if not exists public.order_status_logs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  previous_status text,
  new_status text not null,
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_status_logs_order_id on public.order_status_logs(order_id);

alter table public.order_status_logs enable row level security;

drop policy if exists "order_status_logs_member_read" on public.order_status_logs;
create policy "order_status_logs_member_read"
  on public.order_status_logs
  for select
  using (
    exists (
      select 1
      from public.orders o
      join public.restaurant_users ru on ru.restaurant_id = o.restaurant_id
      where o.id = order_status_logs.order_id
        and ru.user_id = auth.uid()
    )
  );

drop policy if exists "order_status_logs_member_manage" on public.order_status_logs;
create policy "order_status_logs_member_manage"
  on public.order_status_logs
  for all
  using (
    exists (
      select 1
      from public.orders o
      join public.restaurant_users ru on ru.restaurant_id = o.restaurant_id
      where o.id = order_status_logs.order_id
        and ru.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.orders o
      join public.restaurant_users ru on ru.restaurant_id = o.restaurant_id
      where o.id = order_status_logs.order_id
        and ru.user_id = auth.uid()
    )
  );

-- Orders policies: include staff for read/update
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
        and ru.role in ('owner', 'admin', 'staff')
    )
  );

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
        and ru.role in ('owner', 'admin', 'staff')
    )
  )
  with check (
    exists (
      select 1
      from public.restaurant_users ru
      where ru.restaurant_id = orders.restaurant_id
        and ru.user_id = auth.uid()
        and ru.role in ('owner', 'admin', 'staff')
    )
  );

-- Order items read: include staff
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
        and ru.role in ('owner', 'admin', 'staff')
    )
  );

-- Edge helper: transactional order creation (service_role only)
create or replace function public.create_order_secure(
  restaurant_id_input uuid,
  items_input jsonb,
  customer_id_input uuid default null,
  delivery_fee_cents_input integer default 0,
  status_input text default 'pending',
  customer_name_input text default null,
  customer_phone_input text default null,
  customer_ref_id_input uuid default null,
  source_input text default null,
  prepare_by_input timestamptz default null,
  nf_requested_input boolean default false,
  customer_badge_input bigint default null,
  order_notes_input text default null
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
  delivery_fee integer;
begin
  if restaurant_id_input is null then
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

  if delivery_fee_cents_input is null or delivery_fee_cents_input < 0 then
    raise exception 'invalid delivery fee';
  end if;

  delivery_fee := delivery_fee_cents_input;

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

  order_total := order_total + delivery_fee;

  insert into public.orders (
    restaurant_id,
    customer_id,
    status,
    total_cents,
    delivery_fee_cents,
    customer_name,
    customer_phone,
    customer_ref_id,
    source,
    prepare_by,
    nf_requested,
    customer_badge,
    order_notes
  )
  values (
    restaurant_id_input,
    customer_id_input,
    coalesce(status_input, 'pending'),
    order_total,
    delivery_fee,
    customer_name_input,
    customer_phone_input,
    customer_ref_id_input,
    source_input,
    coalesce(prepare_by_input, now() + interval '30 minutes'),
    coalesce(nf_requested_input, false),
    customer_badge_input,
    order_notes_input
  )
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

-- Status log trigger
create or replace function public.log_order_status_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_status_logs (order_id, previous_status, new_status, created_by)
    values (new.id, null, new.status, auth.uid());
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.order_status_logs (order_id, previous_status, new_status, reason, created_by)
    values (new.id, old.status, new.status, new.cancel_reason, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_order_status_change on public.orders;
create trigger trg_order_status_change
after insert or update of status on public.orders
for each row
execute function public.log_order_status_change();

-- Realtime
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'order_items'
  ) then
    alter publication supabase_realtime add table public.order_items;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'order_delivery'
  ) then
    alter publication supabase_realtime add table public.order_delivery;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'order_payments'
  ) then
    alter publication supabase_realtime add table public.order_payments;
  end if;
end$$;
