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
  order_notes_input text default null,
  delivery_type_input text default 'local'
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
    order_notes,
    delivery_type
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
    order_notes_input,
    delivery_type_input
  )
  returning id into order_id;

  with requested as (
    select
      (item->>'product_id')::uuid as product_id,
      greatest((item->>'quantity')::int, 0) as quantity,
      item->>'notes' as item_notes
    from jsonb_array_elements(items_input) as item
  )
  insert into public.order_items (
    order_id,
    product_id,
    name_snapshot,
    price_cents_snapshot,
    quantity,
    notes
  )
  select
    order_id,
    p.id,
    p.name,
    p.price_cents,
    r.quantity,
    r.item_notes
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
