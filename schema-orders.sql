-- =============================================
-- UNSPOTTED — Tabla de pedidos (pagos con Stripe)
-- Correr una sola vez en el SQL Editor de Supabase,
-- DESPUÉS de haber corrido schema.sql
-- =============================================

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id),
  product_name text not null,
  size text not null,
  price numeric not null,
  customer_name text,
  customer_phone text,
  shipping_address text,
  status text not null default 'pending', -- pending | paid | cancelled | shipped
  stripe_session_id text,
  created_at timestamptz not null default now()
);

alter table orders enable row level security;

-- Nadie externo puede leer ni escribir directo. Las Edge Functions
-- escriben con la service_role key (ignora RLS); el panel de admin
-- lee/actualiza como usuario autenticado.

create policy "authenticated read orders"
  on orders for select
  using (auth.role() = 'authenticated');

create policy "authenticated update orders"
  on orders for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
