-- ════════════════════════════════════════════════════════════════════════════
-- ACEG — Esquema base (tablas, índices, restricciones)
-- Reconstruido a partir del uso que hace la app (app/, components/, lib/).
-- Las fechas "del día" se calculan en hora de Lima (America/Lima).
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;

-- ─── Usuarios por rol ───────────────────────────────────────────────────────
-- El id de cada fila es el id de auth.users (salvo alumnos creados desde el
-- asistente de matrícula, que aún no tienen cuenta de acceso).

create table public.user_admin (
  id          uuid primary key references auth.users(id) on delete cascade,
  nombre      text not null,
  apellido    text,
  email       text not null unique,
  usuario     text unique,
  dni         text,
  correo      text,
  celular     text,
  cumpleanos  text,
  es_super    boolean not null default false,
  created_at  timestamptz not null default now()
);

create table public.docentes (
  id           uuid primary key references auth.users(id) on delete cascade,
  nombre       text not null,
  apellido     text,
  email        text not null unique,
  usuario      text unique,
  dni          text,
  correo       text,
  celular      text,
  cumpleanos   text,
  grado        text,
  grupo        text,
  hora_entrada time,
  created_at   timestamptz not null default now()
);

create table public.administrativos (
  id           uuid primary key references auth.users(id) on delete cascade,
  nombre       text not null,
  apellido     text,
  email        text not null unique,
  usuario      text unique,
  dni          text,
  correo       text,
  celular      text,
  cumpleanos   text,
  hora_entrada time,
  created_at   timestamptz not null default now()
);

create table public.alumnos (
  id                   uuid primary key default gen_random_uuid(),
  nombre               text not null,
  apellidos            text,
  email                text unique,
  usuario              text unique,
  dni                  text,
  grado                text,
  grupo                text,
  celular              text,
  celular_apoderado    text,
  fecha_nacimiento     date,
  sexo                 text,
  codigo_estudiante    text,
  nombre_apoderado     text,
  dni_apoderado        text,
  correo_apoderado     text,
  parentesco_apoderado text,
  qr_token             text unique default replace(gen_random_uuid()::text, '-', ''),
  activo               boolean not null default true,
  created_at           timestamptz not null default now()
);
create index alumnos_salon_idx on public.alumnos (grado, grupo);
create index alumnos_dni_idx   on public.alumnos (dni);

create table public.permisos_usuario (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  modulos     text[] not null default '{}',
  configurado boolean not null default true,
  updated_at  timestamptz not null default now()
);

-- ─── Configuración ──────────────────────────────────────────────────────────

create table public.config (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

create table public.asistencia_alumnos_config (
  id                int primary key default 1 check (id = 1),
  hora_entrada      time not null default '07:45',
  tolerancia_min    int  not null default 10,
  salida_tras_horas int  not null default 3
);

create table public.geo_asistencia_config (
  id      int primary key default 1 check (id = 1),
  activo  boolean not null default false,
  lat     double precision,
  lng     double precision,
  radio_m int not null default 150
);

-- ─── Ciclos (lectivos y bimestres de planificación) ─────────────────────────

create table public.ciclos (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null,
  anio         int  not null,
  periodo      int  not null default 1,
  tipo         text not null default 'lectivo' check (tipo in ('lectivo', 'bimestre')),
  activo       boolean not null default false,
  fecha_inicio date,
  fecha_fin    date,
  semanas      int default 10,
  created_at   timestamptz not null default now()
);
-- Solo un ciclo lectivo activo a la vez
create unique index ciclos_un_lectivo_activo on public.ciclos (tipo) where activo and tipo = 'lectivo';
create index ciclos_anio_idx on public.ciclos (anio, tipo);

-- ─── Estructura académica ───────────────────────────────────────────────────

create table public.cursos (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null unique,
  color      text not null default '#3B82F6',
  created_at timestamptz not null default now()
);

create table public.salones (
  grado  text not null,
  grupo  text not null,
  nombre text,
  primary key (grado, grupo)
);

create table public.matriculas (
  id              uuid primary key default gen_random_uuid(),
  alumno_id       uuid not null references public.alumnos(id) on delete cascade,
  ciclo_id        uuid not null references public.ciclos(id) on delete cascade,
  grado           text not null,
  grupo           text not null,
  tipo            text,
  estado          text not null default 'activa',
  fecha_matricula timestamptz default now(),
  fecha_baja      timestamptz,
  motivo_baja     text,
  observaciones   text,
  created_at      timestamptz not null default now(),
  unique (alumno_id, ciclo_id)
);
create index matriculas_ciclo_salon_idx on public.matriculas (ciclo_id, grado, grupo);

create table public.asignaciones (
  id         uuid primary key default gen_random_uuid(),
  docente_id uuid references public.docentes(id) on delete set null,
  curso_id   uuid not null references public.cursos(id) on delete cascade,
  ciclo_id   uuid references public.ciclos(id) on delete cascade,
  grado      text not null,
  grupo      text not null,
  anio       int  not null default extract(year from now())::int,
  created_at timestamptz not null default now()
);
create index asignaciones_docente_idx on public.asignaciones (docente_id);
create index asignaciones_salon_idx   on public.asignaciones (grado, grupo, ciclo_id);

create table public.horarios (
  id          uuid primary key default gen_random_uuid(),
  docente_id  uuid references public.docentes(id) on delete set null,
  dia         text not null,
  hora_inicio time not null,
  hora_fin    time not null,
  materia     text,
  grado       text,
  grupo       text,
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index horarios_salon_idx   on public.horarios (grado, grupo);
create index horarios_docente_idx on public.horarios (docente_id);

-- ─── LMS: unidades → sesiones → tareas / recursos / exámenes ────────────────

create table public.unidades (
  id            uuid primary key default gen_random_uuid(),
  asignacion_id uuid not null references public.asignaciones(id) on delete cascade,
  nombre        text not null,
  descripcion   text,
  orden         int not null default 0,
  created_at    timestamptz not null default now()
);
create index unidades_asig_idx on public.unidades (asignacion_id);

create table public.sesiones (
  id          uuid primary key default gen_random_uuid(),
  unidad_id   uuid not null references public.unidades(id) on delete cascade,
  titulo      text not null,
  descripcion text,
  orden       int not null default 0,
  created_at  timestamptz not null default now()
);
create index sesiones_unidad_idx on public.sesiones (unidad_id);

create table public.recursos (
  id         uuid primary key default gen_random_uuid(),
  sesion_id  uuid not null references public.sesiones(id) on delete cascade,
  nombre     text not null,
  tipo       text not null check (tipo in ('pdf', 'link', 'imagen', 'video')),
  url        text not null,
  orden      int not null default 0,
  created_at timestamptz not null default now()
);
create index recursos_sesion_idx on public.recursos (sesion_id);

create table public.tareas (
  id           uuid primary key default gen_random_uuid(),
  sesion_id    uuid not null references public.sesiones(id) on delete cascade,
  titulo       text not null,
  descripcion  text,
  fecha_limite timestamptz,
  max_puntos   numeric not null default 20,
  created_at   timestamptz not null default now()
);
create index tareas_sesion_idx on public.tareas (sesion_id);

create table public.entregas (
  id             uuid primary key default gen_random_uuid(),
  tarea_id       uuid not null references public.tareas(id) on delete cascade,
  alumno_id      uuid not null references public.alumnos(id) on delete cascade,
  url            text,
  tipo           text check (tipo in ('link', 'archivo')),
  nombre_archivo text,
  comentario     text,
  entregado_at   timestamptz not null default now(),
  unique (tarea_id, alumno_id)
);
create index entregas_alumno_idx on public.entregas (alumno_id);

create table public.calificaciones (
  id            uuid primary key default gen_random_uuid(),
  entrega_id    uuid not null unique references public.entregas(id) on delete cascade,
  docente_id    uuid references public.docentes(id) on delete set null,
  nota          numeric,
  comentario    text,
  calificado_at timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create table public.examenes (
  id               uuid primary key default gen_random_uuid(),
  asignacion_id    uuid not null references public.asignaciones(id) on delete cascade,
  sesion_id        uuid references public.sesiones(id) on delete set null,
  titulo           text not null,
  descripcion      text,
  fecha_limite     timestamptz,
  duracion_minutos int,
  publicado        boolean not null default false,
  created_at       timestamptz not null default now()
);
create index examenes_asig_idx on public.examenes (asignacion_id);

create table public.preguntas (
  id         uuid primary key default gen_random_uuid(),
  examen_id  uuid not null references public.examenes(id) on delete cascade,
  tipo       text not null check (tipo in ('opcion_multiple', 'verdadero_falso', 'texto_corto')),
  enunciado  text not null,
  puntos     numeric not null default 1,
  orden      int not null default 0,
  created_at timestamptz not null default now()
);

create table public.opciones (
  id          uuid primary key default gen_random_uuid(),
  pregunta_id uuid not null references public.preguntas(id) on delete cascade,
  texto       text not null,
  es_correcta boolean not null default false,
  orden       int not null default 0
);

create table public.intentos (
  id            uuid primary key default gen_random_uuid(),
  examen_id     uuid not null references public.examenes(id) on delete cascade,
  alumno_id     uuid not null references public.alumnos(id) on delete cascade,
  iniciado_at   timestamptz not null default now(),
  finalizado_at timestamptz,
  nota          numeric
);
create index intentos_alumno_idx on public.intentos (alumno_id, examen_id);

create table public.respuestas (
  id               uuid primary key default gen_random_uuid(),
  intento_id       uuid not null references public.intentos(id) on delete cascade,
  pregunta_id      uuid not null references public.preguntas(id) on delete cascade,
  opcion_id        uuid references public.opciones(id) on delete set null,
  texto_respuesta  text,
  es_correcta      boolean,
  puntos_obtenidos numeric default 0,
  unique (intento_id, pregunta_id)
);

create table public.anuncios (
  id            uuid primary key default gen_random_uuid(),
  titulo        text not null,
  contenido     text not null,
  tipo          text not null default 'global' check (tipo in ('global', 'curso')),
  asignacion_id uuid references public.asignaciones(id) on delete cascade,
  autor_id      uuid references auth.users(id) on delete set null,
  autor_nombre  text,
  en_landing    boolean not null default false,
  imagen_url    text,
  created_at    timestamptz not null default now()
);
create index anuncios_tipo_idx on public.anuncios (tipo, created_at desc);

-- ─── Asistencia ─────────────────────────────────────────────────────────────

-- Marcas de entrada/salida del personal (docentes y administrativos).
-- docente_id guarda el id del usuario que marca (sin FK: puede ser de
-- cualquiera de las dos tablas de personal).
create table public.asistencias (
  id          uuid primary key default gen_random_uuid(),
  docente_id  uuid not null references auth.users(id) on delete cascade,
  fecha_hora  timestamptz not null default now(),
  tipo        text check (tipo in ('entrada', 'salida')),
  tardanza    boolean not null default false,
  justificada boolean not null default false,
  lat         double precision,
  lng         double precision
);
create index asistencias_fecha_idx on public.asistencias (docente_id, fecha_hora);

create table public.justificaciones (
  id         uuid primary key default gen_random_uuid(),
  docente_id uuid not null references public.docentes(id) on delete cascade,
  fecha      date not null,
  motivo     text not null,
  estado     text not null default 'pendiente',
  respuesta  text,
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id                  uuid primary key default gen_random_uuid(),
  admin_id            uuid references auth.users(id) on delete set null,
  admin_nombre        text,
  accion              text not null,
  asistencia_id       uuid,
  docente_nombre      text,
  fecha_hora_original timestamptz,
  fecha_hora_nueva    timestamptz,
  justificacion       text not null,
  created_at          timestamptz not null default now()
);

-- Asistencia por curso (la toma el docente en clase)
create table public.asistencia_alumnos (
  id            uuid primary key default gen_random_uuid(),
  asignacion_id uuid not null references public.asignaciones(id) on delete cascade,
  alumno_id     uuid not null references public.alumnos(id) on delete cascade,
  fecha         date not null,
  presente      boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (asignacion_id, alumno_id, fecha)
);
create index asistencia_alumnos_alumno_idx on public.asistencia_alumnos (alumno_id);

-- Asistencia diaria de ingreso al colegio (escaneo QR en puerta)
-- estado: P = puntual, T = tardanza, J = falta justificada
create table public.asistencia_diaria_alumnos (
  id          uuid primary key default gen_random_uuid(),
  alumno_id   uuid not null references public.alumnos(id) on delete cascade,
  ciclo_id    uuid references public.ciclos(id) on delete set null,
  fecha       date not null,
  estado      text check (estado in ('P', 'T', 'J')),
  hora_salida timestamptz,
  observacion text,
  created_at  timestamptz not null default now(),
  unique (alumno_id, fecha)
);
create index asistencia_diaria_fecha_idx on public.asistencia_diaria_alumnos (fecha);

-- ─── Libreta de notas (boletín oficial) ─────────────────────────────────────

create table public.libreta_periodos (
  id         uuid primary key default gen_random_uuid(),
  ciclo_id   uuid not null references public.ciclos(id) on delete cascade,
  nombre     text not null,
  publicado  boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.libreta_evaluaciones (
  id         uuid primary key default gen_random_uuid(),
  periodo_id uuid not null references public.libreta_periodos(id) on delete cascade,
  grado      text not null,
  grupo      text not null,
  titulo     text not null,
  orden      int not null default 0,
  created_at timestamptz not null default now()
);
create index libreta_eval_idx on public.libreta_evaluaciones (periodo_id, grado, grupo);

create table public.libreta_notas (
  id            uuid primary key default gen_random_uuid(),
  evaluacion_id uuid not null references public.libreta_evaluaciones(id) on delete cascade,
  alumno_id     uuid not null references public.alumnos(id) on delete cascade,
  nota          numeric,
  comentario    text,
  updated_at    timestamptz not null default now(),
  unique (evaluacion_id, alumno_id)
);

create table public.libreta_examenes (
  id         uuid primary key default gen_random_uuid(),
  periodo_id uuid not null references public.libreta_periodos(id) on delete cascade,
  grado      text not null,
  grupo      text not null,
  titulo     text not null,
  preguntas  jsonb not null default '[]',   -- [{ n, area }]
  created_at timestamptz not null default now()
);

create table public.libreta_examen_respuestas (
  id         uuid primary key default gen_random_uuid(),
  examen_id  uuid not null references public.libreta_examenes(id) on delete cascade,
  alumno_id  uuid not null references public.alumnos(id) on delete cascade,
  respuestas jsonb not null default '{}',   -- { "1": 1, "2": 0, ... }
  unique (examen_id, alumno_id)
);

create table public.libreta_plantillas (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  cursos        jsonb not null default '[]',  -- string[]
  preguntas     jsonb,
  examen_titulo text,
  created_at    timestamptz not null default now()
);

-- ─── Planificación curricular ───────────────────────────────────────────────

create table public.planes_anuales (
  id              uuid primary key default gen_random_uuid(),
  curso_id        uuid not null references public.cursos(id) on delete cascade,
  grado           text not null,
  anio            int  not null,
  objetivos       text,
  modo_evaluacion text,
  created_at      timestamptz not null default now(),
  unique (curso_id, grado, anio)
);

create table public.plan_anual_objetivos (
  id      uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.planes_anuales(id) on delete cascade,
  orden   int  not null default 0,
  texto   text not null default ''
);

create table public.plantillas_curso (
  id                      uuid primary key default gen_random_uuid(),
  curso_id                uuid not null references public.cursos(id) on delete cascade,
  grado                   text not null,
  ciclo_id                uuid not null references public.ciclos(id) on delete cascade,
  descripcion             text,
  situacion_significativa text,
  estado                  text not null default 'borrador' check (estado in ('borrador', 'revision', 'publicada')),
  created_at              timestamptz not null default now(),
  unique (curso_id, grado, ciclo_id)
);

create table public.plantilla_sesiones (
  id           uuid primary key default gen_random_uuid(),
  plantilla_id uuid not null references public.plantillas_curso(id) on delete cascade,
  semana       int  not null,
  titulo       text not null default '',
  descripcion  text,
  tipo         text not null default 'clase' check (tipo in ('clase', 'evaluacion', 'repaso', 'feriado')),
  objetivo_id  uuid references public.plan_anual_objetivos(id) on delete set null
);
create index plantilla_sesiones_idx on public.plantilla_sesiones (plantilla_id, semana);

-- ─── Rol de BAPES (turnos por salón) ────────────────────────────────────────

create table public.rol_bapes_fechas (
  ciclo_id     uuid not null references public.ciclos(id) on delete cascade,
  grado        text not null,
  grupo        text not null,
  fecha_inicio date,
  updated_at   timestamptz not null default now(),
  primary key (ciclo_id, grado, grupo)
);

create table public.rol_bapes_orden (
  ciclo_id   uuid not null references public.ciclos(id) on delete cascade,
  grado      text not null,
  grupo      text not null,
  orden      int  not null default 0,
  updated_at timestamptz not null default now(),
  primary key (ciclo_id, grado, grupo)
);

create table public.rol_bapes_overrides (
  ciclo_id   uuid not null references public.ciclos(id) on delete cascade,
  alumno_id  uuid not null references public.alumnos(id) on delete cascade,
  fecha      date,
  updated_at timestamptz not null default now(),
  primary key (ciclo_id, alumno_id)
);

-- ─── Landing pública y fondos de QR ─────────────────────────────────────────

create table public.landing_config (
  id             int primary key default 1 check (id = 1),
  mision         text,
  vision         text,
  valores        text,
  direccion      text,
  telefono       text,
  email_contacto text,
  facebook_url   text,
  instagram_url  text,
  fondo_url      text
);

create table public.landing_galeria (
  id          uuid primary key default gen_random_uuid(),
  url         text not null,
  descripcion text,
  orden       int not null default 0,
  created_at  timestamptz not null default now()
);

create table public.qr_fondos (
  id         uuid primary key default gen_random_uuid(),
  tipo       text not null check (tipo in ('general', 'grado', 'seccion')),
  grado      text,
  grupo      text,
  fondo_url  text not null,
  created_at timestamptz not null default now()
);

-- Filas únicas de configuración
insert into public.asistencia_alumnos_config (id) values (1);
insert into public.geo_asistencia_config (id) values (1);
insert into public.landing_config (id) values (1);
