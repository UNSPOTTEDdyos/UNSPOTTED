-- =============================================
-- UNSPOTTED — Número de guía manual en pedidos
-- Correr una sola vez en el SQL Editor de Supabase,
-- DESPUÉS de haber corrido schema.sql y schema-orders.sql
-- =============================================

alter table orders add column if not exists tracking_number text;
