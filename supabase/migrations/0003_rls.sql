-- ════════════════════════════════════════════════════════════════════════════
-- ACEG — Row Level Security
-- Reglas generales:
--   • staff (administradores + administrativos): acceso total a todo.
--   • docentes: gestionan el contenido de las asignaciones que dictan.
--   • alumnos: leen lo de su salón y escriben solo lo propio (entregas, exámenes).
--   • anónimo: solo la landing pública (los padres usan la RPC por DNI).
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.asig_de_entrega(p_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select public.asig_de_tarea(tarea_id) from entregas where id = p_id
$$;

create or replace function public.es_mi_intento(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from intentos where id = p_id and alumno_id = auth.uid())
$$;

create or replace function public.asig_de_intento(p_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select e.asignacion_id from intentos i join examenes e on e.id = i.examen_id where i.id = p_id
$$;

-- ¿El docente actual dicta este curso en este grado?
create or replace function public.dicta_curso_grado(p_curso_id uuid, p_grado text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from asignaciones where docente_id = auth.uid() and curso_id = p_curso_id and grado = p_grado)
$$;

-- Activar RLS + política "staff todo" en todas las tablas públicas
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy staff_todo on public.%I for all to authenticated using (public.es_staff()) with check (public.es_staff())', t);
  end loop;
end $$;

-- ─── Usuarios ───────────────────────────────────────────────────────────────
create policy propio_leer on public.user_admin      for select to authenticated using (id = auth.uid());
create policy propio_leer on public.administrativos for select to authenticated using (id = auth.uid());
create policy autenticado_leer on public.docentes   for select to authenticated using (true);
create policy propio_leer on public.alumnos         for select to authenticated using (id = auth.uid());
create policy docente_leer on public.alumnos        for select to authenticated using (public.es_docente());
create policy propio_leer on public.permisos_usuario for select to authenticated using (user_id = auth.uid());

-- ─── Catálogos legibles por cualquier usuario con sesión ────────────────────
create policy autenticado_leer on public.cursos       for select to authenticated using (true);
create policy autenticado_leer on public.salones      for select to authenticated using (true);
create policy autenticado_leer on public.ciclos       for select to authenticated using (true);
create policy autenticado_leer on public.config       for select to authenticated using (true);
create policy autenticado_leer on public.asistencia_alumnos_config for select to authenticated using (true);
create policy autenticado_leer on public.qr_fondos    for select to authenticated using (true);
create policy autenticado_leer on public.horarios     for select to authenticated using (true);
create policy autenticado_leer on public.asignaciones for select to authenticated using (true);
create policy autenticado_leer on public.planes_anuales       for select to authenticated using (true);
create policy autenticado_leer on public.plan_anual_objetivos for select to authenticated using (true);
create policy autenticado_leer on public.plantillas_curso     for select to authenticated using (true);
create policy autenticado_leer on public.plantilla_sesiones   for select to authenticated using (true);

-- ─── Landing pública ────────────────────────────────────────────────────────
create policy publico_leer on public.landing_config  for select to anon, authenticated using (true);
create policy publico_leer on public.landing_galeria for select to anon, authenticated using (true);
create policy publico_leer on public.anuncios        for select to anon using (tipo = 'global' and en_landing);

-- ─── Matrículas ─────────────────────────────────────────────────────────────
create policy propio_leer  on public.matriculas for select to authenticated using (alumno_id = auth.uid());
create policy docente_leer on public.matriculas for select to authenticated using (public.es_docente());

-- ─── Anuncios ───────────────────────────────────────────────────────────────
create policy leer on public.anuncios for select to authenticated using (
  tipo = 'global' or public.dicta_asignacion(asignacion_id) or public.cursa_asignacion(asignacion_id));
create policy docente_crear on public.anuncios for insert to authenticated with check (
  autor_id = auth.uid() and tipo = 'curso' and public.dicta_asignacion(asignacion_id));
create policy docente_borrar on public.anuncios for delete to authenticated using (autor_id = auth.uid());

-- ─── Contenido del curso (docente dueño escribe, alumno del salón lee) ──────
create policy docente_todo on public.unidades for all to authenticated
  using (public.dicta_asignacion(asignacion_id)) with check (public.dicta_asignacion(asignacion_id));
create policy alumno_leer on public.unidades for select to authenticated using (public.cursa_asignacion(asignacion_id));

create policy docente_todo on public.sesiones for all to authenticated
  using (public.dicta_asignacion(public.asig_de_unidad(unidad_id))) with check (public.dicta_asignacion(public.asig_de_unidad(unidad_id)));
create policy alumno_leer on public.sesiones for select to authenticated using (public.cursa_asignacion(public.asig_de_unidad(unidad_id)));

create policy docente_todo on public.recursos for all to authenticated
  using (public.dicta_asignacion(public.asig_de_sesion(sesion_id))) with check (public.dicta_asignacion(public.asig_de_sesion(sesion_id)));
create policy alumno_leer on public.recursos for select to authenticated using (public.cursa_asignacion(public.asig_de_sesion(sesion_id)));

create policy docente_todo on public.tareas for all to authenticated
  using (public.dicta_asignacion(public.asig_de_sesion(sesion_id))) with check (public.dicta_asignacion(public.asig_de_sesion(sesion_id)));
create policy alumno_leer on public.tareas for select to authenticated using (public.cursa_asignacion(public.asig_de_sesion(sesion_id)));

create policy alumno_propio on public.entregas for all to authenticated
  using (alumno_id = auth.uid()) with check (alumno_id = auth.uid() and public.cursa_asignacion(public.asig_de_tarea(tarea_id)));
create policy docente_leer on public.entregas for select to authenticated using (public.dicta_asignacion(public.asig_de_tarea(tarea_id)));

create policy docente_todo on public.calificaciones for all to authenticated
  using (public.dicta_asignacion(public.asig_de_entrega(entrega_id))) with check (public.dicta_asignacion(public.asig_de_entrega(entrega_id)));
create policy alumno_leer on public.calificaciones for select to authenticated
  using (exists (select 1 from public.entregas e where e.id = entrega_id and e.alumno_id = auth.uid()));

-- ─── Exámenes en línea ──────────────────────────────────────────────────────
create policy docente_todo on public.examenes for all to authenticated
  using (public.dicta_asignacion(asignacion_id)) with check (public.dicta_asignacion(asignacion_id));
create policy alumno_leer on public.examenes for select to authenticated using (publicado and public.cursa_asignacion(asignacion_id));

create policy docente_todo on public.preguntas for all to authenticated
  using (public.dicta_asignacion(public.asig_de_examen(examen_id))) with check (public.dicta_asignacion(public.asig_de_examen(examen_id)));
create policy alumno_leer on public.preguntas for select to authenticated using (public.cursa_asignacion(public.asig_de_examen(examen_id)));

create policy docente_todo on public.opciones for all to authenticated
  using (public.dicta_asignacion(public.asig_de_pregunta(pregunta_id))) with check (public.dicta_asignacion(public.asig_de_pregunta(pregunta_id)));
create policy alumno_leer on public.opciones for select to authenticated using (public.cursa_asignacion(public.asig_de_pregunta(pregunta_id)));

create policy alumno_propio on public.intentos for all to authenticated
  using (alumno_id = auth.uid()) with check (alumno_id = auth.uid() and public.cursa_asignacion(public.asig_de_examen(examen_id)));
create policy docente_leer on public.intentos for select to authenticated using (public.dicta_asignacion(public.asig_de_examen(examen_id)));

create policy alumno_propio on public.respuestas for all to authenticated
  using (public.es_mi_intento(intento_id)) with check (public.es_mi_intento(intento_id));
create policy docente_leer on public.respuestas for select to authenticated using (public.dicta_asignacion(public.asig_de_intento(intento_id)));

-- ─── Asistencia ─────────────────────────────────────────────────────────────
-- Las marcas del personal se crean solo vía registrar_asistencia_boton
create policy propio_leer on public.asistencias for select to authenticated using (docente_id = auth.uid());

create policy propio_leer  on public.justificaciones for select to authenticated using (docente_id = auth.uid());
create policy propio_crear on public.justificaciones for insert to authenticated with check (docente_id = auth.uid());

create policy docente_todo on public.asistencia_alumnos for all to authenticated
  using (public.dicta_asignacion(asignacion_id)) with check (public.dicta_asignacion(asignacion_id));
create policy alumno_leer on public.asistencia_alumnos for select to authenticated using (alumno_id = auth.uid());

create policy alumno_leer on public.asistencia_diaria_alumnos for select to authenticated using (alumno_id = auth.uid());

-- ─── Planificación: el docente edita las plantillas de lo que dicta ─────────
create policy docente_escribir on public.plantillas_curso for insert to authenticated
  with check (public.dicta_curso_grado(curso_id, grado));
create policy docente_editar on public.plantillas_curso for update to authenticated
  using (public.dicta_curso_grado(curso_id, grado) and estado <> 'publicada')
  with check (public.dicta_curso_grado(curso_id, grado) and estado <> 'publicada');

create policy docente_todo on public.plantilla_sesiones for all to authenticated
  using (exists (select 1 from public.plantillas_curso p where p.id = plantilla_id
                 and public.dicta_curso_grado(p.curso_id, p.grado) and p.estado <> 'publicada'))
  with check (exists (select 1 from public.plantillas_curso p where p.id = plantilla_id
                 and public.dicta_curso_grado(p.curso_id, p.grado) and p.estado <> 'publicada'));
