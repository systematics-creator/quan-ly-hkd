-- Drop existing tables to recreate with new requirements
drop table if exists public.daily_records cascade;
drop table if exists public.products cascade;
drop table if exists public.shop_settings cascade;
drop table if exists public.users cascade;
drop table if exists public.shops cascade;

-- 1. Create Shops Table
create table public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  expire_at timestamp with time zone not null,
  is_active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 2. Create Users Table (extends Supabase Auth users)
-- Added 'super_admin' role, made shop_id nullable for super admins
create table public.users (
  id uuid primary key references auth.users on delete cascade,
  shop_id uuid references public.shops(id) on delete cascade,
  role text check (role in ('super_admin', 'admin', 'manager', 'user')) default 'user',
  email text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 3. Create Daily Records Table
create table public.daily_records (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.shops(id) on delete cascade not null,
  date date not null default current_date,
  product_name text not null,
  cash numeric default 0,
  transfer numeric default 0,
  accounting_amount numeric default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  unique (shop_id, date, product_name) -- Ensure no duplicate product per day
);

-- 4. Create Shop Settings Table
create table public.shop_settings (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.shops(id) on delete cascade not null unique,
  min_kt numeric default 0,
  max_kt numeric default 0,
  yearly_kt_limit numeric default 0,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Enable RLS
alter table public.shops enable row level security;
alter table public.users enable row level security;
alter table public.daily_records enable row level security;
alter table public.shop_settings enable row level security;

-- Function to get user role
create or replace function public.get_user_role()
returns text as $$
  select role from public.users where id = auth.uid();
$$ language sql security definer;

-- Function to get user shop_id
create or replace function public.get_user_shop_id()
returns uuid as $$
  select shop_id from public.users where id = auth.uid();
$$ language sql security definer;

-- ================= RLS POLICIES =================

-- 1. SHOPS
-- Super admin can read/write all shops
create policy "Super admin can do all on shops" on public.shops for all using (public.get_user_role() = 'super_admin');
-- Users can read their own shop
create policy "Users read own shop" on public.shops for select using (id = public.get_user_shop_id());

-- 2. USERS
-- Super admin can read/write all users
create policy "Super admin can do all on users" on public.users for all using (public.get_user_role() = 'super_admin');
-- Shop admin can read/write users in their shop
create policy "Shop admin can do all on own shop users" on public.users for all using (
  shop_id = public.get_user_shop_id() and public.get_user_role() = 'admin'
);
-- Users can read their own data
create policy "Users read own data" on public.users for select using (auth.uid() = id);

-- 3. DAILY RECORDS
-- Super admin can see all
create policy "Super admin read all records" on public.daily_records for all using (public.get_user_role() = 'super_admin');
-- All roles in same shop can read
create policy "Read daily records" on public.daily_records for select using (shop_id = public.get_user_shop_id());
-- Admin, Manager, User can insert
create policy "Insert daily records" on public.daily_records for insert with check (shop_id = public.get_user_shop_id());
-- Admin and Manager can update/delete
create policy "Update daily records" on public.daily_records for update using (
  shop_id = public.get_user_shop_id() and public.get_user_role() in ('admin', 'manager')
);
create policy "Delete daily records" on public.daily_records for delete using (
  shop_id = public.get_user_shop_id() and public.get_user_role() in ('admin', 'manager')
);

-- 4. SHOP SETTINGS
-- Super admin can see/edit all
create policy "Super admin read all shop settings" on public.shop_settings for all using (public.get_user_role() = 'super_admin');
-- All users read their shop settings
create policy "Read own shop settings" on public.shop_settings for select using (shop_id = public.get_user_shop_id());
-- Shop Admin can write
create policy "Shop admin write settings" on public.shop_settings for all using (
  shop_id = public.get_user_shop_id() and public.get_user_role() = 'admin'
);
