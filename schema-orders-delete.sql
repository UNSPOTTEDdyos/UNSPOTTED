-- =============================================
-- UNSPOTTED — Permiso faltante: borrar pedidos
-- Correr una sola vez en el SQL Editor de Supabase
-- =============================================

create policy "authenticated delete orders"
  on orders for delete
  using (auth.role() = 'authenticated');
