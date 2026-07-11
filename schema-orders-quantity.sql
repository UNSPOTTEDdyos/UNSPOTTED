-- =============================================
-- UNSPOTTED — Cantidad de piezas por pedido
-- Correr una sola vez en el SQL Editor de Supabase
-- =============================================

alter table orders add column if not exists quantity integer not null default 1;
