-- Orders function aligned with an older schema.
-- Keep only if your database diverges from docs/supabase_schema.sql.

-- Optional stock control (adds column if missing)
alter table public.products
  add column if not exists stock_qty integer check (stock_qty >= 0);

create or replace function public.create_order_secure(
  restaurant_id_input uuid,
  items_input jsonb,
  customer_id_input uuid,
  address_id_input uuid default null,
  payment_method_input text default null
)
returns table (
  order_id uuid,
  subtotal numeric,
  delivery_fee numeric,
  total numeric,
  items jsonb
)
language plpgsql
as $$
declare
  item_count integer;
  subtotal_amount numeric;
  delivery_amount numeric := 0;
begin
  if restaurant_id_input is null or customer_id_input is null then
    raise exception 'missing required data';
  end if;

  if jsonb_typeof(items_input) <> 'array' then
    raise exception 'items must be an array';
  end if;

  select count(*) into item_count from jsonb_array_elements(items_input);
  if item_count = 0 then
    raise exception 'items cannot be empty';
  end if;

  -- Restaurant must be active and public
  if not exists (
    select 1 from public.restaurants r
    where r.id = restaurant_id_input
      and r.is_public = true
      and r.is_active = true
  ) then
    raise exception 'restaurant not available';
  end if;

  -- Optional delivery fee from address -> neighborhood
  if address_id_input is not null then
    select n.delivery_fee
    into delivery_amount
    from public.addresses a
    join public.neighborhoods n on n.id = a.neighborhood_id
    where a.id = address_id_input;

    if delivery_amount is null then
      delivery_amount := 0;
    end if;
  end if;

  -- Validate products and compute subtotal
  with requested as (
    select
      (item->>'product_id')::uuid as product_id,
      greatest((item->>'quantity')::int, 0) as quantity,
      nullif(item->>'notes', '') as notes
    from jsonb_array_elements(items_input) as item
  ),
  products as (
    select p.id, p.restaurant_id, p.active, p.price, p.stock_qty, p.name
    from public.products p
    join requested r on r.product_id = p.id
  ),
  checks as (
    select
      count(*) = (select count(*) from requested) as all_found,
      bool_and(p.restaurant_id = restaurant_id_input) as all_match_restaurant,
      bool_and(p.active = true) as all_active,
      bool_and((p.stock_qty is null) or (p.stock_qty >= r.quantity)) as stock_ok,
      sum(p.price * r.quantity) as subtotal_sum
    from requested r
    join products p on p.id = r.product_id
  )
  select subtotal_sum
  into subtotal_amount
  from checks
  where all_found and all_match_restaurant and all_active and stock_ok;

  if subtotal_amount is null then
    raise exception 'invalid items';
  end if;

  insert into public.orders (
    restaurant_id,
    customer_id,
    address_id,
    status,
    subtotal,
    delivery_fee,
    total,
    payment_method
  )
  values (
    restaurant_id_input,
    customer_id_input,
    address_id_input,
    'novo',
    subtotal_amount,
    delivery_amount,
    subtotal_amount + delivery_amount,
    payment_method_input
  )
  returning id into order_id;

  with requested as (
    select
      (item->>'product_id')::uuid as product_id,
      greatest((item->>'quantity')::int, 0) as quantity,
      nullif(item->>'notes', '') as notes
    from jsonb_array_elements(items_input) as item
  )
  insert into public.order_items (
    order_id,
    product_id,
    quantity,
    price,
    notes
  )
  select
    order_id,
    p.id,
    r.quantity,
    p.price,
    r.notes
  from requested r
  join public.products p on p.id = r.product_id;

  -- Decrement stock when used
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
      'price', p.price,
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

  subtotal := subtotal_amount;
  delivery_fee := delivery_amount;
  total := subtotal_amount + delivery_amount;
  return next;
end;
$$;
