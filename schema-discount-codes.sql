-- =============================================
-- UNSPOTTED — Códigos de descuento
-- Correr una sola vez en el SQL Editor de Supabase
-- =============================================

create table if not exists discount_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  type text not null default 'percent', -- 'percent' | 'fixed'
  value numeric not null,               -- percent: 0-100 | fixed: MXN a descontar
  active boolean not null default true,
  max_uses integer,                     -- null = ilimitado
  used_count integer not null default 0,
  expires_at timestamptz,               -- null = sin expiración
  created_at timestamptz not null default now()
);

alter table discount_codes enable row level security;

-- Nadie externo puede leer los códigos directamente (evita que cualquiera
-- liste/enumere los códigos válidos desde el navegador). La validación real
-- ocurre server-side en la Edge Function create-checkout-session, que usa
-- la service_role key y sí puede leer la tabla sin importar RLS.
create policy "authenticated all discount_codes"
  on discount_codes for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- =============================================
-- Columnas nuevas en orders para registrar el descuento aplicado
-- (order.price ya queda como el precio final YA con descuento)
-- =============================================

alter table orders add column if not exists discount_code text;
alter table orders add column if not exists discount_amount numeric not null default 0;
