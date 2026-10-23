-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · tareas en SQL · etapa 3a · 24/10/2026
-- ──────────────────────────────────────────────────────────────────────
-- v_tareas = getTasksDashboard del Apps Script (Tareas.gs), una fila por
-- tarea con lo que el tablero y Hoy calculaban en el servidor:
--   · canon      _canonTarea (nueva · curso · detenida · finalizada · cancelada)
--   · hidden     alerta fuera de su ventana de aviso, o tarea con recordatorio
--                (canal cargado) antes de vence − recordatorio
--   · overdue    abierta y vencida
--   · cat / key  _adminCat / _taskKey; dup_of / dups = repetidas por clave:
--                queda la abierta (y visible) que vence primero
--   · grp        admin · project · client (lo administrativo es 'admin')
-- Lo administrativo (tipo Administración o categoría) sólo lo ve quien
-- tiene rol Admin en usuarios, igual que en el Apps Script.
--
-- Soporte (otra planilla) y los comentarios recientes NO van acá: el
-- primero llega por el puente de Google; los segundos, de comentarios.
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

-- ── hoy en Buenos Aires (_hoy) ──
create or replace function crm_giwa.hoy() returns date
language sql stable as $$
  select (now() at time zone 'America/Argentina/Buenos_Aires')::date
$$;

-- ── mail normalizado (_normEmail): sin @ → @giwa-ia.com ──
create or replace function crm_giwa.norm_mail(m text) returns text
language sql immutable as $$
  select case when nullif(trim(coalesce(m, '')), '') is null then ''
              when position('@' in m) > 0 then lower(trim(m))
              else lower(trim(m)) || '@giwa-ia.com' end
$$;

-- ── lista separada por comas, sin vacíos ni repetidos, en orden (_csv) ──
create or replace function crm_giwa.lista_csv(t text) returns text[]
language sql immutable as $$
  select coalesce(array_agg(x order by o), '{}')
  from (select x, min(o) o
        from unnest(string_to_array(coalesce(t, ''), ',')) with ordinality u(x0, o),
             lateral (select trim(x0) x) s
        where x <> '' group by x) q
$$;

-- ── mails normalizados y sin repetir, separados por ', ' (_normEmails) ──
create or replace function crm_giwa.norm_mails(t text) returns text
language sql immutable as $$
  select coalesce(string_agg(m, ', ' order by o), '')
  from (select crm_giwa.norm_mail(x0) m, min(o) o
        from unnest(string_to_array(coalesce(t, ''), ',')) with ordinality u(x0, o)
        where crm_giwa.norm_mail(x0) <> '' group by 1) q
$$;

-- ── estado canónico de una tarea (_canonTarea) ──
create or replace function crm_giwa.canon_tarea(e text) returns text
language sql immutable as $$
  select case
    when crm_giwa.norm(e) = '' then 'nueva'
    when crm_giwa.norm(e) ~ '(cancel|rechaz|descart|anulad)' then 'cancelada'
    when crm_giwa.norm(e) ~ '(finaliz|complet|hech|entreg|list|cerrad|termin)' then 'finalizada'
    when crm_giwa.norm(e) ~ '(detenid|pausad|frenad|espera|bloque)' then 'detenida'
    when crm_giwa.norm(e) ~ '(curso|progres|haciend|ejecu|proces|activ)' then 'curso'
    else 'nueva' end
$$;

-- ── categoría administrativa (_adminCat) ──
create or replace function crm_giwa.cat_admin(titulo text, alerta_tipo text) returns text
language sql immutable as $$
  select case
    when x ~ '(ipc|inflac)' then 'ipc'
    when x ~ 'factur' then 'factur'
    when x ~ 'cobr'   then 'cobro'
    when x ~ 'renov'  then 'renov'
    when x ~ 'gasto'  then 'gasto'
    when x ~ 'vencim' then 'venc'
    else '' end
  from (select crm_giwa.norm(coalesce(alerta_tipo, '') || ' ' || coalesce(titulo, '')) x) s
$$;

-- ── número de un texto ('5', '4,5'); vacío o basura = 0 (_n, lo que usan tareas) ──
create or replace function crm_giwa.num(t text) returns numeric
language sql immutable as $$
  select case when replace(trim(coalesce(t, '')), ',', '.') ~ '^-?\d+(\.\d+)?$'
              then replace(trim(t), ',', '.')::numeric else 0 end
$$;

-- ── ¿quien llama es Administración? (_isAdmin) ──
-- Sin nadie con rol Admin, todos lo son (como el Apps Script). El
-- service_role (validador, editor de SQL) ve todo.
create or replace function crm_giwa.es_admin() returns boolean
language sql stable security definer set search_path = crm_giwa, pg_temp as $$
  select coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role'
      or current_setting('request.jwt.claims', true) is null
      or not exists (select 1 from crm_giwa.usuarios where es_giwa and rol ~* 'admin')
      or exists (select 1 from crm_giwa.usuarios
                 where es_giwa and rol ~* 'admin'
                   and crm_giwa.norm_mail(mail) = crm_giwa.norm_mail(current_setting('request.jwt.claims', true)::jsonb ->> 'email'))
$$;

create or replace view crm_giwa.v_tareas with (security_invoker = true) as
with
cfg as (
  select coalesce((select nullif(crm_giwa.num(valor), 0) from crm_giwa.cot_config
                   where clave = 'Tarea_Recordatorio' and crm_giwa.num(valor) <> 0 limit 1), 5) as rec_def
),
base as (
  select t.*,
         coalesce(nullif(trim(t.tipo), ''), 'Tarea') as tipo_x,
         crm_giwa.lista_csv(t.proyecto_id)   as p0,
         crm_giwa.lista_csv(t.desarrollo_id) as i0
  from crm_giwa.tareas t
  where nullif(trim(t.id), '') is not null
),
refs as (                                  -- _fixRefs: proyecto y desarrollo al revés
  select b.*,
         case when cardinality(p0) > 0 and cardinality(i0) > 0
                   and not exists (select 1 from unnest(p0) x where x !~* '^D-')
                   and not exists (select 1 from unnest(i0) x where x !~* '^P-')
              then i0 else p0 end as pids,
         case when cardinality(p0) > 0 and cardinality(i0) > 0
                   and not exists (select 1 from unnest(p0) x where x !~* '^D-')
                   and not exists (select 1 from unnest(i0) x where x !~* '^P-')
              then p0 else i0 end as iids
  from base b
),
t1 as (
  select r.*,
         r.tipo_x ~* 'administr' as is_alert,
         crm_giwa.cat_admin(r.titulo, r.alerta_tipo) as cat,
         crm_giwa.canon_tarea(r.estado) as canon,
         coalesce(nullif(trim(r.cliente), ''), (select p.empresa_id from crm_giwa.proyectos p where p.id = r.pids[1]), '') as cid
  from refs r
),
t2 as (
  select t.*,
         t.canon in ('finalizada', 'cancelada') as closed
  from t1 t
),
t3 as (
  select t.id,
         t.tipo_x as type, coalesce(t.canal_envio, '') as channels, crm_giwa.num(t.recordatorio) as reminder,
         coalesce(t.titulo, '') as title, coalesce(t.descripcion, '') as detail,
         coalesce(nullif(trim(t.estado), ''), 'Nueva') as state, t.canon, t.closed,
         case
           when t.is_alert and not t.closed and t.vencimiento is not null
                and t.vencimiento - (coalesce(nullif(crm_giwa.num(t.recordatorio), 0), cfg.rec_def))::int > crm_giwa.hoy() then true
           when not t.is_alert and coalesce(trim(t.canal_envio), '') <> '' and not t.closed and t.vencimiento is not null
                and t.vencimiento - (crm_giwa.num(t.recordatorio))::int > crm_giwa.hoy() then true
           else false end as hidden,
         coalesce(t.prioridad, '') as priority, t.vencimiento as due,
         (not t.closed and t.vencimiento is not null and t.vencimiento < crm_giwa.hoy()) as overdue,
         crm_giwa.norm_mails(t.responsable) as assignees, crm_giwa.norm_mail(t.creador) as creator,
         t.fecha_creacion as created, coalesce(t.frecuencia, '') as frequency, coalesce(t.origen, '') as origin,
         t.cid as client_id,
         case when t.cid = '' then '' else coalesce((select e.nombre from crm_giwa.empresas e where e.id = t.cid), t.cid) end as client_name,
         t.pids as project_ids,
         coalesce((select string_agg(coalesce(p.nombre, x), ', ' order by o)
                   from unnest(t.pids) with ordinality u(x, o) left join crm_giwa.proyectos p on p.id = x), '') as project_name,
         t.iids as item_ids,
         coalesce((select string_agg(coalesce(nullif(d.titulo, ''), nullif(d.tipo_id, ''), x), ', ' order by o)
                   from unnest(t.iids) with ordinality u(x, o) left join crm_giwa.desarrollos d on d.id = x), '') as item_name,
         (select count(*) from crm_giwa.comentarios c where c.tarea_id = t.id)::int as comments,
         coalesce(t.alerta_tipo, '') as alert_type, t.cat, t.is_alert,
         case when t.cat = '' then '' else t.cat || '|' || coalesce(t.iids[1], t.pids[1], nullif(t.cid, ''), '') end as key,
         case when t.is_alert or t.cat <> '' then 'admin'
              when cardinality(t.pids) > 0 then 'project'
              when t.cid <> '' then 'client' else 'admin' end as grp,
         (t.is_alert or t.cat <> '') as solo_admin,
         t.proyecto_id, t.desarrollo_id, t.contactos, t.duracion, t.fin, t.enviada, t.orden
  from t2 t cross join cfg
),
dups as (                                  -- repetidas: por clave, entre las abiertas
  select id, key,
         first_value(id) over w as keep,
         count(*) over (partition by key) as n
  from t3
  where key <> '' and not closed
  window w as (partition by key order by hidden, coalesce(due, '9999-12-31'::date), orden
               rows between unbounded preceding and unbounded following)
)
select t3.*,
       case when d.n > 1 and d.keep <> t3.id then d.keep else '' end as dup_of,
       case when d.n > 1 and d.keep = t3.id then (d.n - 1)::int else 0 end as dups
from t3 left join dups d on d.id = t3.id
where not t3.solo_admin or crm_giwa.es_admin();

grant select on crm_giwa.v_tareas to authenticated, service_role;
grant execute on function crm_giwa.hoy(), crm_giwa.norm_mail(text), crm_giwa.lista_csv(text), crm_giwa.norm_mails(text),
  crm_giwa.canon_tarea(text), crm_giwa.cat_admin(text, text), crm_giwa.num(text), crm_giwa.es_admin() to authenticated, service_role;

reset role;
