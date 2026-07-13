-- =============================================
-- UNSPOTTED — Agregar tercera foto de producto (puesta en persona)
-- Correr una sola vez en el SQL Editor de Supabase
-- =============================================

alter table products add column if not exists image_extra text;
