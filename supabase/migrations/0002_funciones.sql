-- ════════════════════════════════════════════════════════════════════════════
-- ACEG — Funciones auxiliares y RPCs llamados desde la app
-- Todas las RPC devuelven jsonb con { error: '...' } ante un fallo esperado,
-- que es como la app las interpreta (data?.error).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Helpers de rol (usados también por las políticas RLS) ──────────────────

create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_admin where id = auth.uid())
$$;

create or replace function public.es_super() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_admin where id = auth.uid() and es_super)
$$;

-- Personal con acceso al panel /admin (administradores + administrativos)
create or replace function public.es_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_admin where id = auth.uid())
      or exists (select 1 from administrativos where id = auth.uid())
$$;

create or replace function public.es_docente() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from docentes where id = auth.uid())
$$;

-- ¿El docente actual dicta esta asignación?
create or replace function public.dicta_asignacion(p_asignacion_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from asignaciones where id = p_asignacion_id and docente_id = auth.uid())
$$;

-- ¿El alumno actual pertenece al salón de esta asignación?
create or replace function public.cursa_asignacion(p_asignacion_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from asignaciones a join alumnos al on al.id = auth.uid()
    where a.id = p_asignacion_id and a.grado = al.grado and a.grupo = al.grupo
  )
$$;

-- Asignación dueña de una unidad / sesión / tarea / examen / pregunta
create or replace function public.asig_de_unidad(p_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select asignacion_id from unidades where id = p_id
$$;
create or replace function public.asig_de_sesion(p_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select u.asignacion_id from sesiones s join unidades u on u.id = s.unidad_id where s.id = p_id
$$;
create or replace function public.asig_de_tarea(p_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select public.asig_de_sesion(sesion_id) from tareas where id = p_id
$$;
create or replace function public.asig_de_examen(p_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select asignacion_id from examenes where id = p_id
$$;
create or replace function public.asig_de_pregunta(p_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select e.asignacion_id from preguntas p join examenes e on e.id = p.examen_id where p.id = p_id
$$;

create or replace function public.hoy_lima() returns date
language sql stable as $$ select (now() at time zone 'America/Lima')::date $$;

create or replace function public.hora_lima(t timestamptz) returns text
language sql stable as $$ select to_char(t at time zone 'America/Lima', 'HH24:MI') $$;

-- ─── Cuentas de acceso (auth.users) ─────────────────────────────────────────

create or replace function public._crear_auth_user(p_email text, p_password text, p_nombre text)
returns uuid language plpgsql security definer set search_path = public, extensions, auth as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    lower(p_email), extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('nombre', p_nombre), now(), now(),
    '', '', '', '', '', '', '', ''
  );
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text,
          jsonb_build_object('sub', v_id::text, 'email', lower(p_email), 'email_verified', true),
          'email', now(), now(), now());
  return v_id;
end $$;
revoke all on function public._crear_auth_user(text, text, text) from public, anon, authenticated;

create or replace function public.crear_admin(p_email text, p_password text, p_nombre text)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_id uuid;
begin
  if not public.es_admin() then return jsonb_build_object('error', 'No autorizado'); end if;
  if exists (select 1 from auth.users where email = lower(p_email)) then
    return jsonb_build_object('error', 'El usuario ' || p_email || ' ya está registrado');
  end if;
  v_id := public._crear_auth_user(p_email, p_password, p_nombre);
  insert into user_admin (id, nombre, email, usuario)
  values (v_id, p_nombre, lower(p_email), split_part(lower(p_email), '@', 1));
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.crear_docente(p_email text, p_password text, p_nombre text)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_id uuid;
begin
  if not public.es_staff() then return jsonb_build_object('error', 'No autorizado'); end if;
  if exists (select 1 from auth.users where email = lower(p_email)) then
    return jsonb_build_object('error', 'El usuario ' || p_email || ' ya está registrado');
  end if;
  v_id := public._crear_auth_user(p_email, p_password, p_nombre);
  insert into docentes (id, nombre, email, usuario)
  values (v_id, p_nombre, lower(p_email), split_part(lower(p_email), '@', 1));
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.crear_alumno(p_email text, p_password text, p_nombre text, p_apellidos text, p_usuario text)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_id uuid; v_usuario text := lower(trim(p_usuario));
begin
  if not public.es_staff() then return jsonb_build_object('error', 'No autorizado'); end if;
  if exists (select 1 from auth.users where email = lower(p_email)) then
    return jsonb_build_object('error', 'El usuario ' || v_usuario || ' ya está registrado');
  end if;
  v_id := public._crear_auth_user(p_email, p_password, trim(p_nombre || ' ' || coalesce(p_apellidos, '')));
  insert into alumnos (id, nombre, apellidos, email, usuario)
  values (v_id, p_nombre, nullif(p_apellidos, ''), lower(p_email), v_usuario);
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.resetear_password(p_user_id uuid, p_password text)
returns jsonb language plpgsql security definer set search_path = public, extensions, auth as $$
begin
  if not public.es_staff() then return jsonb_build_object('error', 'No autorizado'); end if;
  if length(coalesce(p_password, '')) < 6 then
    return jsonb_build_object('error', 'La contraseña debe tener al menos 6 caracteres');
  end if;
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now()
  where id = p_user_id;
  if not found then return jsonb_build_object('error', 'Usuario no encontrado'); end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.eliminar_usuario(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.es_admin() then return jsonb_build_object('error', 'No autorizado'); end if;
  if p_user_id = auth.uid() then return jsonb_build_object('error', 'No puedes eliminar tu propio usuario'); end if;
  delete from alumnos where id = p_user_id;
  delete from auth.users where id = p_user_id;   -- cascada a user_admin/docentes/administrativos
  return jsonb_build_object('ok', true);
end $$;

-- Login por "usuario": devuelve el email de acceso (lo llama el visitante anónimo)
create or replace function public.email_por_usuario(p_usuario text)
returns text language plpgsql stable security definer set search_path = public, auth as $$
declare u text := lower(trim(p_usuario)); v text;
begin
  if u = '' then return null; end if;
  if position('@' in u) > 0 then
    select email into v from auth.users where email = u;
    return v;
  end if;
  select email into v from user_admin      where usuario = u; if v is not null then return v; end if;
  select email into v from administrativos where usuario = u; if v is not null then return v; end if;
  select email into v from docentes        where usuario = u; if v is not null then return v; end if;
  select a.email into v from alumnos a where a.usuario = u and a.email is not null; if v is not null then return v; end if;
  select email into v from auth.users where email in (u || '@habich.sys', u || '@habich.alumno') limit 1;
  return v;
end $$;

-- Exclusividad entre roles de personal (DNI / usuario no repetidos)
create or replace function public.validar_rol_libre(p_dni text, p_usuario text, p_destino text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d text := nullif(trim(p_dni), ''); u text := nullif(lower(trim(p_usuario)), '');
begin
  if not public.es_staff() then return jsonb_build_object('error', 'No autorizado'); end if;
  if p_destino <> 'docente' and exists (select 1 from docentes where (d is not null and dni = d) or (u is not null and usuario = u)) then
    return jsonb_build_object('ok', false, 'rol', 'docente',
      'match', case when d is not null and exists (select 1 from docentes where dni = d) then 'DNI ' || d else 'usuario "' || u || '"' end);
  end if;
  if p_destino <> 'administrativo' and exists (select 1 from administrativos where (d is not null and dni = d) or (u is not null and usuario = u)) then
    return jsonb_build_object('ok', false, 'rol', 'administrativo',
      'match', case when d is not null and exists (select 1 from administrativos where dni = d) then 'DNI ' || d else 'usuario "' || u || '"' end);
  end if;
  if p_destino <> 'admin' and exists (select 1 from user_admin where (d is not null and dni = d) or (u is not null and usuario = u)) then
    return jsonb_build_object('ok', false, 'rol', 'administrador',
      'match', case when d is not null and exists (select 1 from user_admin where dni = d) then 'DNI ' || d else 'usuario "' || u || '"' end);
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Mover a una persona entre docentes / administrativos / administradores
create or replace function public.cambiar_tipo_usuario(
  p_user_id uuid, p_nombre text, p_email text, p_usuario text, p_origen text, p_destino text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if not public.es_admin() then return jsonb_build_object('error', 'No autorizado'); end if;
  if p_origen = 'docentes' then
    select apellido, dni, correo, celular, cumpleanos, hora_entrada into r from docentes where id = p_user_id;
  elsif p_origen = 'administrativos' then
    select apellido, dni, correo, celular, cumpleanos, hora_entrada into r from administrativos where id = p_user_id;
  else
    return jsonb_build_object('error', 'Origen no válido');
  end if;
  if not found then return jsonb_build_object('error', 'Usuario no encontrado en ' || p_origen); end if;

  if p_destino = 'docente' then
    insert into docentes (id, nombre, email, usuario, apellido, dni, correo, celular, cumpleanos, hora_entrada)
    values (p_user_id, p_nombre, p_email, p_usuario, r.apellido, r.dni, r.correo, r.celular, r.cumpleanos, r.hora_entrada)
    on conflict (id) do nothing;
  elsif p_destino = 'administrativo' then
    insert into administrativos (id, nombre, email, usuario, apellido, dni, correo, celular, cumpleanos, hora_entrada)
    values (p_user_id, p_nombre, p_email, p_usuario, r.apellido, r.dni, r.correo, r.celular, r.cumpleanos, r.hora_entrada)
    on conflict (id) do nothing;
  elsif p_destino = 'admin' then
    insert into user_admin (id, nombre, email, usuario, apellido, dni, correo, celular, cumpleanos)
    values (p_user_id, p_nombre, p_email, p_usuario, r.apellido, r.dni, r.correo, r.celular, r.cumpleanos)
    on conflict (id) do nothing;
  else
    return jsonb_build_object('error', 'Destino no válido');
  end if;

  if p_origen = 'docentes' and p_destino <> 'docente' then
    delete from docentes where id = p_user_id;
  elsif p_origen = 'administrativos' and p_destino <> 'administrativo' then
    delete from administrativos where id = p_user_id;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ─── Permisos por módulo del panel admin ────────────────────────────────────

create or replace function public.mis_modulos()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare p record;
begin
  if public.es_super() then return jsonb_build_object('super', true, 'todos', true, 'modulos', '[]'::jsonb); end if;
  select modulos, configurado into p from permisos_usuario where user_id = auth.uid();
  if not found or not p.configurado then
    return jsonb_build_object('super', false, 'todos', true, 'modulos', '[]'::jsonb);
  end if;
  return jsonb_build_object('super', false, 'todos', false, 'modulos', to_jsonb(p.modulos));
end $$;

create or replace function public.set_permisos_usuario(p_user_id uuid, p_modulos text[])
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.es_super() then return jsonb_build_object('error', 'Solo el super admin puede editar permisos'); end if;
  insert into permisos_usuario (user_id, modulos, configurado, updated_at)
  values (p_user_id, coalesce(p_modulos, '{}'), true, now())
  on conflict (user_id) do update set modulos = excluded.modulos, configurado = true, updated_at = now();
  return jsonb_build_object('ok', true);
end $$;

-- ─── Ciclos y matrícula ─────────────────────────────────────────────────────

create or replace function public.activar_ciclo(p_ciclo_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_nombre text; v_sync int; v_sin int;
begin
  if not public.es_staff() then return jsonb_build_object('error', 'No autorizado'); end if;
  select nombre into v_nombre from ciclos where id = p_ciclo_id and tipo = 'lectivo';
  if v_nombre is null then return jsonb_build_object('error', 'Ciclo no encontrado'); end if;

  update ciclos set activo = false where tipo = 'lectivo' and activo and id <> p_ciclo_id;
  update ciclos set activo = true where id = p_ciclo_id;

  -- El salón vigente del alumno pasa a ser el de su matrícula en este ciclo
  update alumnos a set grado = m.grado, grupo = m.grupo
  from matriculas m
  where m.alumno_id = a.id and m.ciclo_id = p_ciclo_id
    and m.estado not in ('retirado', 'trasladado')
    and (a.grado is distinct from m.grado or a.grupo is distinct from m.grupo);
  get diagnostics v_sync = row_count;

  update alumnos a set grado = null, grupo = null
  where a.activo and (a.grado is not null or a.grupo is not null)
    and not exists (select 1 from matriculas m where m.alumno_id = a.id and m.ciclo_id = p_ciclo_id
                    and m.estado not in ('retirado', 'trasladado'));
  get diagnostics v_sin = row_count;

  return jsonb_build_object('ok', true, 'ciclo', v_nombre,
                            'alumnos_sincronizados', v_sync, 'alumnos_sin_matricula', v_sin);
end $$;

create or replace function public.dar_baja_alumno(p_alumno_id uuid, p_estado text, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_nombre text;
begin
  if not public.es_staff() then return jsonb_build_object('error', 'No autorizado'); end if;
  if p_estado not in ('retirado', 'trasladado') then return jsonb_build_object('error', 'Estado no válido'); end if;
  select trim(coalesce(apellidos, '') || ' ' || nombre) into v_nombre from alumnos where id = p_alumno_id;
  if v_nombre is null then return jsonb_build_object('error', 'Alumno no encontrado'); end if;

  update matriculas set estado = p_estado, fecha_baja = now(), motivo_baja = p_motivo
  where alumno_id = p_alumno_id
    and ciclo_id = (select id from ciclos where tipo = 'lectivo' and activo limit 1);
  update alumnos set activo = false, grado = null, grupo = null where id = p_alumno_id;
  return jsonb_build_object('ok', true, 'alumno', v_nombre);
end $$;

-- ─── Asistencia del personal (botón con geocerca) ───────────────────────────

create or replace function public._distancia_m(lat1 float8, lng1 float8, lat2 float8, lng2 float8)
returns int language sql immutable as $$
  select round(2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2))))::int
$$;

create or replace function public.obtener_geo_asistencia()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g record;
begin
  if not public.es_staff() then return jsonb_build_object('error', 'No autorizado'); end if;
  select * into g from geo_asistencia_config where id = 1;
  return jsonb_build_object('activo', g.activo, 'lat', g.lat, 'lng', g.lng, 'radio_m', g.radio_m);
end $$;

create or replace function public.geo_asistencia_zona()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g record;
begin
  if auth.uid() is null then return jsonb_build_object('error', 'No autenticado'); end if;
  select * into g from geo_asistencia_config where id = 1;
  return jsonb_build_object('activo', g.activo, 'lat', g.lat, 'lng', g.lng, 'radio_m', g.radio_m);
end $$;

create or replace function public.configurar_geo_asistencia(p_activo boolean, p_lat float8, p_lng float8, p_radio_m int)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.es_admin() then return jsonb_build_object('error', 'No autorizado'); end if;
  if p_activo and (p_lat is null or p_lng is null) then
    return jsonb_build_object('error', 'Para activar la restricción indica la ubicación del colegio.');
  end if;
  update geo_asistencia_config
  set activo = p_activo, lat = p_lat, lng = p_lng, radio_m = coalesce(p_radio_m, radio_m)
  where id = 1;
  return (select jsonb_build_object('ok', true, 'activo', activo, 'radio_m', radio_m) from geo_asistencia_config where id = 1);
end $$;

create or replace function public.registrar_asistencia_boton(p_lat float8 default null, p_lng float8 default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  g record; v_marcas int; v_tipo text; v_hora_ent time; v_tarde boolean := false; v_dist int;
  v_inicio timestamptz := (public.hoy_lima()::timestamp at time zone 'America/Lima');
begin
  if v_uid is null then return jsonb_build_object('error', 'Sesión no válida'); end if;
  select hora_entrada into v_hora_ent from docentes where id = v_uid;
  if not found then
    select hora_entrada into v_hora_ent from administrativos where id = v_uid;
    if not found and not public.es_admin() then
      return jsonb_build_object('error', 'Tu usuario no puede marcar asistencia.');
    end if;
  end if;

  select * into g from geo_asistencia_config where id = 1;
  if g.activo then
    if p_lat is null or p_lng is null then
      return jsonb_build_object('error', 'No se pudo obtener tu ubicación. Activa el GPS e intenta de nuevo.');
    end if;
    v_dist := public._distancia_m(g.lat, g.lng, p_lat, p_lng);
    if v_dist > g.radio_m then
      return jsonb_build_object('error', format('Estás a %s m del colegio. Debes estar a menos de %s m para marcar.', v_dist, g.radio_m));
    end if;
  end if;

  select count(*) into v_marcas from asistencias where docente_id = v_uid and fecha_hora >= v_inicio;
  if v_marcas >= 2 then
    return jsonb_build_object('error', 'Ya registraste tu entrada y salida de hoy.');
  end if;
  v_tipo := case when v_marcas = 0 then 'entrada' else 'salida' end;
  if v_tipo = 'entrada' and v_hora_ent is not null then
    v_tarde := (now() at time zone 'America/Lima')::time > v_hora_ent;
  end if;

  insert into asistencias (docente_id, tipo, tardanza, lat, lng) values (v_uid, v_tipo, v_tarde, p_lat, p_lng);
  return jsonb_build_object('ok', true, 'tipo', v_tipo, 'tardanza', v_tarde,
    'mensaje', case when v_tipo = 'salida' then 'Salida registrada a las ' || public.hora_lima(now())
                    when v_tarde then 'Entrada registrada con tardanza a las ' || public.hora_lima(now())
                    else 'Entrada registrada a las ' || public.hora_lima(now()) end);
end $$;

create or replace function public.justificar_asistencia(p_justificacion_id uuid, p_respuesta text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.es_staff() then raise exception 'No autorizado'; end if;
  update justificaciones set estado = 'justificado', respuesta = p_respuesta where id = p_justificacion_id;
  if not found then raise exception 'Justificación no encontrada'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- ─── Asistencia de alumnos por QR ───────────────────────────────────────────

create or replace function public.set_asistencia_alumnos_config(p_hora_entrada text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.es_staff() then return jsonb_build_object('error', 'No autorizado'); end if;
  update asistencia_alumnos_config set hora_entrada = p_hora_entrada::time where id = 1;
  return jsonb_build_object('ok', true);
end $$;

-- Escáner de puerta: 1.er escaneo = entrada (P/T), 2.º tras N horas = salida
create or replace function public.registrar_asistencia_alumno_auto(p_qr_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a record; c record; r record; v_hoy date := public.hoy_lima(); v_estado text; v_ciclo uuid;
begin
  if not public.es_staff() then return jsonb_build_object('error', 'No autorizado'); end if;
  select id, nombre, apellidos, grado, grupo, activo into a from alumnos where qr_token = trim(p_qr_token);
  if not found then return jsonb_build_object('error', 'QR no reconocido'); end if;
  if not a.activo then return jsonb_build_object('error', 'El alumno está dado de baja'); end if;
  select * into c from asistencia_alumnos_config where id = 1;
  select * into r from asistencia_diaria_alumnos where alumno_id = a.id and fecha = v_hoy;

  if not found then
    v_estado := case when (now() at time zone 'America/Lima')::time
                          > c.hora_entrada + make_interval(mins => c.tolerancia_min) then 'T' else 'P' end;
    select id into v_ciclo from ciclos where tipo = 'lectivo' and activo limit 1;
    insert into asistencia_diaria_alumnos (alumno_id, ciclo_id, fecha, estado) values (a.id, v_ciclo, v_hoy, v_estado);
    return jsonb_build_object('tipo', 'ok', 'alumno_id', a.id, 'nombre', trim(coalesce(a.apellidos, '') || ' ' || a.nombre),
      'grado', a.grado, 'grupo', a.grupo, 'estado', v_estado, 'hora_entrada', public.hora_lima(now()),
      'mensaje', case when v_estado = 'T' then 'Entrada con tardanza ✓' else 'Entrada registrada ✓' end);
  end if;

  if r.hora_salida is not null then
    return jsonb_build_object('tipo', 'completo', 'alumno_id', a.id, 'nombre', trim(coalesce(a.apellidos, '') || ' ' || a.nombre),
      'grado', a.grado, 'grupo', a.grupo, 'hora_entrada', public.hora_lima(r.created_at), 'hora_salida', public.hora_lima(r.hora_salida),
      'mensaje', 'Entrada y salida ya registradas');
  end if;

  if now() >= r.created_at + make_interval(hours => c.salida_tras_horas) then
    update asistencia_diaria_alumnos set hora_salida = now() where id = r.id;
    return jsonb_build_object('tipo', 'salida_ok', 'alumno_id', a.id, 'nombre', trim(coalesce(a.apellidos, '') || ' ' || a.nombre),
      'grado', a.grado, 'grupo', a.grupo, 'hora_entrada', public.hora_lima(r.created_at), 'hora_salida', public.hora_lima(now()),
      'mensaje', 'Salida registrada ✓');
  end if;

  return jsonb_build_object('tipo', 'repetido', 'alumno_id', a.id, 'nombre', trim(coalesce(a.apellidos, '') || ' ' || a.nombre),
    'grado', a.grado, 'grupo', a.grupo, 'hora_entrada', public.hora_lima(r.created_at),
    'mensaje', 'Entrada ya registrada a las ' || public.hora_lima(r.created_at));
end $$;

-- Escáner del docente en clase: marca presente en su curso
create or replace function public.registrar_asistencia_alumno(p_qr_token text, p_asignacion_id uuid, p_fecha date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a record; s record; v_nombre text;
begin
  if not (public.dicta_asignacion(p_asignacion_id) or public.es_staff()) then
    return jsonb_build_object('error', 'No autorizado para este curso');
  end if;
  select grado, grupo into s from asignaciones where id = p_asignacion_id;
  select id, nombre, apellidos, grado, grupo into a from alumnos where qr_token = trim(p_qr_token);
  if not found then return jsonb_build_object('error', 'QR no reconocido'); end if;
  v_nombre := trim(coalesce(a.apellidos, '') || ' ' || a.nombre);
  if a.grado is distinct from s.grado or a.grupo is distinct from s.grupo then
    return jsonb_build_object('error', v_nombre || ' no pertenece a este salón');
  end if;
  if exists (select 1 from asistencia_alumnos where asignacion_id = p_asignacion_id and alumno_id = a.id and fecha = p_fecha and presente) then
    return jsonb_build_object('alumno_id', a.id, 'nombre', v_nombre, 'ya_marcado', true);
  end if;
  insert into asistencia_alumnos (asignacion_id, alumno_id, fecha, presente)
  values (p_asignacion_id, a.id, p_fecha, true)
  on conflict (asignacion_id, alumno_id, fecha) do update set presente = true;
  return jsonb_build_object('alumno_id', a.id, 'nombre', v_nombre, 'ya_marcado', false);
end $$;

-- ─── Libreta / portal de padres ─────────────────────────────────────────────

create or replace function public._libreta_de(p_alumno_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'periodo', p.nombre,
    'notas', coalesce((
      select jsonb_agg(jsonb_build_object('titulo', e.titulo, 'nota', n.nota, 'comentario', n.comentario) order by e.orden, e.titulo)
      from libreta_evaluaciones e join libreta_notas n on n.evaluacion_id = e.id and n.alumno_id = al.id
      where e.periodo_id = p.id and e.grado = m.grado and e.grupo = m.grupo and n.nota is not null), '[]'::jsonb),
    'examenes', coalesce((
      select jsonb_agg(jsonb_build_object('titulo', x.titulo, 'preguntas', x.preguntas, 'respuestas', r.respuestas) order by x.created_at)
      from libreta_examenes x join libreta_examen_respuestas r on r.examen_id = x.id and r.alumno_id = al.id
      where x.periodo_id = p.id and x.grado = m.grado and x.grupo = m.grupo), '[]'::jsonb)
  ) order by p.created_at), '[]'::jsonb)
  from alumnos al
  join matriculas m on m.alumno_id = al.id
  join ciclos c on c.id = m.ciclo_id and c.activo and c.tipo = 'lectivo'
  join libreta_periodos p on p.ciclo_id = c.id and p.publicado
  where al.id = p_alumno_id
$$;
revoke all on function public._libreta_de(uuid) from public, anon, authenticated;

create or replace function public.libreta_alumno()
returns jsonb language sql stable security definer set search_path = public as $$
  select public._libreta_de(auth.uid())
$$;

create or replace function public.portal_datos_alumno(p_dni text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a record; c record; v_dias date[]; v_ultimo date;
begin
  select id, nombre, apellidos, grado, grupo, dni into a from alumnos where dni = trim(p_dni) and activo limit 1;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  select id, nombre, fecha_inicio into c from ciclos where tipo = 'lectivo' and activo limit 1;

  -- Días lectivos = días en que el colegio registró asistencia de algún alumno
  select array_agg(distinct fecha order by fecha) into v_dias
  from asistencia_diaria_alumnos where ciclo_id = c.id and fecha <= public.hoy_lima();
  v_ultimo := v_dias[array_length(v_dias, 1)];

  return jsonb_build_object(
    'alumno', to_jsonb(a),
    'asistencia', coalesce((
      select jsonb_agg(jsonb_build_object(
        'fecha', d, 'presente', coalesce(r.estado, 'P') in ('P', 'T'),
        'hora_entrada', case when r.estado <> 'J' then public.hora_lima(r.created_at) end,
        'hora_salida', public.hora_lima(r.hora_salida), 'observacion', r.observacion) order by d desc)
      from unnest(coalesce(v_dias, '{}'::date[])) d
      left join asistencia_diaria_alumnos r on r.alumno_id = a.id and r.fecha = d), '[]'::jsonb),
    'asistencia_info', jsonb_build_object('ciclo', c.nombre, 'ultimo_dia', v_ultimo,
                                          'sin_registros', v_dias is null, 'total_dias', coalesce(array_length(v_dias, 1), 0)),
    'calificaciones', coalesce((
      select jsonb_agg(jsonb_build_object('curso', cu.nombre, 'nota', ca.nota, 'comentario', ca.comentario,
                                          'tarea_titulo', t.titulo, 'created_at', ca.calificado_at) order by ca.calificado_at desc)
      from entregas e join calificaciones ca on ca.entrega_id = e.id
      join tareas t on t.id = e.tarea_id join sesiones s on s.id = t.sesion_id join unidades u on u.id = s.unidad_id
      join asignaciones asg on asg.id = u.asignacion_id join cursos cu on cu.id = asg.curso_id
      where e.alumno_id = a.id and (c.id is null or asg.ciclo_id = c.id)), '[]'::jsonb),
    'pendientes', coalesce((
      select jsonb_agg(jsonb_build_object('titulo', t.titulo, 'fecha_limite', t.fecha_limite, 'curso', cu.nombre) order by t.fecha_limite nulls last)
      from tareas t join sesiones s on s.id = t.sesion_id join unidades u on u.id = s.unidad_id
      join asignaciones asg on asg.id = u.asignacion_id join cursos cu on cu.id = asg.curso_id
      where asg.grado = a.grado and asg.grupo = a.grupo and (c.id is null or asg.ciclo_id = c.id)
        and (t.fecha_limite is null or t.fecha_limite >= now())
        and not exists (select 1 from entregas e where e.tarea_id = t.id and e.alumno_id = a.id)), '[]'::jsonb),
    'libreta', public._libreta_de(a.id)
  );
end $$;

-- ─── Planificación ──────────────────────────────────────────────────────────

-- Siembra las semanas de una plantilla como sesiones en todas las
-- asignaciones del curso/grado del año del bimestre, y la publica.
create or replace function public.generar_sesiones_desde_plantilla(p_plantilla_id uuid)
returns table (asignaciones_afectadas int, sesiones_creadas int)
language plpgsql security definer set search_path = public as $$
declare pl record; b record; asg record; v_unidad uuid; v_asigs int := 0; v_sess int := 0; n int;
begin
  if not public.es_staff() then raise exception 'No autorizado'; end if;
  select * into pl from plantillas_curso where id = p_plantilla_id;
  if not found then raise exception 'Plantilla no encontrada'; end if;
  select * into b from ciclos where id = pl.ciclo_id;

  for asg in select id from asignaciones where curso_id = pl.curso_id and grado = pl.grado and anio = b.anio loop
    v_asigs := v_asigs + 1;
    select id into v_unidad from unidades where asignacion_id = asg.id and nombre = b.nombre;
    if v_unidad is null then
      insert into unidades (asignacion_id, nombre, descripcion, orden)
      values (asg.id, b.nombre, pl.situacion_significativa, b.periodo) returning id into v_unidad;
    end if;
    insert into sesiones (unidad_id, titulo, descripcion, orden)
    select v_unidad, ps.titulo, ps.descripcion, ps.semana
    from plantilla_sesiones ps
    where ps.plantilla_id = pl.id and ps.tipo <> 'feriado'
      and not exists (select 1 from sesiones s where s.unidad_id = v_unidad and s.orden = ps.semana);
    get diagnostics n = row_count;
    v_sess := v_sess + n;
    v_unidad := null;
  end loop;

  if v_asigs > 0 then update plantillas_curso set estado = 'publicada' where id = pl.id; end if;
  return query select v_asigs, v_sess;
end $$;

-- Copia la planificación de un curso/grado del año anterior al año destino
create or replace function public.copiar_plan_anual(p_curso_id uuid, p_grado text, p_anio_destino int)
returns table (bimestres_creados int, plantillas_copiadas int, sesiones_copiadas int, plan_copiado boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_bim int := 0; v_pla int := 0; v_ses int := 0; v_plan boolean := false; n int;
  b record; pl record; v_dest_bim uuid; v_dest_pla uuid; v_plan_orig record; v_plan_dest uuid;
begin
  if not public.es_staff() then raise exception 'No autorizado'; end if;

  -- Plan anual + objetivos (mapa de objetivos viejo → nuevo en tabla temporal)
  create temp table if not exists _map_obj (viejo uuid primary key, nuevo uuid) on commit drop;
  select * into v_plan_orig from planes_anuales where curso_id = p_curso_id and grado = p_grado and anio = p_anio_destino - 1;
  if found then
    insert into planes_anuales (curso_id, grado, anio) values (p_curso_id, p_grado, p_anio_destino)
    on conflict (curso_id, grado, anio) do nothing;
    select id into v_plan_dest from planes_anuales where curso_id = p_curso_id and grado = p_grado and anio = p_anio_destino;
    if not exists (select 1 from plan_anual_objetivos where plan_id = v_plan_dest) then
      update planes_anuales set objetivos = coalesce(objetivos, v_plan_orig.objetivos),
                                modo_evaluacion = coalesce(modo_evaluacion, v_plan_orig.modo_evaluacion)
      where id = v_plan_dest;
      with src as (select id, orden, texto, gen_random_uuid() as nid from plan_anual_objetivos where plan_id = v_plan_orig.id),
           ins as (insert into plan_anual_objetivos (id, plan_id, orden, texto) select nid, v_plan_dest, orden, texto from src returning id)
      insert into _map_obj select id, nid from src;
      v_plan := true;
    end if;
  end if;

  -- Bimestres y plantillas
  for b in select * from ciclos where tipo = 'bimestre' and anio = p_anio_destino - 1 order by periodo loop
    select id into v_dest_bim from ciclos where tipo = 'bimestre' and anio = p_anio_destino and periodo = b.periodo;
    if v_dest_bim is null then
      insert into ciclos (nombre, anio, periodo, tipo, activo, semanas)
      values (p_anio_destino || '-B' || b.periodo, p_anio_destino, b.periodo, 'bimestre', false, b.semanas)
      returning id into v_dest_bim;
      v_bim := v_bim + 1;
    end if;

    select * into pl from plantillas_curso where curso_id = p_curso_id and grado = p_grado and ciclo_id = b.id;
    if found and not exists (select 1 from plantillas_curso where curso_id = p_curso_id and grado = p_grado and ciclo_id = v_dest_bim) then
      insert into plantillas_curso (curso_id, grado, ciclo_id, descripcion, situacion_significativa, estado)
      values (p_curso_id, p_grado, v_dest_bim, pl.descripcion, pl.situacion_significativa, 'borrador')
      returning id into v_dest_pla;
      v_pla := v_pla + 1;
      insert into plantilla_sesiones (plantilla_id, semana, titulo, descripcion, tipo, objetivo_id)
      select v_dest_pla, ps.semana, ps.titulo, ps.descripcion, ps.tipo, m.nuevo
      from plantilla_sesiones ps left join _map_obj m on m.viejo = ps.objetivo_id
      where ps.plantilla_id = pl.id;
      get diagnostics n = row_count;
      v_ses := v_ses + n;
    end if;
    v_dest_bim := null;
  end loop;

  return query select v_bim, v_pla, v_ses, v_plan;
end $$;

-- Las RPC son llamables por usuarios autenticados; las dos de acceso público
-- (login por usuario y portal de padres) también por anónimos.
grant execute on function public.email_por_usuario(text)   to anon, authenticated;
grant execute on function public.portal_datos_alumno(text) to anon, authenticated;
