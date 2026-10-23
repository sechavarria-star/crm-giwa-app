-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · apoyo para la migración de datos (MigracionSupabase.js)
-- ──────────────────────────────────────────────────────────────────────
-- Sólo las llama el service_role (Apps Script con la service key).
-- ══════════════════════════════════════════════════════════════════════

-- El mapa con el tipo de cada columna: la migración convierte según esto.
create or replace view crm_giwa.v_mapa_tipos as
select m.hoja, m.encabezado, m.tabla, m.columna,
       c.data_type, c.udt_name, (c.is_nullable = 'NO') as obligatoria,
       (c.column_default is not null) as tiene_default
from crm_giwa.mapa_hojas m
join information_schema.columns c
  on c.table_schema = 'crm_giwa' and c.table_name = m.tabla and c.column_name = m.columna;

-- Lo que pasó en cada corrida: filas que no entraron, advertencias, controles.
create table if not exists crm_giwa.migracion_log (
  id        bigint generated always as identity primary key,
  corrida   text not null,
  creado    timestamptz not null default now(),
  tabla     text,
  nivel     text not null check (nivel in ('info','aviso','error','control')),
  fila_id   text,
  mensaje   text,
  dato      jsonb
);
alter table crm_giwa.migracion_log enable row level security;
-- (sin policy para authenticated: sólo la ve el service_role)

-- Vacía todas las tablas de datos y de referencia (no el mapa ni el log).
-- La migración es «planilla → base» completa: se corre entera cada vez.
create or replace function crm_giwa.vaciar_para_migrar() returns void
language plpgsql security definer set search_path = '' as $$
begin
  truncate crm_giwa.comentarios, crm_giwa.tareas, crm_giwa.entregables, crm_giwa.gastos_internos,
           crm_giwa.cobros, crm_giwa.proyecto_costos, crm_giwa.proyecto_horas, crm_giwa.desarrollos,
           crm_giwa.proyectos, crm_giwa.contactos, crm_giwa.razones_sociales, crm_giwa.empresas,
           crm_giwa.proyectos_historial,
           crm_giwa.alternativas, crm_giwa.contrataciones, crm_giwa.catalogo_modulos,
           crm_giwa.tipos_desarrollo, crm_giwa.desarrollo_estados, crm_giwa.proyecto_estados,
           crm_giwa.estados_reglas, crm_giwa.modelos_pago, crm_giwa.impuestos, crm_giwa.indices_ipc,
           crm_giwa.cot_config, crm_giwa.comercial_analisis, crm_giwa.dificultad, crm_giwa.tier,
           crm_giwa.usuarios;
end $$;

-- Deja cada secuencia en el número más alto que vino de la planilla,
-- para que el próximo ID nuevo no choque con uno migrado.
create or replace function crm_giwa.ajustar_secuencias() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r record; mx bigint; out jsonb := '{}';
begin
  for r in select * from (values
    ('empresas','empresas_seq','EMP'), ('razones_sociales','razones_sociales_seq','RZ'),
    ('contactos','contactos_seq','CONT'), ('proyectos','proyectos_seq','P'),
    ('desarrollos','desarrollos_seq','D'), ('proyecto_horas','proyecto_horas_seq','PH'),
    ('proyecto_costos','proyecto_costos_seq','PC'), ('cobros','cobros_seq','C'),
    ('gastos_internos','gastos_seq','G'), ('entregables','entregables_seq','E'),
    ('tareas','tareas_seq','T'), ('comentarios','comentarios_seq','N')
  ) as v(tabla, seq, pref) loop
    execute format('select coalesce(max(substring(id from %L)::bigint), 0) from crm_giwa.%I',
                   '^' || r.pref || '-(\d+)$', r.tabla) into mx;
    if mx > 0 then perform setval('crm_giwa.' || r.seq, mx, true);
    else perform setval('crm_giwa.' || r.seq, 1, false); end if;
    out := out || jsonb_build_object(r.tabla, mx);
  end loop;
  return out;
end $$;

-- Conteo y sumas de control del lado de la base, para comparar con la planilla.
create or replace function crm_giwa.control_migracion() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'filas', (select jsonb_object_agg(t, n) from (
       select 'empresas' t, count(*) n from crm_giwa.empresas union all
       select 'razones_sociales', count(*) from crm_giwa.razones_sociales union all
       select 'contactos', count(*) from crm_giwa.contactos union all
       select 'proyectos', count(*) from crm_giwa.proyectos union all
       select 'desarrollos', count(*) from crm_giwa.desarrollos union all
       select 'proyecto_horas', count(*) from crm_giwa.proyecto_horas union all
       select 'proyecto_costos', count(*) from crm_giwa.proyecto_costos union all
       select 'cobros', count(*) from crm_giwa.cobros union all
       select 'gastos_internos', count(*) from crm_giwa.gastos_internos union all
       select 'entregables', count(*) from crm_giwa.entregables union all
       select 'tareas', count(*) from crm_giwa.tareas union all
       select 'comentarios', count(*) from crm_giwa.comentarios) x),
    'cobros_monto_ars',     (select coalesce(sum(monto_ars),0)   from crm_giwa.cobros),
    'cobros_cobrado_ars',   (select coalesce(sum(cobrado_ars),0) from crm_giwa.cobros),
    'desarrollos_total_ars',(select coalesce(sum(total_ars),0)   from crm_giwa.desarrollos),
    'desarrollos_total_usd',(select coalesce(sum(total_usd),0)   from crm_giwa.desarrollos),
    'gastos_monto_ars',     (select coalesce(sum(monto_ars),0)   from crm_giwa.gastos_internos)
  )
$$;

revoke all on function crm_giwa.vaciar_para_migrar()  from public, anon, authenticated;
revoke all on function crm_giwa.ajustar_secuencias()  from public, anon, authenticated;
revoke all on function crm_giwa.control_migracion()   from public, anon, authenticated;
grant execute on function crm_giwa.vaciar_para_migrar(), crm_giwa.ajustar_secuencias(),
                          crm_giwa.control_migracion() to service_role;
revoke all on crm_giwa.v_mapa_tipos from anon, authenticated;
grant select on crm_giwa.v_mapa_tipos to service_role;
grant all on crm_giwa.migracion_log to service_role;
