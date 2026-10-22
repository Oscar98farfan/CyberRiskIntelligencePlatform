-- ═══════════════════════════════════════════════════════════════════
-- PENDIENTE — Mejora de rendimiento (opcional, no afecta la seguridad)
-- ═══════════════════════════════════════════════════════════════════
-- Separa las políticas "for all" de miembros y activos en insert/update/
-- delete, para que el SELECT no evalúe dos políticas. Permite EXACTAMENTE
-- lo mismo que hoy. El conector de Claude no puede ejecutar DROP, así que
-- se corre a mano: Supabase → SQL Editor → pegar → Run.
-- Después de correrlo, actualizar schema.sql y borrar este archivo.
-- ═══════════════════════════════════════════════════════════════════
begin;

drop policy "miembros: gestionar dueno" on public.miembros;
create policy "miembros: agregar dueno" on public.miembros
  for insert to authenticated with check ((select privado.tiene_rol(empresa_id, array['dueno'])));
create policy "miembros: editar dueno" on public.miembros
  for update to authenticated using ((select privado.tiene_rol(empresa_id, array['dueno'])))
  with check ((select privado.tiene_rol(empresa_id, array['dueno'])));
create policy "miembros: quitar dueno" on public.miembros
  for delete to authenticated using ((select privado.tiene_rol(empresa_id, array['dueno'])));

drop policy "activos: gestionar dueno/admin" on public.activos;
create policy "activos: crear dueno/admin" on public.activos
  for insert to authenticated with check ((select privado.tiene_rol(empresa_id, array['dueno','admin'])));
create policy "activos: editar dueno/admin" on public.activos
  for update to authenticated using ((select privado.tiene_rol(empresa_id, array['dueno','admin'])))
  with check ((select privado.tiene_rol(empresa_id, array['dueno','admin'])));
create policy "activos: borrar dueno/admin" on public.activos
  for delete to authenticated using ((select privado.tiene_rol(empresa_id, array['dueno','admin'])));

commit;
