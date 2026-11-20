-- Herramientas › Funcionalidades (20/11/2026) · SÓLO Sebas y Victoria
-- Revisión de lo que tiene cada desarrollo, tildando el catálogo del Cotizador. Sirve para
-- valorizar lo entregado contra lo vendido. Es una estimación de referencia: no toca
-- desarrollos, propuestas, horas ni precios.
--   fun_proyectos  qué desarrollos se revisan, con su nombre corto y su responsable
--   fun_marcas     lo tildado: un renglón por funcionalidad del catálogo o agregada a mano
--   fun_resumen()  horas, hora efectiva y valor a Córdoba, Buenos Aires y Upwork (la plata, en SQL)
set role crm_giwa_dev;

create or replace function crm_giwa.es_revisor_fun() returns boolean language sql stable as $$
  select lower(coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email', ''))
         in ('v.gagey@giwa-ia.com', 's.echavarria@giwa-ia.com')
$$;
grant execute on function crm_giwa.es_revisor_fun() to authenticated;

create table if not exists crm_giwa.fun_proyectos (
  desarrollo_id text primary key references crm_giwa.desarrollos(id),
  nombre        text not null,
  responsable   text,                       -- mail; vacío = sin asignar
  interno       boolean not null default false,
  orden         integer not null default 0
);

create table if not exists crm_giwa.fun_marcas (
  id            bigint generated always as identity primary key,
  desarrollo_id text not null references crm_giwa.fun_proyectos(desarrollo_id) on delete cascade,
  modulo_id     text references crm_giwa.catalogo_modulos(id),   -- vacío = agregada a mano
  nombre        text,                                            -- sólo las agregadas
  tiene         boolean not null default false,
  horas         numeric(6,2),                                    -- corregidas; vacío = las del catálogo
  cantidad      integer not null default 1 check (cantidad >= 1),
  origen        text check (origen in ('propuesta', 'despues', 'nose')),
  nota          text,
  quien         text not null default lower(coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email', '')),
  actualizado   timestamptz not null default now(),
  check (modulo_id is not null or coalesce(trim(nombre), '') <> '')
);
create unique index if not exists fun_marcas_modulo on crm_giwa.fun_marcas (desarrollo_id, modulo_id) where modulo_id is not null;

alter table crm_giwa.fun_proyectos enable row level security;
alter table crm_giwa.fun_marcas enable row level security;
drop policy if exists revisores on crm_giwa.fun_proyectos;
create policy revisores on crm_giwa.fun_proyectos for select to authenticated using ((select crm_giwa.es_revisor_fun()));
drop policy if exists revisores on crm_giwa.fun_marcas;
create policy revisores on crm_giwa.fun_marcas for all to authenticated
  using ((select crm_giwa.es_revisor_fun())) with check ((select crm_giwa.es_revisor_fun()));
revoke all on crm_giwa.fun_proyectos, crm_giwa.fun_marcas from authenticated;
grant select on crm_giwa.fun_proyectos to authenticated;
grant select, insert, update, delete on crm_giwa.fun_marcas to authenticated;
grant all on crm_giwa.fun_proyectos, crm_giwa.fun_marcas to service_role;

-- Referencia de Córdoba (CPCIPC, «Honorarios Recomendados», hora a demanda, actualización 08-2026)
insert into crm_giwa.valor_hora_mercado (id, fuente, fecha, perfil, rol_fuente, unidad, ars_min, ars_max, usd_min, usd_max, uso, nota, orden)
values ('CPCIPC-2608-implementador', 'CPCIPC', '2026-08-01', 'implementador', 'Implementador de Sistema', 'hora',
        66616.92, 66616.92, 43.4372, 43.4372, 'Valor hora de lista (Córdoba)', 'Del script viejo (Mercado.js); falta confirmar la tabla de noviembre',
        (select coalesce(max(orden), 0) + 1 from crm_giwa.valor_hora_mercado))
on conflict (id) do nothing;

-- Un monto de una fecha llevado a otra con el IPC mensual (indices_ipc). Los meses sin dato no ajustan.
create or replace function crm_giwa.fun_por_ipc(monto numeric, desde date, hasta date) returns numeric language sql stable as $$
  select case when date_trunc('month', hasta) >= date_trunc('month', desde)
    then monto * coalesce((select exp(sum(ln(1 + ipc / 100))) from crm_giwa.indices_ipc
                            where mes > date_trunc('month', desde) and mes <= date_trunc('month', hasta)), 1)
    else monto / coalesce((select exp(sum(ln(1 + ipc / 100))) from crm_giwa.indices_ipc
                            where mes > date_trunc('month', hasta) and mes <= date_trunc('month', desde)), 1) end
$$;

-- Horas tildadas de un desarrollo. Una opción cuenta si todas sus opciones de arriba con horas
-- también están tildadas (las preguntas, sin horas, no se tildan).
create or replace function crm_giwa.fun_horas(p text) returns numeric language sql stable as $$
  with recursive anc(modulo, ancestro) as (
    select id, padre from crm_giwa.catalogo_modulos where padre is not null
    union all
    select anc.modulo, c.padre from anc join crm_giwa.catalogo_modulos c on c.id = anc.ancestro where c.padre is not null)
  select coalesce(sum(coalesce(f.horas, c.horas_base, 0) * case when c.id is null or c.es_por_instancia then f.cantidad else 1 end), 0)
    from crm_giwa.fun_marcas f
    left join crm_giwa.catalogo_modulos c on c.id = f.modulo_id
   where f.desarrollo_id = p and f.tiene
     and not exists (select 1 from anc join crm_giwa.catalogo_modulos a on a.id = anc.ancestro
                      where anc.modulo = f.modulo_id and a.horas_base > 0
                        and not exists (select 1 from crm_giwa.fun_marcas g where g.desarrollo_id = p and g.modulo_id = a.id and g.tiene))
$$;

create or replace function crm_giwa.fun_resumen(p text) returns jsonb language plpgsql stable as $$
declare
  d record; h numeric; f date; tc numeric; cba record; ba record; up record; refs jsonb;
begin
  if not crm_giwa.es_revisor_fun() then raise exception 'Sin permiso: Funcionalidades es sólo para Sebas y Victoria.'; end if;
  select * into d from crm_giwa.desarrollos where id = p;
  h  := crm_giwa.fun_horas(p);
  f  := coalesce(d.fecha_aprobado, current_date);
  tc := coalesce(nullif(d.tipo_cambio, 0), (select valor from crm_giwa.v_tipo_cambio_hoy limit 1));
  select fecha, ars_max as hora into cba from crm_giwa.valor_hora_mercado where id = 'CPCIPC-2608-implementador';
  select fecha, (ars_min + ars_max) / 2 as hora into ba from crm_giwa.valor_hora_mercado where id = 'CPCIBA-2610-ia';
  select valor_ref as usd into up from crm_giwa.mercado_referencias where id = 'TAR-11';
  refs := jsonb_build_array(
    jsonb_build_object('fuente', 'Córdoba', 'detalle', 'Implementador de Sistema', 'hora', round(crm_giwa.fun_por_ipc(cba.hora, cba.fecha, f), 2)),
    jsonb_build_object('fuente', 'Buenos Aires', 'detalle', 'Programador IA, punto medio', 'hora', round(crm_giwa.fun_por_ipc(ba.hora, ba.fecha, f), 2)),
    jsonb_build_object('fuente', 'Upwork', 'detalle', 'AI Developer semi senior, USD ' || trim(to_char(up.usd, 'FM999990.##')), 'hora', round(up.usd * tc, 2)));
  return jsonb_build_object(
    'horas', h, 'fecha', f, 'tc', tc, 'aprobado', d.fecha_aprobado is not null,
    'vendido', nullif(d.total_ars, 0),
    'hora_efectiva', case when h > 0 and coalesce(d.total_ars, 0) > 0 then round(d.total_ars / h, 2) end,
    'referencias', (select jsonb_agg(r || jsonb_build_object('valor', round((r ->> 'hora')::numeric * h, 2),
                                                             'diferencia', case when coalesce(d.total_ars, 0) > 0 then round(d.total_ars - (r ->> 'hora')::numeric * h, 2) end))
                      from jsonb_array_elements(refs) r));
end $$;
grant execute on function crm_giwa.fun_por_ipc(numeric, date, date), crm_giwa.fun_horas(text), crm_giwa.fun_resumen(text) to authenticated;

-- Lista de la izquierda
create or replace view crm_giwa.v_fun_proyectos with (security_invoker = true) as
select fp.desarrollo_id, fp.nombre, fp.responsable, fp.interno, fp.orden, d.tipo_id, d.titulo, d.fecha_aprobado,
       (select count(*) from crm_giwa.fun_marcas f where f.desarrollo_id = fp.desarrollo_id and f.tiene) as tildadas
  from crm_giwa.fun_proyectos fp join crm_giwa.desarrollos d on d.id = fp.desarrollo_id;
grant select on crm_giwa.v_fun_proyectos to authenticated;

-- Qué se revisa (pedido de Victoria del 20/11): clientes por responsable; internos sin asignar
insert into crm_giwa.fun_proyectos (desarrollo_id, nombre, responsable, interno, orden) values
  ('D-0020', 'Hospital del Niño · Turnos',        's.echavarria@giwa-ia.com', false, 1),
  ('D-0004', 'Prodigy · Soporte',                 's.echavarria@giwa-ia.com', false, 2),
  ('D-0006', 'Prodigy · Mediciones',              's.echavarria@giwa-ia.com', false, 3),
  ('D-0068', 'Prodigy · Lector',                  's.echavarria@giwa-ia.com', false, 4),
  ('D-0041', 'Grunwaldt · Venta',                 's.echavarria@giwa-ia.com', false, 5),
  ('D-0058', 'Prune · Bot 0800',                  's.echavarria@giwa-ia.com', false, 6),
  ('D-0059', 'Prune · PCP',                       's.echavarria@giwa-ia.com', false, 7),
  ('D-0003', 'Farewell',                          's.echavarria@giwa-ia.com', false, 8),
  ('D-0033', 'URBA · WebApp',                     's.echavarria@giwa-ia.com', false, 9),
  ('D-0064', 'KO · Conciliaciones',               's.echavarria@giwa-ia.com', false, 10),
  ('D-0097', 'KO · Facturación y mailing',        's.echavarria@giwa-ia.com', false, 11),
  ('D-0025', 'Redsom · Siniestros',               'v.gagey@giwa-ia.com',      false, 12),
  ('D-0026', 'Redsom · Dashboard de siniestros',  'v.gagey@giwa-ia.com',      false, 13),
  ('D-0022', 'Redsom · Liquidaciones',            'v.gagey@giwa-ia.com',      false, 14),
  ('D-0073', 'KO · Campo',                        'v.gagey@giwa-ia.com',      false, 15),
  ('D-0075', 'CUBA · Asistencia y minutos M15',   null, true, 20),
  ('D-0076', 'CUBA · Ficha de partido',           null, true, 21),
  ('D-0077', 'CUBA · Rifa',                       null, true, 22),
  ('D-0078', 'CUBA · Planilla del club',          null, true, 23),
  ('D-0079', 'Real State',                        null, true, 24),
  ('D-0080', 'BYD',                               null, true, 25),
  ('D-0081', 'Agente de gastos',                  null, true, 26),
  ('D-0082', 'CertiCheck',                        null, true, 27),
  ('D-0084', 'CRM GIWA',                          null, true, 28),
  ('D-0085', 'Portal de Soporte',                 null, true, 29),
  ('D-0087', 'Agente web',                        null, true, 30),
  ('D-0088', 'Centinela',                         null, true, 31),
  ('D-0089', 'Giwa Redes',                        null, true, 32),
  ('D-0090', 'Meta MCP',                          null, true, 33)
on conflict (desarrollo_id) do nothing;
