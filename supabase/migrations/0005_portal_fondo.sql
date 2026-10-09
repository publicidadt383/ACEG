-- Fondo de los portales internos (admin / docente / alumno) tras iniciar sesión.
-- El archivo se guarda en el bucket público 'landing'; aquí solo su URL.
-- Lectura pública y escritura de staff ya cubiertas por las políticas de landing_config.
alter table public.landing_config add column if not exists portal_fondo_url text;
