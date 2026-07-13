-- =============================================
-- UNSPOTTED — Agregar corte (Oversized / Cropped) a los pedidos
-- Correr una sola vez en el SQL Editor de Supabase
-- =============================================

alter table orders add column if not exists fit text;
