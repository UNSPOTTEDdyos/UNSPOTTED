-- =============================================
-- UNSPOTTED — Carrito de compra (multi-producto)
-- Correr una sola vez en el SQL Editor de Supabase
-- =============================================

-- El carrito se valida y se guarda server-side (nunca se confía en lo que
-- manda el cliente) justo antes de crear la sesión de Stripe. El webhook lo
-- vuelve a leer cuando el pago se confirma para crear los pedidos reales.
-- Sin políticas de lectura/escritura pública: solo las Edge Functions
-- (service_role) lo tocan, igual que discount_codes.
create table if not exists pending_carts (
  id uuid primary key default gen_random_uuid(),
  items jsonb not null,
  created_at timestamptz not null default now()
);

alter table pending_carts enable row level security;
