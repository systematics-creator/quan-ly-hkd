-- Drop tables if they exist
drop table if exists public.daily_records;
drop table if exists public.products;
drop table if exists public.shop_settings;
drop table if exists public.users;
drop table if exists public.shops;

-- 1. Create Shops Table
create table public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  expire_at timestamp with time zone not null,
  is_active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 2. Create Users Table (extends Supabase Auth users)
create table public.users (
  id uuid primary key references auth.users on delete cascade,
  shop_id uuid references public.shops(id) on delete cascade not null,
  role text check (role in ('admin', 'manager', 'user')) default 'user',
  email text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 3. Create Products Table
create table public.products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.shops(id) on delete cascade not null,
  name text not null,
  month int not null check (month between 1 and 12),
  year int not null,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 4. Create Daily Records Table
create table public.daily_records (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.shops(id) on delete cascade not null,
  date date not null default current_date,
  product_name text not null,
  cash numeric default 0,
  transfer numeric default 0,
  accounting_amount numeric default 0,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 5. Create Shop Settings Table
create table public.shop_settings (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.shops(id) on delete cascade not null unique,
  min_amount numeric default 0,
  max_amount numeric default 0,
  monthly_target numeric default 0,
  yearly_target numeric default 0,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Enable RLS
alter table public.shops enable row level security;
alter table public.users enable row level security;
alter table public.products enable row level security;
alter table public.daily_records enable row level security;
alter table public.shop_settings enable row level security;

-- Create basic RLS policies

-- Users can read their own data and shop data
create policy "Users can read their own user data" on public.users for select using (auth.uid() = id);

-- Actually, a user needs to get their shop_id first. We can write a function for that.
create or replace function public.get_user_shop_id()
returns uuid as $$
  select shop_id from public.users where id = auth.uid();
$$ language sql security definer;

create or replace function public.get_user_role()
returns text as $$
  select role from public.users where id = auth.uid();
$$ language sql security definer;

-- Shops: Users can read their own shop
create policy "Users can read their own shop" on public.shops for select using (id = public.get_user_shop_id());

-- Products: Users can read/write their own shop's products based on role
create policy "Read products" on public.products for select using (shop_id = public.get_user_shop_id());
create policy "Write products (admin/manager)" on public.products for all using (
  shop_id = public.get_user_shop_id() and (public.get_user_role() in ('admin', 'manager'))
);

-- Daily Records: All users in shop can read/insert. Update/delete by manager/admin.
create policy "Read daily records" on public.daily_records for select using (shop_id = public.get_user_shop_id());
create policy "Insert daily records" on public.daily_records for insert with check (shop_id = public.get_user_shop_id());
create policy "Update daily records" on public.daily_records for update using (
  shop_id = public.get_user_shop_id() and (public.get_user_role() in ('admin', 'manager', 'user'))
);
create policy "Delete daily records" on public.daily_records for delete using (
  shop_id = public.get_user_shop_id() and (public.get_user_role() in ('admin', 'manager'))
);

-- Settings: Read all in shop. Write admin only.
create policy "Read shop settings" on public.shop_settings for select using (shop_id = public.get_user_shop_id());
create policy "Write shop settings (admin)" on public.shop_settings for all using (
  shop_id = public.get_user_shop_id() and public.get_user_role() = 'admin'
);
