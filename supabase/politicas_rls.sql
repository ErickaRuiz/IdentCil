-- ===========================================================================
-- Políticas de acceso (RLS) para la base de datos de IdentCil
-- ===========================================================================
--
-- PROBLEMA
--   Todas las tablas se pueden leer sin iniciar sesión, incluida `clientes`
--   (nombre o razón social, DNI/RUC, teléfono, correo, dirección). La clave
--   que usa la app va dentro de ella y es pública por diseño: en Supabase lo
--   que protege los datos son estas políticas, no el secreto de la clave.
--
-- QUÉ HACE ESTE SCRIPT
--   1. Activa RLS en las seis tablas que usa la app.
--   2. Borra las políticas que ya tuvieran esas tablas y crea unas nuevas:
--        - usuarios con sesión iniciada: pueden leer y escribir (como hoy);
--        - sin sesión: sólo pueden LEER `cilindros`, que no tiene datos
--          personales, para que el servicio de IA siga sincronizando el
--          inventario con la clave pública.
--   Se puede ejecutar varias veces: siempre deja el mismo resultado.
--
-- CÓMO APLICARLO
--   Supabase > SQL Editor > pegar este archivo > Run.
--   Antes, conviene revisar qué políticas hay (consulta del paso 0) por si
--   alguna se creó a propósito y hay que conservarla.
--
-- DESPUÉS DE APLICARLO
--   * La app exige iniciar sesión (ya lo hace: ver src/app/guards/sesion.guard.ts).
--   * Cualquiera puede crearse una cuenta desde la pantalla de registro y, con
--     ella, acceder a todo. Para cerrar esa puerta, en Authentication >
--     Sign In / Providers: exigir confirmación del correo y, cuando el equipo
--     tenga sus cuentas, desactivar "Allow new users to sign up".
--   * Para dar de alta cilindros con training/seed_supabase.py hará falta una
--     sesión o una clave con permisos de escritura: la clave pública ya no
--     podrá insertar.
--   * Si no se quiere que el inventario sea público, borre la última política
--     y configure el servicio de IA con otra clave. Sin ella el servicio sigue
--     funcionando con su catálogo estático, pero no verá los cilindros nuevos.
-- ===========================================================================


-- Paso 0 (opcional): ver las políticas actuales antes de cambiarlas.
-- select tablename, policyname, roles, cmd, qual
--   from pg_policies
--  where schemaname = 'public'
--    and tablename in ('clientes', 'cilindros', 'ingreso_cilindros',
--                      'salida_cilindros', 'recojos', 'almacenes');


begin;

-- Paso 1: activar RLS y quitar las políticas anteriores.
do $$
declare
  tabla text;
  politica record;
begin
  foreach tabla in array array['clientes', 'cilindros', 'ingreso_cilindros',
                               'salida_cilindros', 'recojos', 'almacenes']
  loop
    execute format('alter table public.%I enable row level security', tabla);

    for politica in
      select policyname from pg_policies
       where schemaname = 'public' and tablename = tabla
    loop
      execute format('drop policy %I on public.%I', politica.policyname, tabla);
    end loop;
  end loop;
end
$$;

-- Paso 2: usuarios con sesión iniciada. Mismo acceso que hoy tiene la app.
create policy "usuarios con sesion: acceso completo" on public.clientes
  for all to authenticated using (true) with check (true);

create policy "usuarios con sesion: acceso completo" on public.cilindros
  for all to authenticated using (true) with check (true);

create policy "usuarios con sesion: acceso completo" on public.ingreso_cilindros
  for all to authenticated using (true) with check (true);

create policy "usuarios con sesion: acceso completo" on public.salida_cilindros
  for all to authenticated using (true) with check (true);

create policy "usuarios con sesion: acceso completo" on public.recojos
  for all to authenticated using (true) with check (true);

create policy "usuarios con sesion: acceso completo" on public.almacenes
  for all to authenticated using (true) with check (true);

-- Paso 3: sin sesión, sólo lectura del inventario de cilindros (servicio de IA).
create policy "servicio de IA: lectura del inventario" on public.cilindros
  for select to anon using (true);

commit;


-- Comprobación: sin sesión, `clientes` debe devolver 0 filas y `cilindros`, todas.
--   curl "$SUPABASE_URL/rest/v1/clientes?select=id" -H "apikey: $ANON_KEY"
--   curl "$SUPABASE_URL/rest/v1/cilindros?select=id" -H "apikey: $ANON_KEY"
