-- ════════════════════════════════════════════════════════════════════════════
-- ACEG — Buckets de Storage
--   landing       público: fotos de la landing, comunicados y fondos de QR
--   recursos-lms  privado: materiales de sesión   (path: <sesion_id>/<archivo>)
--   entregas-lms  privado: entregas de alumnos    (path: <alumno_id>/<tarea_id>/<archivo>)
-- ════════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public) values
  ('landing', 'landing', true),
  ('recursos-lms', 'recursos-lms', false),
  ('entregas-lms', 'entregas-lms', false)
on conflict (id) do nothing;

-- landing: lectura pública (bucket público); escribe solo el staff
create policy landing_staff_escribir on storage.objects for insert to authenticated
  with check (bucket_id = 'landing' and public.es_staff());
create policy landing_staff_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'landing' and public.es_staff());
create policy landing_staff_editar on storage.objects for update to authenticated
  using (bucket_id = 'landing' and public.es_staff());

-- recursos-lms: docentes del curso y staff suben/borran; alumnos del salón leen
create policy recursos_leer on storage.objects for select to authenticated using (
  bucket_id = 'recursos-lms' and (
    public.es_staff()
    or public.dicta_asignacion(public.asig_de_sesion(nullif((storage.foldername(name))[1], '')::uuid))
    or public.cursa_asignacion(public.asig_de_sesion(nullif((storage.foldername(name))[1], '')::uuid))));
create policy recursos_subir on storage.objects for insert to authenticated with check (
  bucket_id = 'recursos-lms' and (
    public.es_staff()
    or public.dicta_asignacion(public.asig_de_sesion(nullif((storage.foldername(name))[1], '')::uuid))));
create policy recursos_borrar on storage.objects for delete to authenticated using (
  bucket_id = 'recursos-lms' and (
    public.es_staff()
    or public.dicta_asignacion(public.asig_de_sesion(nullif((storage.foldername(name))[1], '')::uuid))));

-- entregas-lms: el alumno gestiona su carpeta; docentes del curso y staff leen
create policy entregas_alumno on storage.objects for all to authenticated
  using (bucket_id = 'entregas-lms' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'entregas-lms' and (storage.foldername(name))[1] = auth.uid()::text);
create policy entregas_leer on storage.objects for select to authenticated using (
  bucket_id = 'entregas-lms' and (
    public.es_staff()
    or public.dicta_asignacion(public.asig_de_tarea(nullif((storage.foldername(name))[2], '')::uuid))));
