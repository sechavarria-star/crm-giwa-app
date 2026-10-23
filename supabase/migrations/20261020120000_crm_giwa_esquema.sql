-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · el esquema · Fase 0 de la migración Sheet → Supabase
-- ──────────────────────────────────────────────────────────────────────
-- Una tabla por hoja de «GIWA - CRM VF» y «GIWA - CRM - Tablas Referencia».
-- Proyecto Supabase: Giwa_Database (ofhiogczijhzkuqdjwvz).
--
-- Decisiones:
-- · Los IDs se conservan tal cual (EMP-001, P-0024, D-0004…): son texto y son
--   la clave primaria. Así no se rompe ningún link, ninguna referencia entre
--   hojas ni el código de Apps Script mientras convivan. Los nuevos salen de
--   una secuencia por tabla con el mismo formato (crm_giwa.nuevo_id).
-- · Columnas en snake_case y sin el prefijo de la hoja: Empresa_Nombre →
--   empresas.nombre. El mapeo encabezado ↔ columna está en
--   crm_giwa.mapa_hojas (al final): lo usan la migración y el adaptador de
--   _Sheet.js de la fase 1. Es la única fuente de ese mapeo.
-- · Sí/No → boolean. Plata → numeric(16,2). Fechas → date; las de creación →
--   timestamptz. Listas separadas por coma → text[]. JSON → jsonb.
-- · Las personas son mails y apuntan a crm_giwa.usuarios(mail).
-- · Los estados, tiers, dificultades y modelos de pago apuntan a su tabla de
--   referencia: un valor que no está en la tabla no entra (antes entraba y la
--   app lo ignoraba en silencio: «Finalizada» vs «Finalizado»).
-- · RLS prendido en todo. Ve y edita quien esté logueado con Supabase Auth y
--   figure en crm_giwa.usuarios como activo. El service_role (Apps Script
--   en la fase 1, Edge Functions) pasa por encima de RLS.
-- ══════════════════════════════════════════════════════════════════════

create schema if not exists crm_giwa;

-- ── utilidades ──────────────────────────────────────────────────
create or replace function crm_giwa.tocar_actualizado() returns trigger
language plpgsql as $$ begin new.actualizado := now(); return new; end $$;

-- nuevo_id('P', 'proyectos_seq', 4) → 'P-0037'
-- (lpad de Postgres CORTA si el número es más largo que el ancho: por eso el greatest)
create or replace function crm_giwa.nuevo_id(prefijo text, secuencia text, ancho int)
returns text language plpgsql volatile as $$
declare n text := nextval('crm_giwa.' || secuencia)::text;
begin
  return prefijo || '-' || lpad(n, greatest(ancho, length(n)), '0');
end $$;

-- ══════════════════════════════════════════════════════════════════════
-- TABLAS DE REFERENCIA
-- ══════════════════════════════════════════════════════════════════════

create table crm_giwa.usuarios (
  id            text primary key,                 -- D1, S2, V3
  nombre        text not null,
  es_giwa       boolean not null default true,
  mail          text not null unique check (mail = lower(mail)),
  rol           text,                             -- Comercial, Administracion
  factura       boolean not null default false,
  telegram      text,
  calendario    text,
  activo        boolean not null default true,    -- nuevo: dar de baja sin borrar
  auth_user_id  uuid unique references auth.users(id) on delete set null
);

create table crm_giwa.tier (
  id             text primary key,                -- 'Tier 1'…'Tier 5'
  multiplicador  numeric(6,3) not null,
  empresa        text                             -- Corporativa, PyME…
);

create table crm_giwa.dificultad (
  id             text primary key,                -- Baja, Media, Alta, Muy Alta
  multiplicador  numeric(6,3) not null
);

create table crm_giwa.tipos_desarrollo (
  id           text primary key,                  -- IA, AUT, BOT, SS, APP
  nombre       text not null,
  descripcion  text
);

create table crm_giwa.catalogo_modulos (
  id                  text primary key,           -- IA-001
  tipo_desarrollo_id  text not null references crm_giwa.tipos_desarrollo(id),
  etapa               text,
  orden               int,
  nombre              text not null,
  bloque_comercial    text,
  entregable          text,
  pregunta            text,
  sugerido            boolean,
  horas_base          numeric(8,2),
  es_relevamiento     boolean,
  es_replicable       boolean,
  es_por_instancia    boolean,
  padre               text references crm_giwa.catalogo_modulos(id),
  factor              numeric(8,3),
  efecto              text,                       -- Horas, Licencia
  alcance             text                        -- Básico…
);

create table crm_giwa.proyecto_estados (
  id            text primary key,                 -- Prospecto, Aprobado, Activo…
  asignacion    text,                             -- Manual / Automático
  ganado        boolean not null,
  facturable    boolean not null,
  probabilidad  boolean not null,
  editable      boolean not null,
  regla         text,
  prioridad     int not null,
  condicion     text
);

create table crm_giwa.desarrollo_estados (
  id               text primary key,              -- Nuevo, Aprobado, En Curso…
  ganado           boolean not null,
  facturable       boolean not null,
  ejecutandose     boolean not null,
  estado_proyecto  text references crm_giwa.proyecto_estados(id),
  detenido         boolean not null,              -- ¿admite Detenido?
  rechazar         boolean not null,
  recotizar        boolean not null,
  renovar          boolean not null,
  ajuste_ipc       boolean not null
);

create table crm_giwa.estados_reglas (
  accion  text primary key,
  efecto  text
);

create table crm_giwa.modelos_pago (
  id             text primary key,                -- FP-01
  nombre         text not null,
  tipo           text not null,                   -- fijo / recurrente
  cuotas         int,
  momentos       text[],                          -- {Inicio,entrega}
  personalizado  boolean not null default false,
  porcentajes    numeric(6,2)[]                   -- {50,50}
);

create table crm_giwa.contrataciones (
  id         text primary key,                    -- CONT-001 (ojo: mismo prefijo que Contactos en el Sheet)
  categoria  text,
  producto   text not null,
  nivel      text,
  unidad     text,
  moneda     text check (moneda in ('ARS','USD')),
  costo_usd  numeric(16,2),
  costo_ars  numeric(16,2)
);

create table crm_giwa.alternativas (
  id               text primary key,              -- ALT-001
  contratacion_id  text references crm_giwa.contrataciones(id),
  producto         text,
  categoria        text,
  tarjeta          boolean,
  backend          boolean,
  db               boolean,
  complejidad      text,
  riesgo           text,
  escalado         text,
  ideal            text,
  recomendada      boolean
);

create table crm_giwa.impuestos (
  categoria                text primary key,      -- A…K
  ingresos_brutos          numeric(16,2),
  precio_unitario_max      numeric(16,2),
  servicios                numeric(16,2),
  aporte_sipa              numeric(16,2),
  aporte_obra_social       numeric(16,2),
  total_servicios          numeric(16,2),
  monotributo_unificado    text,                  -- hoy guarda un mail: revisar
  siper                    text,
  recategoriza             text                   -- '01/07'
);

create table crm_giwa.indices_ipc (
  mes          date primary key,                  -- 1º del mes (2025-01 → 2025-01-01)
  ipc          numeric(8,3),                      -- % mensual
  tc           numeric(12,4),
  fuente       text,
  actualizado  date
);

-- CotConfig: puebla los desplegables. La clave es el nombre de columna.
create table crm_giwa.cot_config (
  clave       text primary key,
  valor       text,                               -- se guarda como está ('ARS,USD')
  aclaracion  text,
  hoja        text
);

create table crm_giwa.comercial_analisis (
  id         text primary key,                    -- RA-01
  ambito     text,
  nombre     text not null,
  umbral     numeric(12,2),
  unidad     text,
  severidad  text,
  mensaje    text,
  activa     boolean not null default true
);

-- ══════════════════════════════════════════════════════════════════════
-- DATOS
-- ══════════════════════════════════════════════════════════════════════

create sequence crm_giwa.empresas_seq;
create table crm_giwa.empresas (
  id              text primary key default crm_giwa.nuevo_id('EMP','empresas_seq',3),
  nombre          text not null,
  alias           text,
  tier_id         text references crm_giwa.tier(id),
  logo            text,
  web             text,
  rubro           text,
  direccion_fiscal text,
  localidad       text,
  provincia       text,
  pais            text,
  tipo            text,                           -- Cliente…
  drive_interno   text,
  drive_externo   text,
  creado          timestamptz not null default now(),
  actualizado     timestamptz not null default now()
);

create sequence crm_giwa.razones_sociales_seq;
create table crm_giwa.razones_sociales (
  id                text primary key default crm_giwa.nuevo_id('RZ','razones_sociales_seq',3),
  empresa_id        text not null references crm_giwa.empresas(id),
  nombre            text not null,
  cuit              text,
  condicion_fiscal  text,
  direccion         text,
  mail_facturacion  text,
  por_defecto       boolean not null default false,
  nota              text,
  creado            timestamptz not null default now(),
  actualizado       timestamptz not null default now()
);
-- una sola razón social por defecto por empresa
create unique index razones_sociales_una_defecto on crm_giwa.razones_sociales(empresa_id) where por_defecto;

create sequence crm_giwa.contactos_seq;
create table crm_giwa.contactos (
  id             text primary key default crm_giwa.nuevo_id('CONT','contactos_seq',3),
  nombre         text not null,
  apellido       text,
  empresa_id     text references crm_giwa.empresas(id),
  email          text,
  telefono       text,
  nacimiento     date,
  area_trabajo   text,
  puesto         text,
  creado         timestamptz not null default now(),
  actualizado    timestamptz not null default now()
);

create sequence crm_giwa.proyectos_seq;
create table crm_giwa.proyectos (
  id                        text primary key default crm_giwa.nuevo_id('P','proyectos_seq',4),
  empresa_id                text not null references crm_giwa.empresas(id),
  nombre                    text not null,
  tipo                      text,
  resumen_ejecutivo         text,
  sponsor_id                text references crm_giwa.contactos(id),
  contactos                 text,               -- se guarda como está: ver nota en el README
  owner                     text references crm_giwa.usuarios(mail),
  fecha_propuesta           date,
  probabilidad              numeric(5,2) check (probabilidad between 0 and 100),
  carpeta                   text,
  fecha_propuesta_enviada   date,
  estado_id                 text not null references crm_giwa.proyecto_estados(id),
  detenido                  boolean not null default false,
  referencial               text,
  fecha_aprobacion          date,
  fecha_inicio              date,
  fecha_finalizado          date,
  minuta                    text,
  creado                    timestamptz not null default now(),
  actualizado               timestamptz not null default now()
);

create sequence crm_giwa.desarrollos_seq;
create table crm_giwa.desarrollos (
  id                    text primary key default crm_giwa.nuevo_id('D','desarrollos_seq',4),
  proyecto_id           text not null references crm_giwa.proyectos(id),
  mant_de               text[] not null default '{}',   -- IDs de desarrollos que mantiene
  bloque_de             int,
  tipo_id               text references crm_giwa.tipos_desarrollo(id),
  titulo                text not null,
  descripcion           text,
  dificultad_id         text references crm_giwa.dificultad(id),
  estado_id             text not null references crm_giwa.desarrollo_estados(id),
  bonificado            boolean not null default false,
  detenido              boolean not null default false,
  fecha_aprobado        date,
  fecha_inicio          date,
  fecha_fin             date,
  duracion_horas        numeric(10,2),
  meses_contrato        int,
  desarrollador         text,
  modelo_pago_id        text references crm_giwa.modelos_pago(id),
  q_cuotas              numeric(6,2),
  cuota                 numeric(16,2),
  valor_cuota_actual    numeric(16,2),
  fecha_ajuste_cuota    date,
  ipc                   numeric(8,3),
  moneda                text check (moneda in ('ARS','USD')),   -- Desarrollo_SolucionMoneda
  total_ars             numeric(16,2),                          -- Desarrollo_TotalARG
  total_usd             numeric(16,2),
  tipo_cambio           numeric(12,4),
  margen                numeric(8,3),
  ajuste                text,                                   -- Sin Ajuste / IPC…
  garantia_dias         int,
  mantenimiento_horas   numeric(10,2),
  soporte_hora_ars      numeric(16,2),
  soporte_hora_usd      numeric(16,2),
  creador               text references crm_giwa.usuarios(mail),
  tier_id               text references crm_giwa.tier(id),
  valor_hora            numeric(16,2),
  minuta                text,
  creado                timestamptz not null default now(),
  actualizado           timestamptz not null default now()
);
create index on crm_giwa.desarrollos(proyecto_id);

create sequence crm_giwa.proyecto_horas_seq;
create table crm_giwa.proyecto_horas (
  id                text primary key default crm_giwa.nuevo_id('PH','proyecto_horas_seq',4),
  proyecto_id       text not null references crm_giwa.proyectos(id),
  desarrollo_id     text references crm_giwa.desarrollos(id),
  modulo_id         text references crm_giwa.catalogo_modulos(id),
  etapa             text,
  modulo_nombre     text,
  bloque_comercial  text,
  horas_est         numeric(10,2),
  moneda            text,
  estado            text,
  responsable       text references crm_giwa.usuarios(mail),
  fecha_inicio      date,
  fecha_fin         date,
  horas_reales      numeric(10,2),
  link              text,
  nota              text,
  creado            timestamptz not null default now(),
  actualizado       timestamptz not null default now()
);
create index on crm_giwa.proyecto_horas(desarrollo_id);

create sequence crm_giwa.proyecto_costos_seq;
create table crm_giwa.proyecto_costos (
  id               text primary key default crm_giwa.nuevo_id('PC','proyecto_costos_seq',4),
  proyecto_id      text not null references crm_giwa.proyectos(id),
  desarrollo_id    text references crm_giwa.desarrollos(id),
  tipo             text,
  descripcion      text,
  proveedor        text,
  recurrencia      text,
  externo          boolean,
  unidad           text,
  cantidad         numeric(12,3),
  usd              numeric(16,2),
  ars              numeric(16,2),
  total_usd        numeric(16,2),
  total_ars        numeric(16,2),
  tipo_cambio      numeric(12,4),
  creador          text references crm_giwa.usuarios(mail),
  fecha_agregado   date,
  incluido         boolean,
  contratacion_id  text references crm_giwa.contrataciones(id),
  creado           timestamptz not null default now(),
  actualizado      timestamptz not null default now()
);

create sequence crm_giwa.cobros_seq;
create table crm_giwa.cobros (
  id                  text primary key default crm_giwa.nuevo_id('C','cobros_seq',4),
  proyecto_id         text references crm_giwa.proyectos(id),
  desarrollo_id       text references crm_giwa.desarrollos(id),
  forma_pago          text,
  cuit_destino        text,
  razon_social_fc     text,
  concepto_fc         text,
  cuota_nro           int,
  tipo_comprobante    text,                       -- Factura C, Nota de Crédito C…
  comprobante_nro     text,
  comprobante_fecha   date,
  factura_owner       text references crm_giwa.usuarios(mail),
  moneda_factura      text check (moneda_factura in ('ARS','USD')),
  monto_ars           numeric(16,2),              -- negativo en notas de crédito
  total_usd           numeric(16,2),
  ajuste_acumulado    numeric(16,2),
  cobrado_ars         numeric(16,2),
  deposito_fecha      date,
  transf_fecha        date,
  link_fc             text,
  ref_id              text references crm_giwa.cobros(id),   -- NC que cancela una factura
  creado              timestamptz not null default now(),
  actualizado         timestamptz not null default now()
);
create index on crm_giwa.cobros(desarrollo_id);
create index on crm_giwa.cobros(proyecto_id);

create sequence crm_giwa.gastos_seq;
create table crm_giwa.gastos_internos (
  id               text primary key default crm_giwa.nuevo_id('G','gastos_seq',4),
  fecha            date,
  categoria        text,
  tipo             text,                          -- Fijo / Variable
  mes              date,                          -- 1º del mes ('11/2025' → 2025-11-01)
  descripcion      text,
  moneda           text check (moneda in ('ARS','USD')),
  monto_ars        numeric(16,2),
  monto_usd        numeric(16,2),
  recurrencia      text,
  prorratear       boolean not null default false,
  pagador          text references crm_giwa.usuarios(mail),
  creador          text references crm_giwa.usuarios(mail),
  contratacion_id  text references crm_giwa.contrataciones(id),
  creado           timestamptz not null default now(),
  actualizado      timestamptz not null default now()
);

create sequence crm_giwa.entregables_seq;
create table crm_giwa.entregables (
  id             text primary key default crm_giwa.nuevo_id('E','entregables_seq',4),
  proyecto_id    text references crm_giwa.proyectos(id),
  desarrollo_id  text references crm_giwa.desarrollos(id),
  titulo         text not null,
  descripcion    text,
  tipo           text,
  estado         text,
  ambiente       text,
  accesos        jsonb not null default '[]',     -- [{tipo,nombre,url}]
  creado         timestamptz not null default now(),
  actualizado    timestamptz not null default now()
);

-- Tareas, alertas y reuniones: una fila cada una (tipo las distingue)
create sequence crm_giwa.tareas_seq;
create table crm_giwa.tareas (
  id             text primary key default crm_giwa.nuevo_id('T','tareas_seq',4),
  proyecto_id    text references crm_giwa.proyectos(id),
  desarrollo_id  text references crm_giwa.desarrollos(id),
  cliente        text,
  tipo           text not null default 'Tarea',  -- Tarea / Alerta / Reunión
  titulo         text not null,
  descripcion    text,
  responsable    text references crm_giwa.usuarios(mail),
  prioridad      text,
  estado         text,
  fecha_creacion date,                            -- Tarea_Creacion (fecha de negocio)
  duracion       numeric(8,2),
  fin            date,
  vencimiento    date,
  frecuencia     text,
  canal_envio    text,
  enviada        boolean,
  recordatorio   text,
  origen         text,
  contactos      text,                            -- se guarda como está
  creador        text references crm_giwa.usuarios(mail),
  alerta_tipo    text,
  creado         timestamptz not null default now(),
  actualizado    timestamptz not null default now()
);
create index on crm_giwa.tareas(responsable, estado);

create sequence crm_giwa.comentarios_seq;
create table crm_giwa.comentarios (
  id             text primary key default crm_giwa.nuevo_id('N','comentarios_seq',4),
  tarea_id       text references crm_giwa.tareas(id),
  proyecto_id    text references crm_giwa.proyectos(id),
  desarrollo_id  text references crm_giwa.desarrollos(id),
  empresa_id     text references crm_giwa.empresas(id),
  contacto_id    text references crm_giwa.contactos(id),
  texto          text not null,
  fecha          date,
  estado         text,
  creador        text references crm_giwa.usuarios(mail),
  creado         timestamptz not null default now(),
  actualizado    timestamptz not null default now()
);

-- Histórico comercial (casos vendidos, para comparar precio)
create table crm_giwa.proyectos_historial (
  proyecto_id   text primary key,                 -- incluye IDs que no existen en Proyectos (P-PROD-1)
  empresa       text,
  caso          text,
  tipo          text,
  tier          int,
  resultado     text,
  vendido_ars   numeric(16,2),
  abono_mes     numeric(16,2),
  catalogo_ars  numeric(16,2),
  brecha_pct    numeric(8,3),
  nota          text
);

-- ── updated_at en todas las tablas de datos ─────────────────────
do $$
declare t text;
begin
  foreach t in array array['empresas','razones_sociales','contactos','proyectos','desarrollos',
    'proyecto_horas','proyecto_costos','cobros','gastos_internos','entregables','tareas','comentarios']
  loop
    execute format('create trigger tocar before update on crm_giwa.%I
                    for each row execute function crm_giwa.tocar_actualizado()', t);
  end loop;
end $$;

-- ══════════════════════════════════════════════════════════════════════
-- MAPA hoja ↔ tabla · la única fuente del mapeo de encabezados
-- ══════════════════════════════════════════════════════════════════════
create table crm_giwa.mapa_hojas (
  hoja        text not null,                      -- 'Empresas'
  encabezado  text not null,                      -- 'Empresa_Nombre'
  tabla       text not null,                      -- 'empresas'
  columna     text not null,                      -- 'nombre'
  primary key (hoja, encabezado)
);
-- Lo carga 20261020120100_crm_giwa_mapa.sql (se genera desde este esquema).

-- ══════════════════════════════════════════════════════════════════════
-- SEGURIDAD
-- ══════════════════════════════════════════════════════════════════════

-- ¿El que llama es del equipo? Por mail del JWT de Supabase Auth.
create or replace function crm_giwa.es_equipo() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from crm_giwa.usuarios u
    where u.activo and u.es_giwa
      and u.mail = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
$$;

grant usage on schema crm_giwa to authenticated, service_role;
grant all on all tables in schema crm_giwa to service_role;
grant all on all sequences in schema crm_giwa to service_role;
grant select, insert, update, delete on all tables in schema crm_giwa to authenticated;
grant usage on all sequences in schema crm_giwa to authenticated;
grant execute on all functions in schema crm_giwa to authenticated;

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'crm_giwa' loop
    execute format('alter table crm_giwa.%I enable row level security', t);
    execute format('create policy equipo on crm_giwa.%I for all to authenticated
                    using (crm_giwa.es_equipo()) with check (crm_giwa.es_equipo())', t);
  end loop;
end $$;
-- anon no tiene grants: sin login no se ve nada.
