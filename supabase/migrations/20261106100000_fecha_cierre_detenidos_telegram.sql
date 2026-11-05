-- 06/11/2026 · Fecha probable de cierre de negociación (alta, edición y Forecast), ¿Dónde podríamos estar? sin detenidos,
-- y Telegram: /cancelar fuera del menú y de los mensajes (sigue funcionando si alguien lo escribe) y colores en Cerrar y Delegar.
-- Después de aplicar, Vicky corre una vez: select crm_giwa.telegram_conectar();
set role crm_giwa_dev;

alter table crm_giwa.proyectos add column if not exists fecha_cierre_probable date;

do $$
declare o text; n text; f record;
begin
  -- Alta rápida: la fecha es obligatoria
  select pg_get_functiondef(p.oid) into o from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'crm_giwa' and p.proname = 'alta_proyecto_rapido';
  n := replace(o, 'if fp is null then raise exception ''Falta el modo de pago''; end if;',
    'if fp is null then raise exception ''Falta el modo de pago''; end if;' || E'\n  ' || 'if nullif(p ->> ''fecha_cierre'', '''') is null then raise exception ''Falta la fecha probable de cierre''; end if;');
  n := replace(n, 'did := crm_giwa.proximo_id(', 'update crm_giwa.proyectos set fecha_cierre_probable = (p ->> ''fecha_cierre'')::date where id = pid;' || E'\n  ' || 'did := crm_giwa.proximo_id(');
  if n = o then raise exception 'alta_proyecto_rapido sin cambios'; end if;
  execute n;
  -- Editar proyecto
  select pg_get_functiondef(p.oid) into o from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'crm_giwa' and p.proname = 'editar_proyecto';
  n := replace(o, 'fecha_propuesta   = coalesce(', 'fecha_cierre_probable = case when p ? ''fecha_cierre'' then nullif(p ->> ''fecha_cierre'', '''')::date else fecha_cierre_probable end,' || E'\n    ' || 'fecha_propuesta   = coalesce(');
  if n = o then raise exception 'editar_proyecto sin cambios'; end if;
  execute n;
  -- Cotizador: sólo este campo
  select pg_get_functiondef(p.oid) into o from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'crm_giwa' and p.proname = 'cot_guardar';
  n := replace(o, 'borr := est = ''Borrador'';', 'if d ? ''fecha_cierre'' then update crm_giwa.proyectos set fecha_cierre_probable = nullif(d ->> ''fecha_cierre'', '''')::date where id = pid; end if;' || E'\n  ' || 'borr := est = ''Borrador'';');
  if n = o then raise exception 'cot_guardar sin cambios'; end if;
  execute n;
  select pg_get_functiondef(p.oid) into o from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'crm_giwa' and p.proname = 'cot_leer';
  n := replace(o, '''fecha'', p.creado::date,', '''fecha'', p.creado::date, ''fecha_cierre'', p.fecha_cierre_probable,');
  if n = o then raise exception 'cot_leer sin cambios'; end if;
  execute n;
  -- ¿Dónde podríamos estar?: sin detenidos. Si se reanuda, vuelve solo
  o := pg_get_viewdef('crm_giwa.v_fin_escenarios'::regclass, true);
  n := replace(o, 'WHERE una_vez > 0::numeric OR por_mes > 0::numeric', 'WHERE (una_vez > 0::numeric OR por_mes > 0::numeric) AND origen <> ''detenido''::text');
  if n = o then raise exception 'v_fin_escenarios sin cambios'; end if;
  execute 'create or replace view crm_giwa.v_fin_escenarios with (security_invoker = true) as ' || n;
  -- Telegram: colores
  select pg_get_functiondef(p.oid) into o from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'crm_giwa' and p.proname = '_tg_botones';
  n := replace(replace(o, 'crm_giwa._tg_btn(''Cerrar'', ''c|'' || tid)', '(crm_giwa._tg_btn(''Cerrar'', ''c|'' || tid) || ''{"style":"success"}''::jsonb)'),
               'crm_giwa._tg_btn(''Delegar'', ''d|'' || tid)', '(crm_giwa._tg_btn(''Delegar'', ''d|'' || tid) || ''{"style":"primary"}''::jsonb)');
  if n = o then raise exception '_tg_botones sin cambios'; end if;
  execute n;
  -- Telegram: /cancelar fuera de los mensajes y del menú
  for f in select p.oid from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'crm_giwa' and p.prosrc like '%, o /cancelar para salir%' loop
    execute replace(pg_get_functiondef(f.oid), ', o /cancelar para salir', '');
  end loop;
  select pg_get_functiondef(p.oid) into o from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'crm_giwa' and p.proname = 'telegram_conectar';
  n := regexp_replace(o, ',\s*jsonb_build_object\(''command'', ''cancelar'', ''description'', ''[^'']*''\)', '');
  if n = o then raise exception 'telegram_conectar sin cambios'; end if;
  execute n;
end $$;

-- Forecast: el cierre es la fecha probable; sin ella, la regla de siempre
create or replace view crm_giwa.v_fin_ventas_mes with (security_invoker = true) as
with e as (
  select proy_id, origen, una_vez, por_mes from crm_giwa.v_fin_escenarios
  union all
  select proy_id, origen, una_vez, por_mes from crm_giwa.v_fin_no_aceptados
), b as (
  select e.proy_id, e.origen, coalesce(e.una_vez, 0) as venta, coalesce(e.por_mes, 0) as fee,
         case when e.origen = 'pipeline' then coalesce(p.probabilidad, 0) else 0 end as prob,
         greatest((date_trunc('month', crm_giwa.hoy()) + interval '1 month')::date,
                  date_trunc('month', case when e.origen = 'pipeline' then coalesce(pr.fecha_cierre_probable, coalesce(p.fecha_propuesta::date, crm_giwa.hoy()) + 60)
                                           else crm_giwa.hoy() end)::date) as cierre
    from e left join crm_giwa.v_proyectos_clasif p on p.id = e.proy_id
           left join crm_giwa.proyectos pr on pr.id = e.proy_id
)
select * from (
  select b.proy_id, m.orden, m.mes, b.prob,
         round(case when b.origen = 'detenido' then case when m.mes = b.cierre then b.venta else 0 end
                    when m.mes = b.cierre or m.mes = (b.cierre + interval '2 months')::date then b.venta / 2
                    else 0 end) as venta,
         case when m.mes >= b.cierre then b.fee else 0 end as fee
    from b cross join crm_giwa.v_proyeccion_12m m
) x where venta > 0 or fee > 0;
grant select on crm_giwa.v_fin_ventas_mes to authenticated;
notify pgrst, 'reload schema';
reset role;
