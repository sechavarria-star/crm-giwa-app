-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · Soporte, etapa 1: la base · 06/11/2026
-- ──────────────────────────────────────────────────────────────────────
-- Pasa a Supabase el portal de soporte (soporte-gs, Apps Script + planilla
-- «Soporte GIWA»). Mismas reglas que la última versión de soporte-gs.
--
-- Tablas (prefijo soporte_)
--   soporte_empresas   empresas habilitadas en el portal (= empresas_portal)
--   soporte_accesos    qué contactos entran al portal: sólo los habilitados a mano
--   soporte_tickets    el ticket (= solicitudes)       TKT-0001
--   soporte_notas      cada respuesta, con horas y fecha de trabajo (= notas)   N-00001
--   soporte_adjuntos   archivos en Storage (bucket privado «soporte»)
--   soporte_reportes   reportes al cliente + soporte_reporte_tickets            REP-0001
--   soporte_facturado  «Marcar facturado» por empresa, desarrollo y período     FAC-0001
-- Listas en cot_config (Soporte_*), como el resto del CRM.
--
-- Lo que no se guarda, se calcula:
--   v_soporte_desarrollos  desarrollos con lo que importa a soporte (mantenimiento, vigente, cupo, horas)
--   v_soporte_clasif       clasificación del ticket (_clasifTicket_) y contra qué cuenta
--   v_soporte_reparto      horas de cada nota repartidas contra el cupo del mes (_reparto_)
--   v_soporte_saldos       saldo de cada mantenimiento por mes (_saldo_)
--   v_soporte_tickets      el ticket con clasificación, horas, tarifa y costo (vista de GIWA)
--
-- Dos perfiles:
--   GIWA (es_equipo)  todo, directo en tablas y vistas (RLS «equipo»).
--   Cliente           NINGUNA tabla: sólo las funciones portal_*, que leen su empresa
--                     de mi_empresa_portal() y nunca devuelven notas internas,
--                     clasificación forzada, montos ni tarifas.
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

-- ── tablas ──────────────────────────────────────────────────────────
create table if not exists crm_giwa.soporte_empresas (
  empresa_id    text primary key references crm_giwa.empresas (id),
  activo        boolean not null default true,
  mostrar_horas boolean not null default false,   -- el cliente ve horas y consumo del mantenimiento
  avisar_a      text,                             -- mails extra para los avisos
  creado        timestamptz not null default now()
);

create table if not exists crm_giwa.soporte_accesos (
  id             bigint generated always as identity primary key,
  mail           text not null unique,
  contacto_id    text references crm_giwa.contactos (id),
  empresa_id     text not null references crm_giwa.empresas (id),
  habilitado     boolean not null default true,
  invitado       timestamptz,
  ultimo_ingreso timestamptz,
  auth_user_id   uuid,
  creado         timestamptz not null default now(),
  creador        text,
  constraint soporte_accesos_mail_norm check (mail = lower(trim(mail)))
);

create table if not exists crm_giwa.soporte_tickets (
  id                    text primary key,
  creado                timestamptz not null default now(),
  actualizado           timestamptz not null default now(),
  empresa_id            text not null references crm_giwa.empresas (id),
  proyecto_id           text references crm_giwa.proyectos (id),
  desarrollo_id         text references crm_giwa.desarrollos (id),
  tipo                  text not null default 'Algo no funciona',
  sintoma               text,
  categoria             text,
  modulo                text,
  titulo                text not null,
  descripcion           text,
  prioridad             text not null default 'Media',
  estado                text not null default 'Nuevo',
  clasificacion_forzada text,                       -- puesta por GIWA, con motivo
  forzada_motivo        text,
  clasificacion_hist    text,                       -- la que traía AppSheet: el historial no se reclasifica
  solicitante           text,
  responsable           text,
  vence                 date,
  resuelto              timestamptz,
  respuesta_final       text,
  tarea_id              text references crm_giwa.tareas (id),   -- «A cotizar»
  canal                 text not null default 'Portal',
  origen                text not null default 'portal',         -- portal · crm · appsheet · planilla
  id_origen             text,
  relacionado_con       text references crm_giwa.soporte_tickets (id),
  tarifa_hora           numeric,                    -- se congela la primera vez que algo se factura
  constraint soporte_forzada_con_motivo check (clasificacion_forzada is null or length(trim(coalesce(forzada_motivo, ''))) >= 3)
);
create index if not exists soporte_tickets_empresa on crm_giwa.soporte_tickets (empresa_id);
create index if not exists soporte_tickets_desarrollo on crm_giwa.soporte_tickets (desarrollo_id);

create table if not exists crm_giwa.soporte_notas (
  id        text primary key,
  ticket_id text not null references crm_giwa.soporte_tickets (id) on delete cascade,
  fecha     timestamptz not null default now(),   -- fecha de trabajo: define el mes de las horas
  creado    timestamptz not null default now(),
  autor     text,
  texto     text,
  interna   boolean not null default false,
  horas     numeric,
  origen    text not null default 'portal',
  id_origen text,
  constraint soporte_notas_horas check (horas is null or horas >= 0)
);
create index if not exists soporte_notas_ticket on crm_giwa.soporte_notas (ticket_id);

create table if not exists crm_giwa.soporte_reportes (
  id            text primary key,
  creado        timestamptz not null default now(),
  actualizado   timestamptz not null default now(),
  empresa_id    text not null references crm_giwa.empresas (id),
  desarrollo_id text references crm_giwa.desarrollos (id),
  periodo       text,                               -- yyyy-MM
  tipo          text,
  titulo        text,
  resumen       text,
  hicimos       text,
  pendiente     text,
  revisamos     text,
  incluir_horas boolean not null default false,
  estado        text not null default 'Borrador',   -- Borrador · Publicado
  publicado     timestamptz,
  enviado_a     text,
  autor         text
);

create table if not exists crm_giwa.soporte_reporte_tickets (
  reporte_id text not null references crm_giwa.soporte_reportes (id) on delete cascade,
  ticket_id  text not null references crm_giwa.soporte_tickets (id) on delete cascade,
  primary key (reporte_id, ticket_id)
);

create table if not exists crm_giwa.soporte_adjuntos (
  id         bigint generated always as identity primary key,
  ticket_id  text references crm_giwa.soporte_tickets (id) on delete cascade,
  nota_id    text references crm_giwa.soporte_notas (id) on delete cascade,
  reporte_id text references crm_giwa.soporte_reportes (id) on delete cascade,
  nombre     text not null,
  ruta       text unique,                           -- storage: soporte/<empresa>/<ticket o reporte>/<archivo>
  drive_id   text,                                  -- los que vienen de Drive hasta pasarlos
  tipo       text,
  bytes      bigint,
  autor      text,
  creado     timestamptz not null default now(),
  constraint soporte_adjunto_de_algo check (ticket_id is not null or reporte_id is not null),
  constraint soporte_adjunto_donde check (ruta is not null or drive_id is not null)
);
create index if not exists soporte_adjuntos_ticket on crm_giwa.soporte_adjuntos (ticket_id);

create table if not exists crm_giwa.soporte_facturado (
  id            text primary key,
  empresa_id    text not null references crm_giwa.empresas (id),
  desarrollo_id text references crm_giwa.desarrollos (id),
  periodo       text not null,
  horas         numeric,
  sop_id        text references crm_giwa.desarrollos (id),   -- la línea de horas de soporte (SOP)
  fecha         timestamptz not null default now(),
  usuario       text,
  nota          text,
  unique (empresa_id, desarrollo_id, periodo)
);

-- ── RLS: sólo el equipo; el cliente entra por las funciones portal_* ──
do $$
declare t text;
begin
  foreach t in array array['soporte_empresas', 'soporte_accesos', 'soporte_tickets', 'soporte_notas', 'soporte_reportes',
                           'soporte_reporte_tickets', 'soporte_adjuntos', 'soporte_facturado'] loop
    execute format('alter table crm_giwa.%I enable row level security', t);
    execute format('drop policy if exists equipo on crm_giwa.%I', t);
    execute format('create policy equipo on crm_giwa.%I for all to authenticated using ((select crm_giwa.es_equipo())) with check ((select crm_giwa.es_equipo()))', t);
    execute format('grant select, insert, update, delete on crm_giwa.%I to authenticated', t);
    execute format('grant all on crm_giwa.%I to service_role', t);
  end loop;
end $$;

-- ── listas (cot_config), sólo si no están ──
insert into crm_giwa.cot_config (clave, valor, aclaracion) values
  ('Soporte_TipoCliente', 'Algo no funciona,Consulta,Quiero algo nuevo', 'Soporte: tipos que elige el cliente'),
  ('Soporte_TipoGiwa', 'Monitoreo,Reunión mensual,Análisis,Ajuste por error propio,Mejora dentro del alcance', 'Soporte: tipos que carga sólo GIWA'),
  ('Soporte_TipoCotizar', 'Quiero algo nuevo,Nuevo desarrollo,Mejora,Nueva solicitud', 'Soporte: tipos que van «A cotizar»'),
  ('Soporte_Sintoma', 'Error funcional,Error de datos,Reporte / listado,Acceso / permisos,Integración,Rendimiento,Consulta / asistencia,Mejora,Configuración', 'Soporte: síntomas'),
  ('Soporte_Estado', 'Nuevo,En proceso,Esperando cliente,Cerrado', 'Soporte: estados del ticket'),
  ('Soporte_Clasificacion', 'Sin clasificar,Garantía,Mantenimiento mensual,Facturable,A cotizar', 'Soporte: clasificaciones'),
  ('Soporte_Prioridad', 'Alta,Media,Baja', 'Soporte: prioridades'),
  ('Soporte_Categoria', 'Funcionamiento de la aplicación,Problemas de performance,Alta baja y modificación de datos,Problemas de cálculos,Problema de visibilidad,Problema de acceso,Problemas de sincronización,Campos necesarios,Errores de interpretación,Capacitación,Configuración,Otro', 'Soporte: categorías'),
  ('Soporte_TipoReporte', 'Mantenimiento mensual,Performance,Revisión,Documentación,Otro', 'Soporte: tipos de reporte'),
  ('Soporte_Canal', 'Portal,Mail,Reunión,WhatsApp,Teléfono', 'Soporte: canales'),
  ('Soporte_ResponsableCotizar', 'v.gagey@giwa-ia.com', 'Soporte: responsable de la tarea «Cotizar» que crea un pedido de algo nuevo')
on conflict (clave) do nothing;

create or replace function crm_giwa.soporte_lista(clave text) returns text[]
language sql stable as $$
  select coalesce(array_agg(trim(x) order by o) filter (where trim(x) <> ''), '{}')
  from crm_giwa.cot_config c, unnest(string_to_array(coalesce(c.valor, ''), ',')) with ordinality u(x, o)
  where c.clave = soporte_lista.clave
$$;

-- ── desarrollos, con lo que importa a soporte (Crm.gs · _crmLeer_) ──
create or replace view crm_giwa.v_soporte_desarrollos with (security_invoker = true) as
select d.id, d.proyecto_id, p.empresa_id, d.tipo_id, coalesce(t.nombre, d.tipo_id) as tipo_nombre,
       coalesce(nullif(d.titulo, ''), d.id) as titulo, d.estado_id, coalesce(d.mant_de, '{}') as mant_de,
       d.tipo_id = 'MM' as es_mantenimiento,                                         -- mantenimiento = tipo MM
       coalesce(e.ganado, false) as ganado,                                          -- lo ve el cliente
       coalesce(e.estado_proyecto, '') ~* '^(aprobado|activo)$' as vigente,
       coalesce(d.mantenimiento_horas, 0) as cupo_horas,
       case when d.moneda ~* 'usd' then 'USD' else 'ARS' end as moneda,
       coalesce(case when d.moneda ~* 'usd' then d.soporte_hora_usd else d.soporte_hora_ars end, 0) as hora_soporte,
       coalesce(d.valor_hora, 0) as valor_hora
  from crm_giwa.desarrollos d
  left join crm_giwa.proyectos p on p.id = d.proyecto_id
  left join crm_giwa.desarrollo_estados e on lower(e.id) = lower(d.estado_id)
  left join crm_giwa.tipos_desarrollo t on t.id = d.tipo_id;

-- El mantenimiento vigente que cubre un desarrollo: él mismo si es MM, o el MM que cuelga de él (_abonoDe_)
create or replace function crm_giwa.soporte_abono_de(did text) returns text
language sql stable as $$
  select case when s.es_mantenimiento then case when s.vigente then s.id end
              else (select m.id from crm_giwa.v_soporte_desarrollos m
                     where m.es_mantenimiento and m.vigente and s.id = any (m.mant_de) order by m.id limit 1) end
  from crm_giwa.v_soporte_desarrollos s where s.id = did
$$;

-- Valor de la hora fuera de mantenimiento (_tarifaHora_): la del desarrollo, la de su mantenimiento,
-- o la de la última SOP contratada sobre él. 0 = se carga a mano en el ticket.
create or replace function crm_giwa.soporte_tarifa_hora(did text) returns numeric
language sql stable as $$
  select coalesce(
    (select nullif(hora_soporte, 0) from crm_giwa.v_soporte_desarrollos where id = did),
    (select nullif(hora_soporte, 0) from crm_giwa.v_soporte_desarrollos where id = crm_giwa.soporte_abono_de(did)),
    (select nullif(hora_soporte, 0) from crm_giwa.v_soporte_desarrollos
      where tipo_id = 'SOP' and did = any (mant_de) and hora_soporte > 0 order by id desc limit 1),
    0)
$$;

-- La del ticket (_tarifaTicket_): lo que excede el mantenimiento va a su valor hora; si no, la hora de soporte
create or replace function crm_giwa.soporte_tarifa_ticket(did text) returns numeric
language sql stable as $$
  select coalesce((select nullif(valor_hora, 0) from crm_giwa.v_soporte_desarrollos where id = crm_giwa.soporte_abono_de(did)),
                  crm_giwa.soporte_tarifa_hora(did), 0)
$$;

-- ── clasificación del ticket (_clasifTicket_) ──
-- forzada → historial de AppSheet → A cotizar → Garantía → Mantenimiento → Sin clasificar → Facturable.
-- cuenta = el mantenimiento contra el que descuenta, o el desarrollo.
create or replace view crm_giwa.v_soporte_clasif with (security_invoker = true) as
with t as (
  select t.*, s.id as sol_id, s.titulo as sol_titulo, s.estado_id as sol_estado, s.es_mantenimiento as sol_mm, s.tipo_id as sol_tipo,
         s.vigente as sol_vigente,
         case when s.id is not null then crm_giwa.soporte_abono_de(s.id)
              else (select min(v.id) from crm_giwa.v_soporte_desarrollos v
                     where v.empresa_id = t.empresa_id and v.es_mantenimiento and v.vigente
                    having count(*) = 1) end as ab_id
    from crm_giwa.soporte_tickets t
    left join crm_giwa.v_soporte_desarrollos s on s.id = t.desarrollo_id
)
select t.id as ticket_id, t.empresa_id, coalesce(t.ab_id, t.sol_id) as cuenta_id, t.ab_id as mantenimiento_id,
       c.valor as clasificacion, c.motivo, t.clasificacion_forzada is not null as forzada
  from t
  left join crm_giwa.v_soporte_desarrollos ab on ab.id = t.ab_id
  cross join lateral (select
    case when t.clasificacion_forzada is not null then t.clasificacion_forzada
         when t.origen = 'appsheet' and t.clasificacion_hist is not null then t.clasificacion_hist
         when t.tipo = any (crm_giwa.soporte_lista('Soporte_TipoCotizar')) or t.tarea_id is not null then 'A cotizar'
         when t.sol_id is not null and not t.sol_mm and t.sol_tipo is distinct from 'SOP' and t.sol_vigente then 'Garantía'
         when t.ab_id is not null then 'Mantenimiento mensual'
         when t.sol_id is null then 'Sin clasificar'
         else 'Facturable' end as valor,
    case when t.clasificacion_forzada is not null then coalesce(t.forzada_motivo, 'Clasificación puesta por GIWA.')
         when t.origen = 'appsheet' and t.clasificacion_hist is not null then 'Histórico de AppSheet.'
         when t.tipo = any (crm_giwa.soporte_lista('Soporte_TipoCotizar')) or t.tarea_id is not null then 'Es algo nuevo: se cotiza aparte.'
         when t.sol_id is not null and not t.sol_mm and t.sol_tipo is distinct from 'SOP' and t.sol_vigente
           then t.sol_titulo || ' está en ' || coalesce(t.sol_estado, '') || ': no consume horas ni se factura.'
         when t.ab_id is not null then case when t.tipo = 'Ajuste por error propio' then 'Ajuste por error propio: no consume horas contratadas.'
           else 'Mantenimiento: descuenta de las ' || trim(to_char(ab.cupo_horas, 'FM999990.##')) || ' h contratadas por mes.' end
         when t.sol_id is null then 'Falta elegir el desarrollo.'
         else t.sol_titulo || ' no tiene mantenimiento vigente: se factura como soporte.' end as motivo) c;

-- ── reparto de las horas (_reparto_) ──
-- En orden de fecha de trabajo, cada mes descuenta del cupo del mantenimiento; lo que excede, Facturable.
-- Las horas no se acumulan de un mes a otro. «Ajuste por error propio» no consume (gar).
create or replace view crm_giwa.v_soporte_reparto with (security_invoker = true) as
with n as (
  select n.id as nota_id, n.ticket_id, t.empresa_id, n.fecha, n.horas as h,
         to_char(n.fecha at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM') as mes,
         c.clasificacion, c.cuenta_id, c.mantenimiento_id, t.tipo,
         coalesce(ab.cupo_horas, 0) as cupo,
         (t.tipo is distinct from 'Ajuste por error propio' and c.clasificacion = 'Mantenimiento mensual' and c.mantenimiento_id is not null) as al_cupo
    from crm_giwa.soporte_notas n
    join crm_giwa.soporte_tickets t on t.id = n.ticket_id
    join crm_giwa.v_soporte_clasif c on c.ticket_id = t.id
    left join crm_giwa.v_soporte_desarrollos ab on ab.id = c.mantenimiento_id
   where coalesce(n.horas, 0) > 0
), a as (
  select n.*, case when al_cupo then sum(h) over (partition by mantenimiento_id, mes, al_cupo order by fecha, nota_id) end as acum
    from n
)
select nota_id, ticket_id, empresa_id, mes, cuenta_id, h as horas,
       case when al_cupo then least(cupo, acum) - least(cupo, acum - h) else 0 end as mant,
       case when al_cupo then h - (least(cupo, acum) - least(cupo, acum - h))
            when tipo = 'Ajuste por error propio' then 0
            when clasificacion = 'Facturable' then h else 0 end as fact,
       case when al_cupo then 0
            when tipo = 'Ajuste por error propio' then h
            when clasificacion in ('Facturable', 'Sin clasificar') then 0 else h end as gar,
       case when not al_cupo and tipo is distinct from 'Ajuste por error propio' and clasificacion = 'Sin clasificar' then h else 0 end as sin
  from a;

-- Saldo de cada mantenimiento por mes (_saldo_): sólo los meses con horas
create or replace view crm_giwa.v_soporte_saldos with (security_invoker = true) as
select r.cuenta_id as mantenimiento_id, r.empresa_id, r.mes, d.cupo_horas as cupo,
       round(sum(r.mant), 2) as usadas, round(greatest(0, d.cupo_horas - sum(r.mant)), 2) as quedan, round(sum(r.fact), 2) as excedente
  from crm_giwa.v_soporte_reparto r
  join crm_giwa.v_soporte_desarrollos d on d.id = r.cuenta_id and d.es_mantenimiento
 group by r.cuenta_id, r.empresa_id, r.mes, d.cupo_horas;

-- ── el ticket para GIWA: clasificación, horas, tarifa y costo ──
create or replace view crm_giwa.v_soporte_tickets with (security_invoker = true) as
select t.*, e.nombre as empresa_nombre, s.titulo as desarrollo_titulo, p.nombre as proyecto_nombre,
       c.clasificacion, c.motivo as clasif_motivo, c.forzada, c.cuenta_id, c.mantenimiento_id,
       coalesce(h.horas, 0) as horas, coalesce(h.fact, 0) as horas_facturables,
       coalesce(t.tarifa_hora, case when coalesce(h.fact, 0) > 0 then crm_giwa.soporte_tarifa_ticket(t.desarrollo_id) end, 0) as tarifa,
       round(coalesce(h.fact, 0) * coalesce(t.tarifa_hora, case when coalesce(h.fact, 0) > 0 then crm_giwa.soporte_tarifa_ticket(t.desarrollo_id) end, 0)) as costo,
       case when c.clasificacion = 'Facturable' then c.motivo
            when coalesce(h.fact, 0) > 0 then 'Parte de las horas exceden las contratadas del mes: se facturan aparte.' end as motivo_factura,
       (select min(n.fecha) from crm_giwa.soporte_notas n join crm_giwa.usuarios u on u.es_giwa and crm_giwa.norm_mail(u.mail) = crm_giwa.norm_mail(n.autor)
         where n.ticket_id = t.id and not n.interna) as primera_resp,
       (select count(*) from crm_giwa.soporte_notas n where n.ticket_id = t.id and not n.interna and coalesce(trim(n.texto), '') <> '') as comentarios,
       t.estado = 'Cerrado' as cerrado
  from crm_giwa.soporte_tickets t
  join crm_giwa.v_soporte_clasif c on c.ticket_id = t.id
  left join crm_giwa.empresas e on e.id = t.empresa_id
  left join crm_giwa.v_soporte_desarrollos s on s.id = t.desarrollo_id
  left join crm_giwa.proyectos p on p.id = t.proyecto_id
  left join (select ticket_id, round(sum(horas), 2) as horas, round(sum(fact), 2) as fact from crm_giwa.v_soporte_reparto group by ticket_id) h on h.ticket_id = t.id;

-- La tarifa se congela la primera vez que algo del ticket se factura (_recalcular_)
create or replace function crm_giwa.soporte_congelar_tarifas(emp text) returns void
language sql volatile as $$
  update crm_giwa.soporte_tickets t set tarifa_hora = v.tarifa
    from crm_giwa.v_soporte_tickets v
   where v.id = t.id and t.empresa_id = emp and t.tarifa_hora is null and v.horas_facturables > 0 and v.tarifa > 0
$$;

grant select on crm_giwa.v_soporte_desarrollos, crm_giwa.v_soporte_clasif, crm_giwa.v_soporte_reparto,
                crm_giwa.v_soporte_saldos, crm_giwa.v_soporte_tickets to authenticated, service_role;
grant execute on function crm_giwa.soporte_lista(text), crm_giwa.soporte_abono_de(text), crm_giwa.soporte_tarifa_hora(text),
                          crm_giwa.soporte_tarifa_ticket(text), crm_giwa.soporte_congelar_tarifas(text) to authenticated, service_role;

-- ══════════════════════════════════════════════════════════════════════
-- Portal del cliente: todo pasa por acá (SECURITY DEFINER, corre como el dueño).
-- La empresa sale del mail con el que inició sesión, nunca de lo que manda el navegador.
-- GIWA puede «ver como» una empresa (sólo lectura) pasando `como`.
-- ══════════════════════════════════════════════════════════════════════
create or replace function crm_giwa.mi_empresa_portal() returns text
language sql stable security definer set search_path = '' as $$
  select a.empresa_id
    from crm_giwa.soporte_accesos a
    join crm_giwa.soporte_empresas e on e.empresa_id = a.empresa_id and e.activo
   where a.habilitado and a.mail = crm_giwa.mi_mail()
   limit 1
$$;

-- La empresa con la que trabaja una llamada: la propia, o la de «ver como» si es del equipo
create or replace function crm_giwa._portal_empresa(como text, escribe boolean) returns text
language plpgsql stable security definer set search_path = '' as $$
declare emp text;
begin
  if nullif(trim(coalesce(como, '')), '') is not null then
    if not crm_giwa.es_equipo() then raise exception 'No tenés permiso.'; end if;
    if escribe then raise exception 'Estás viendo el portal como el cliente: es sólo para mirar.'; end if;
    return trim(como);
  end if;
  emp := crm_giwa.mi_empresa_portal();
  if emp is null then raise exception 'Tu usuario no tiene acceso al portal de soporte. Pedíselo a GIWA.'; end if;
  return emp;
end $$;

-- Datos para arrancar: quién soy, mi empresa, mis proyectos y desarrollos vendidos (sin valores), listas
create or replace function crm_giwa.portal_inicio(como text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare emp text := crm_giwa._portal_empresa(como, false); se crm_giwa.soporte_empresas;
begin
  select * into se from crm_giwa.soporte_empresas where empresa_id = emp;
  return jsonb_build_object(
    'yo', jsonb_build_object('mail', crm_giwa.mi_mail(),
            'nombre', coalesce((select nullif(trim(coalesce(c.nombre, '') || ' ' || coalesce(c.apellido, '')), '') from crm_giwa.contactos c
                                 where crm_giwa.norm_mail(c.email) = crm_giwa.mi_mail() limit 1), crm_giwa.mi_mail()),
            'como', como is not null),
    'empresa', (select jsonb_build_object('id', e.id, 'nombre', e.nombre, 'logo', e.logo, 'mostrar_horas', coalesce(se.mostrar_horas, false))
                  from crm_giwa.empresas e where e.id = emp),
    'desarrollos', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'proyecto_id', d.proyecto_id, 'proyecto', p.nombre,
                     'titulo', d.titulo, 'tipo', d.tipo_nombre, 'es_mantenimiento', d.es_mantenimiento, 'vigente', d.vigente,
                     'cupo_horas', case when se.mostrar_horas then d.cupo_horas end) order by p.nombre, d.titulo)
                   from crm_giwa.v_soporte_desarrollos d join crm_giwa.proyectos p on p.id = d.proyecto_id
                  where d.empresa_id = emp and d.ganado), '[]'),
    'modulos', coalesce((select jsonb_agg(distinct t.modulo) from crm_giwa.soporte_tickets t where t.empresa_id = emp and coalesce(t.modulo, '') <> ''), '[]'),
    'listas', jsonb_build_object('tipo', to_jsonb(crm_giwa.soporte_lista('Soporte_TipoCliente')), 'prioridad', to_jsonb(crm_giwa.soporte_lista('Soporte_Prioridad')),
                                 'sintoma', to_jsonb(crm_giwa.soporte_lista('Soporte_Sintoma')), 'categoria', to_jsonb(crm_giwa.soporte_lista('Soporte_Categoria')),
                                 'estado', to_jsonb(crm_giwa.soporte_lista('Soporte_Estado'))));
end $$;

-- Lo que ve el cliente de un ticket (_ocultarAlCliente_): nunca montos, tarifas, clasificación forzada ni origen
create or replace function crm_giwa._portal_ticket_json(v crm_giwa.v_soporte_tickets, mostrar_horas boolean, detalle boolean) returns jsonb
language sql stable as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', v.id, 'creado', v.creado, 'actualizado', v.actualizado, 'tipo', v.tipo, 'sintoma', v.sintoma, 'categoria', v.categoria,
    'modulo', v.modulo, 'titulo', v.titulo, 'prioridad', v.prioridad, 'estado', v.estado, 'cerrado', v.cerrado,
    'desarrollo_id', v.desarrollo_id, 'desarrollo', v.desarrollo_titulo, 'proyecto', v.proyecto_nombre,
    'solicitante', v.solicitante, 'vence', v.vence, 'resuelto', v.resuelto, 'relacionado_con', v.relacionado_con,
    'clasificacion', v.clasificacion,
    'clasif_motivo', case when not mostrar_horas and v.clasificacion = 'Mantenimiento mensual' then 'Incluido en el mantenimiento mensual.'
                          when v.forzada then null else v.clasif_motivo end,
    'se_factura', v.motivo_factura is not null, 'motivo_factura', v.motivo_factura,
    'horas', case when mostrar_horas then v.horas end,
    'comentarios', v.comentarios, 'primera_resp', v.primera_resp,
    'descripcion', case when detalle then v.descripcion end, 'respuesta_final', case when detalle then v.respuesta_final end))
$$;

create or replace function crm_giwa.portal_tickets(como text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare emp text := crm_giwa._portal_empresa(como, false);
        mh boolean := coalesce((select mostrar_horas from crm_giwa.soporte_empresas where empresa_id = emp), false);
begin
  return coalesce((select jsonb_agg(crm_giwa._portal_ticket_json(v, mh, false) order by v.actualizado desc)
                     from crm_giwa.v_soporte_tickets v where v.empresa_id = emp), '[]');
end $$;

create or replace function crm_giwa.portal_ticket(tid text, como text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare emp text := crm_giwa._portal_empresa(como, false); v crm_giwa.v_soporte_tickets; mh boolean; ver_horas boolean;
        v_mes text := to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM'); consumo jsonb;
begin
  select * into v from crm_giwa.v_soporte_tickets where id = tid and empresa_id = emp;
  if v.id is null then raise exception 'No encuentro ese ticket.'; end if;
  mh := coalesce((select mostrar_horas from crm_giwa.soporte_empresas where empresa_id = emp), false);
  ver_horas := mh or v.clasificacion = 'Facturable';
  -- el saldo del mes de su mantenimiento, si tiene y la empresa muestra horas
  if mh then
    select jsonb_build_object('titulo', d.titulo, 'cupo', d.cupo_horas, 'usadas', coalesce(s.usadas, 0), 'quedan', coalesce(s.quedan, d.cupo_horas), 'mes', v_mes)
      into consumo
      from crm_giwa.v_soporte_desarrollos d left join crm_giwa.v_soporte_saldos s on s.mantenimiento_id = d.id and s.mes = v_mes
     where d.id = v.mantenimiento_id;
  end if;
  return jsonb_build_object(
    'ticket', crm_giwa._portal_ticket_json(v, mh, true) || case when consumo is not null then jsonb_build_object('consumo', consumo) else '{}' end,
    'adjuntos', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'nombre', a.nombre, 'ruta', a.ruta, 'tipo', a.tipo) order by a.id)
                            from crm_giwa.soporte_adjuntos a where a.ticket_id = tid and a.nota_id is null), '[]'),
    'notas', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', n.id, 'fecha', n.fecha, 'autor', n.autor,
               'autor_nombre', coalesce((select u.nombre from crm_giwa.usuarios u where crm_giwa.norm_mail(u.mail) = crm_giwa.norm_mail(n.autor) limit 1),
                                        (select nullif(trim(coalesce(c.nombre, '') || ' ' || coalesce(c.apellido, '')), '') from crm_giwa.contactos c where crm_giwa.norm_mail(c.email) = crm_giwa.norm_mail(n.autor) limit 1), n.autor),
               'texto', n.texto, 'horas', case when ver_horas then n.horas end,
               'adjuntos', (select jsonb_agg(jsonb_build_object('id', a.id, 'nombre', a.nombre, 'ruta', a.ruta, 'tipo', a.tipo) order by a.id)
                              from crm_giwa.soporte_adjuntos a where a.nota_id = n.id))) order by n.fecha, n.id)
                         from crm_giwa.soporte_notas n where n.ticket_id = tid and not n.interna), '[]'));
end $$;

-- Ticket nuevo del cliente (_crearSolicitud_): sobre un desarrollo vendido de su empresa, con los tipos de cliente
create or replace function crm_giwa.portal_crear(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare emp text := crm_giwa._portal_empresa(null, true); d crm_giwa.v_soporte_desarrollos; tid text; tipo text; rel text; cl text;
        titulo text := left(trim(coalesce(p ->> 'titulo', '')), 200);
begin
  if length(titulo) < 3 then raise exception 'Poné un título.'; end if;
  select * into d from crm_giwa.v_soporte_desarrollos where id = p ->> 'desarrollo_id' and empresa_id = emp and ganado;
  if d.id is null then raise exception 'Elegí sobre qué desarrollo es el pedido.'; end if;
  tipo := coalesce(nullif(p ->> 'tipo', ''), 'Algo no funciona');
  if not (tipo = any (crm_giwa.soporte_lista('Soporte_TipoCliente'))) then tipo := 'Algo no funciona'; end if;
  rel := nullif(p ->> 'relacionado_con', '');
  if rel is not null and not exists (select 1 from crm_giwa.soporte_tickets where id = rel and empresa_id = emp) then rel := null; end if;
  perform pg_advisory_xact_lock(hashtext('crm_giwa.soporte_tickets'));
  tid := 'TKT-' || lpad((coalesce((select max(substring(id from '^TKT-(\d+)$')::int) from crm_giwa.soporte_tickets), 0) + 1)::text, 4, '0');
  insert into crm_giwa.soporte_tickets (id, empresa_id, proyecto_id, desarrollo_id, tipo, sintoma, categoria, modulo, titulo, descripcion,
                                        prioridad, solicitante, canal, origen, relacionado_con)
  values (tid, emp, d.proyecto_id, d.id, tipo,
          case when p ->> 'sintoma' = any (crm_giwa.soporte_lista('Soporte_Sintoma')) then p ->> 'sintoma' end,
          case when p ->> 'categoria' = any (crm_giwa.soporte_lista('Soporte_Categoria')) then p ->> 'categoria' end,
          nullif(left(trim(coalesce(p ->> 'modulo', '')), 80), ''), titulo, left(coalesce(p ->> 'descripcion', ''), 20000),
          case when p ->> 'prioridad' = any (crm_giwa.soporte_lista('Soporte_Prioridad')) then p ->> 'prioridad' else 'Media' end,
          crm_giwa.mi_mail(), 'Portal', 'portal', rel);
  select clasificacion into cl from crm_giwa.v_soporte_clasif where ticket_id = tid;
  if cl = 'A cotizar' then perform crm_giwa._soporte_tarea_cotizar(tid); end if;
  update crm_giwa.soporte_accesos set ultimo_ingreso = now() where mail = crm_giwa.mi_mail();
  return jsonb_build_object('ok', true, 'id', tid);
end $$;

-- «A cotizar» crea la tarea de cotización en el CRM (_crearTareaCotizar_). La crea el responsable de
-- cotizar (tareas.creador tiene que ser un usuario de GIWA; el cliente no lo es) y el cliente queda en Contactos.
create or replace function crm_giwa._soporte_tarea_cotizar(tid text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare t crm_giwa.soporte_tickets; nid text; resp text; frec text;
begin
  select * into t from crm_giwa.soporte_tickets where id = tid;
  if t.id is null or t.tarea_id is not null then return t.tarea_id; end if;
  resp := crm_giwa.norm_mail((select valor from crm_giwa.cot_config where clave = 'Soporte_ResponsableCotizar'));
  if not exists (select 1 from crm_giwa.usuarios where mail = resp) then resp := crm_giwa.mail_admin(); end if;
  frec := (select trim(x) from crm_giwa.cot_config c, unnest(string_to_array(coalesce(c.valor, ''), ',')) x
            where c.clave = 'Tarea_Frecuencia' and crm_giwa.norm(trim(x)) = 'unica' limit 1);
  perform pg_advisory_xact_lock(hashtext('crm_giwa.ids'));
  nid := crm_giwa.proximo_id('T', 'tareas', 4);
  insert into crm_giwa.tareas (id, proyecto_id, desarrollo_id, cliente, tipo, titulo, descripcion, responsable, prioridad, estado,
                               fecha_creacion, vencimiento, frecuencia, enviada, origen, contactos, creador)
  values (nid, t.proyecto_id, t.desarrollo_id, t.empresa_id, 'Cotización',
          'Cotizar: ' || t.titulo || ' — ' || coalesce((select nombre from crm_giwa.empresas where id = t.empresa_id), t.empresa_id),
          'Pedido desde el portal de soporte (' || t.id || ').' || chr(10) || left(coalesce(t.descripcion, ''), 1500),
          resp, t.prioridad, 'Nueva', crm_giwa.hoy(), crm_giwa.hoy() + 7, frec, false, 'Portal soporte', t.solicitante, resp);
  update crm_giwa.soporte_tickets set tarea_id = nid where id = tid;
  return nid;
end $$;

-- Respuesta del cliente (_agregarNota_): no en tickets cerrados; si estaba esperándolo, vuelve a En proceso
create or replace function crm_giwa.portal_responder(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare emp text := crm_giwa._portal_empresa(null, true); t crm_giwa.soporte_tickets; nid text; texto text := left(trim(coalesce(p ->> 'texto', '')), 20000);
begin
  select * into t from crm_giwa.soporte_tickets where id = p ->> 'ticket_id' and empresa_id = emp;
  if t.id is null then raise exception 'No encuentro ese ticket.'; end if;
  if t.estado = 'Cerrado' then raise exception 'El ticket está resuelto y es de solo lectura. Si el problema volvió, abrí uno nuevo vinculado.'; end if;
  if texto = '' and not coalesce((p ->> 'con_adjuntos')::boolean, false) then raise exception 'La respuesta está vacía.'; end if;
  perform pg_advisory_xact_lock(hashtext('crm_giwa.soporte_notas'));
  nid := 'N-' || lpad((coalesce((select max(substring(id from '^N-(\d+)$')::int) from crm_giwa.soporte_notas), 0) + 1)::text, 5, '0');
  insert into crm_giwa.soporte_notas (id, ticket_id, autor, texto, interna, origen) values (nid, t.id, crm_giwa.mi_mail(), texto, false, 'portal');
  update crm_giwa.soporte_tickets set actualizado = now(), estado = case when estado = 'Esperando cliente' then 'En proceso' else estado end where id = t.id;
  update crm_giwa.soporte_accesos set ultimo_ingreso = now() where mail = crm_giwa.mi_mail();
  return jsonb_build_object('ok', true, 'id', nid);
end $$;

-- Registra un archivo que el cliente ya subió a Storage (la política de Storage valida la carpeta)
create or replace function crm_giwa.portal_adjunto(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare emp text := crm_giwa._portal_empresa(null, true); tid text := p ->> 'ticket_id'; nid text := nullif(p ->> 'nota_id', ''); ruta text := p ->> 'ruta'; aid bigint;
begin
  if not exists (select 1 from crm_giwa.soporte_tickets where id = tid and empresa_id = emp and estado <> 'Cerrado') then raise exception 'No encuentro ese ticket.'; end if;
  if nid is not null and not exists (select 1 from crm_giwa.soporte_notas where id = nid and ticket_id = tid and autor = crm_giwa.mi_mail()) then raise exception 'No encuentro esa respuesta.'; end if;
  if ruta is null or split_part(ruta, '/', 1) <> emp or split_part(ruta, '/', 2) <> tid then raise exception 'El archivo no está en la carpeta del ticket.'; end if;
  insert into crm_giwa.soporte_adjuntos (ticket_id, nota_id, nombre, ruta, tipo, bytes, autor)
  values (tid, nid, left(coalesce(nullif(p ->> 'nombre', ''), 'archivo'), 200), ruta, p ->> 'tipo', nullif(p ->> 'bytes', '')::bigint, crm_giwa.mi_mail())
  returning id into aid;
  return jsonb_build_object('ok', true, 'id', aid);
end $$;

-- Reportes publicados de mi empresa
create or replace function crm_giwa.portal_reportes(como text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare emp text := crm_giwa._portal_empresa(como, false);
begin
  return coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', r.id, 'periodo', r.periodo, 'tipo', r.tipo, 'titulo', r.titulo,
           'resumen', r.resumen, 'hicimos', r.hicimos, 'pendiente', r.pendiente, 'revisamos', r.revisamos, 'publicado', r.publicado,
           'desarrollo', (select titulo from crm_giwa.v_soporte_desarrollos where id = r.desarrollo_id),
           'tickets', (select jsonb_agg(jsonb_build_object('id', t.id, 'titulo', t.titulo) order by t.id) from crm_giwa.soporte_reporte_tickets rt
                         join crm_giwa.soporte_tickets t on t.id = rt.ticket_id where rt.reporte_id = r.id),
           'adjuntos', (select jsonb_agg(jsonb_build_object('id', a.id, 'nombre', a.nombre, 'ruta', a.ruta, 'tipo', a.tipo) order by a.id)
                          from crm_giwa.soporte_adjuntos a where a.reporte_id = r.id))) order by r.publicado desc nulls last)
                     from crm_giwa.soporte_reportes r where r.empresa_id = emp and r.estado = 'Publicado'), '[]');
end $$;

-- ── Storage: quién puede ver y subir cada archivo del bucket «soporte» ──
-- Ruta: <empresa>/<ticket o reporte>/<archivo>. El cliente sube sólo a tickets abiertos de su empresa
-- y ve sólo lo registrado en soporte_adjuntos que no sea de una nota interna ni de un reporte sin publicar.
create or replace function crm_giwa.soporte_puede_ver_archivo(ruta text) returns boolean
language sql stable security definer set search_path = '' as $$
  select crm_giwa.es_equipo() or exists (
    select 1 from crm_giwa.soporte_adjuntos a
      left join crm_giwa.soporte_notas n on n.id = a.nota_id
      left join crm_giwa.soporte_tickets t on t.id = a.ticket_id
      left join crm_giwa.soporte_reportes r on r.id = a.reporte_id
     where a.ruta = soporte_puede_ver_archivo.ruta
       and coalesce(t.empresa_id, r.empresa_id) = crm_giwa.mi_empresa_portal()
       and not coalesce(n.interna, false)
       and (a.reporte_id is null or r.estado = 'Publicado'))
$$;

create or replace function crm_giwa.soporte_puede_subir_archivo(ruta text) returns boolean
language sql stable security definer set search_path = '' as $$
  select crm_giwa.es_equipo() or exists (
    select 1 from crm_giwa.soporte_tickets t
     where t.empresa_id = crm_giwa.mi_empresa_portal()
       and split_part(soporte_puede_subir_archivo.ruta, '/', 1) = t.empresa_id
       and split_part(soporte_puede_subir_archivo.ruta, '/', 2) = t.id
       and t.estado <> 'Cerrado')
$$;

revoke execute on function crm_giwa._portal_empresa(text, boolean), crm_giwa._soporte_tarea_cotizar(text) from public;
grant execute on function crm_giwa.mi_empresa_portal(), crm_giwa.portal_inicio(text), crm_giwa.portal_tickets(text), crm_giwa.portal_ticket(text, text),
  crm_giwa.portal_crear(jsonb), crm_giwa.portal_responder(jsonb), crm_giwa.portal_adjunto(jsonb), crm_giwa.portal_reportes(text),
  crm_giwa.soporte_puede_ver_archivo(text), crm_giwa.soporte_puede_subir_archivo(text), crm_giwa._portal_ticket_json(crm_giwa.v_soporte_tickets, boolean, boolean)
  to authenticated, service_role;
grant execute on function crm_giwa._portal_empresa(text, boolean), crm_giwa._soporte_tarea_cotizar(text) to service_role;

reset role;

-- El bucket y sus políticas los crea el dueño de storage (no crm_giwa_dev)
insert into storage.buckets (id, name, public, file_size_limit)
values ('soporte', 'soporte', false, 10485760)
on conflict (id) do nothing;

drop policy if exists soporte_ver on storage.objects;
create policy soporte_ver on storage.objects for select to authenticated
  using (bucket_id = 'soporte' and crm_giwa.soporte_puede_ver_archivo(name));
drop policy if exists soporte_subir on storage.objects;
create policy soporte_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'soporte' and crm_giwa.soporte_puede_subir_archivo(name));
drop policy if exists soporte_equipo_cambiar on storage.objects;
create policy soporte_equipo_cambiar on storage.objects for update to authenticated
  using (bucket_id = 'soporte' and crm_giwa.es_equipo()) with check (bucket_id = 'soporte' and crm_giwa.es_equipo());
drop policy if exists soporte_equipo_borrar on storage.objects;
create policy soporte_equipo_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'soporte' and crm_giwa.es_equipo());
