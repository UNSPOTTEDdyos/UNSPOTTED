-- =============================================
-- UNSPOTTED — Esquema de Supabase
-- Correr una sola vez en el SQL Editor de Supabase
-- (Project → SQL Editor → New query → pegar todo → Run)
-- =============================================

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric not null,
  image_front text not null,
  image_back text,
  sizes jsonb not null default '{"S":0,"M":0,"L":0,"XL":0}',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table products enable row level security;

-- Cualquiera puede leer productos (la tienda pública los necesita sin login)
create policy "public read products"
  on products for select
  using (true);

-- Solo un usuario logueado (el admin) puede crear/editar/borrar
create policy "authenticated write products"
  on products for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- =============================================
-- Storage: bucket para fotos de producto
-- =============================================

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

create policy "public read product images"
  on storage.objects for select
  using (bucket_id = 'product-images');

create policy "authenticated upload product images"
  on storage.objects for insert
  with check (bucket_id = 'product-images' and auth.role() = 'authenticated');

create policy "authenticated update product images"
  on storage.objects for update
  using (bucket_id = 'product-images' and auth.role() = 'authenticated');

create policy "authenticated delete product images"
  on storage.objects for delete
  using (bucket_id = 'product-images' and auth.role() = 'authenticated');

-- =============================================
-- Producto inicial (SPOTS) — usa las fotos que ya
-- están en assets/, no hace falta resubirlas
-- =============================================

insert into products (name, price, image_front, image_back, sizes, active, sort_order)
values (
  'SPOTS',
  600,
  'assets/DROP_UNO.JPG',
  'assets/DROP_UNO1.JPG',
  '{"S":5,"M":5,"L":5,"XL":5}',
  true,
  1
);
