-- Profiles table for customer display names
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text,
  created_at timestamptz not null default now()
);

create index if not exists idx_profiles_user_id on public.profiles(user_id);

alter table public.profiles enable row level security;

-- Users can read and manage their own profile
drop policy if exists "profiles_self_read" on public.profiles;
create policy "profiles_self_read"
  on public.profiles
  for select
  using (user_id = auth.uid());

drop policy if exists "profiles_self_write" on public.profiles;
create policy "profiles_self_write"
  on public.profiles
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Restaurant owners/admins can read profiles of customers who ordered from their restaurant
drop policy if exists "profiles_restaurant_read" on public.profiles;
create policy "profiles_restaurant_read"
  on public.profiles
  for select
  using (
    exists (
      select 1
      from public.orders o
      join public.restaurant_users ru on ru.restaurant_id = o.restaurant_id
      where o.customer_id = profiles.user_id
        and ru.user_id = auth.uid()
        and ru.role in ('owner', 'admin')
    )
  );
