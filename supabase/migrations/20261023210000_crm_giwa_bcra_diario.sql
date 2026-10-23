-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · tipo de cambio e IPC del BCRA, cargados por la base · 23/10/2026
-- ──────────────────────────────────────────────────────────────────────
-- Hasta ahora cada pantalla le preguntaba al BCRA (Mercado.gs): lento y
-- frágil (79 consultas seguidas en getGastos, 28 s). Ahora una tarea de la
-- base trae los datos una vez por día y las cuentas leen de la tabla.
--
-- Las mismas series que Mercado.gs:
--   4   tipo de cambio (diario)            → crm_giwa.tipo_cambio
--   27  IPC, variación mensual             → crm_giwa.indices_ipc
-- indices_ipc: se agregan los meses que falten (como sembrarIndices); un
-- valor vacío se completa cuando el BCRA lo publica; lo cargado no se pisa.
--
-- Cómo corre (pg_cron + pg_net, activadas el 23/10/2026 con OK del usuario):
--   cada hora, crm_giwa.bcra_ciclo() procesa las respuestas que llegaron y,
--   si pasaron 6 h del último pedido, pide de nuevo. pg_net es asincrónico:
--   el pedido sale en una vuelta y la respuesta se lee en la siguiente.
--
-- Las funciones que salen a internet son de postgres, no de crm_giwa_dev: el
-- usuario de Vicky ve las tablas pero no puede hacer pedidos web desde la base.
-- ══════════════════════════════════════════════════════════════════════

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- ── las tablas (de crm_giwa_dev, como todo el CRM) ──
set role crm_giwa_dev;

create table if not exists crm_giwa.tipo_cambio (
  fecha       date primary key,
  valor       numeric(12,4) not null,
  fuente      text not null default 'BCRA',
  actualizado timestamptz not null default now()
);
alter table crm_giwa.tipo_cambio enable row level security;
drop policy if exists equipo on crm_giwa.tipo_cambio;
create policy equipo on crm_giwa.tipo_cambio for all to authenticated
  using (crm_giwa.es_equipo()) with check (crm_giwa.es_equipo());

create table if not exists crm_giwa.bcra_pedidos (
  id         bigint primary key,            -- el id de net.http_get
  serie      int not null,                  -- 4 = tipo de cambio · 27 = IPC
  pedido     timestamptz not null default now(),
  procesado  timestamptz,
  estado     text                           -- ok · error HTTP n · sin respuesta
);
alter table crm_giwa.bcra_pedidos enable row level security;
drop policy if exists equipo on crm_giwa.bcra_pedidos;
create policy equipo on crm_giwa.bcra_pedidos for select to authenticated using (crm_giwa.es_equipo());

-- El tipo de cambio de una fecha: el último publicado entre 7 días antes y
-- ese día; si no hay, tc_default de CotConfig (como _getTCByFecha).
create or replace function crm_giwa.tc_de_fecha(p_fecha date) returns numeric
language sql stable as $$
  select coalesce(
    (select valor from crm_giwa.tipo_cambio
      where fecha <= p_fecha and fecha >= p_fecha - 7 order by fecha desc limit 1),
    (select nullif(regexp_replace(valor, '[^0-9.]', '', 'g'), '')::numeric
       from crm_giwa.cot_config where clave = 'tc_default'),
    1200)
$$;

-- El tipo de cambio de hoy (la etiqueta TC de la barra)
create or replace view crm_giwa.v_tipo_cambio_hoy with (security_invoker = true) as
select fecha, valor from crm_giwa.tipo_cambio order by fecha desc limit 1;

reset role;

-- ── lo que sale a internet: de postgres ──
create or replace function crm_giwa.bcra_pedir() returns int
language plpgsql security definer set search_path = '' as $$
declare
  desde_tc date := coalesce((select max(fecha) - 10 from crm_giwa.tipo_cambio), date '2025-01-01');
  -- Sin User-Agent: pg_net manda el suyo y, duplicado, el BCRA responde 400
  -- «invalid header name» (probado el 23/10/2026).
  hdr jsonb := '{"Accept":"application/json"}';
begin
  insert into crm_giwa.bcra_pedidos (id, serie) values
    (net.http_get(url := 'https://api.bcra.gob.ar/estadisticas/v4.0/monetarias/4?desde=' || desde_tc
                         || '&hasta=' || current_date || '&limit=3000',
                  headers := hdr, timeout_milliseconds := 20000), 4),
    (net.http_get(url := 'https://api.bcra.gob.ar/estadisticas/v4.0/monetarias/27?desde=' || (current_date - 400)
                         || '&hasta=' || current_date || '&limit=3000',
                  headers := hdr, timeout_milliseconds := 20000), 27);
  return 2;
end $$;

create or replace function crm_giwa.bcra_procesar() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r record; det jsonb; n_tc int := 0; n_ipc int := 0;
begin
  -- primero el tipo de cambio: el IPC de un mes lleva el TC de su último día
  for r in
    select p.id, p.serie, h.status_code, h.content
    from crm_giwa.bcra_pedidos p join net._http_response h on h.id = p.id
    where p.procesado is null order by p.serie
  loop
    if r.status_code <> 200 then
      update crm_giwa.bcra_pedidos set procesado = now(), estado = 'error HTTP ' || coalesce(r.status_code::text, '?') where id = r.id;
      continue;
    end if;
    det := r.content::jsonb -> 'results';
    if jsonb_typeof(det -> 0 -> 'detalle') = 'array' then det := det -> 0 -> 'detalle'; end if;
    if r.serie = 4 then
      insert into crm_giwa.tipo_cambio (fecha, valor)
      select (x ->> 'fecha')::date, (x ->> 'valor')::numeric from jsonb_array_elements(det) x
      where x ->> 'valor' is not null
      on conflict (fecha) do update set valor = excluded.valor, actualizado = now();
      get diagnostics n_tc = row_count;
    elsif r.serie = 27 then
      insert into crm_giwa.indices_ipc (mes, ipc, tc, fuente, actualizado)
      select date_trunc('month', (x ->> 'fecha')::date)::date, (x ->> 'valor')::numeric,
             (select t.valor from crm_giwa.tipo_cambio t
               where date_trunc('month', t.fecha) = date_trunc('month', (x ->> 'fecha')::date)
               order by t.fecha desc limit 1),
             'BCRA', current_date
      from jsonb_array_elements(det) x
      where x ->> 'valor' is not null
      on conflict (mes) do update
        set ipc = coalesce(crm_giwa.indices_ipc.ipc, excluded.ipc),
            tc  = coalesce(crm_giwa.indices_ipc.tc,  excluded.tc);
      get diagnostics n_ipc = row_count;
    end if;
    update crm_giwa.bcra_pedidos set procesado = now(), estado = 'ok' where id = r.id;
  end loop;
  -- lo que no respondió en una hora no va a responder
  update crm_giwa.bcra_pedidos set procesado = now(), estado = 'sin respuesta'
  where procesado is null and pedido < now() - interval '1 hour';
  return jsonb_build_object('tipo_cambio', n_tc, 'indices_ipc', n_ipc);
end $$;

create or replace function crm_giwa.bcra_ciclo() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare res jsonb;
begin
  res := crm_giwa.bcra_procesar();
  if not exists (select 1 from crm_giwa.bcra_pedidos where pedido > now() - interval '6 hours') then
    perform crm_giwa.bcra_pedir();
    res := res || '{"pedido": true}';
  end if;
  return res;
end $$;

revoke all on function crm_giwa.bcra_pedir(), crm_giwa.bcra_procesar(), crm_giwa.bcra_ciclo()
  from public, anon, authenticated, crm_giwa_dev;

-- cada hora, a los 7 minutos
select cron.unschedule('crm-giwa-bcra') where exists (select 1 from cron.job where jobname = 'crm-giwa-bcra');
select cron.schedule('crm-giwa-bcra', '7 * * * *', 'select crm_giwa.bcra_ciclo()');
