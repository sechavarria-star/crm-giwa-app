-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · Diagnóstico, Usuarios, Impuestos y BCRA · 29/10/2026
-- ──────────────────────────────────────────────────────────────────────
-- v_monotributo: lo facturado en 12 meses cuenta sólo comprobantes (facturas
--   y notas de crédito). «Registrar pago» deja filas «Sin comprobante» que
--   inflaban el total ($ 5 M al 29/10).
-- bcra_procesar: el TC del mes en curso y del anterior se pisa con el último
--   del mes (antes quedaba el del primer día que se cargó).
-- v_diag_alertas: las alertas que están mal, para Configuración › Diagnóstico.
-- telegram_resumen_mio(): el resumen diario, sólo para quien lo pide (prueba).
-- guardar_usuario(p): sólo Administración. La tabla usuarios se lee con el
--   equipo y se escribe sólo por esta función.
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;
set search_path = crm_giwa, public;

-- ── Impuestos ──────────────────────────────────────────────────────────
create or replace view crm_giwa.v_monotributo with (security_invoker = true) as
with yo as (select crm_giwa.mi_mail() as mail),
f as (select coalesce(sum(d.monto), 0) as fact12
        from crm_giwa.cobros c join crm_giwa.v_cobros_det d on d.id = c.id, yo
       where crm_giwa.norm_mail(c.factura_owner) = yo.mail
         and coalesce(c.tipo_comprobante, '') !~* 'sin comprobante'
         and c.comprobante_fecha >= (date_trunc('month', crm_giwa.hoy()) - interval '11 months')::date),
cat as (select i.categoria, i.ingresos_brutos as limite, i.total_servicios as mensual, i.orden,
               crm_giwa.norm_mail(coalesce(i.monotributo_unificado, '')) = (select mail from yo) as mia
          from crm_giwa.impuestos i where coalesce(i.ingresos_brutos, 0) > 0),
sug as (select coalesce((select categoria from cat, f where limite >= f.fact12 order by limite limit 1),
                        (select categoria from cat order by limite desc limit 1)) as categoria)
select cat.categoria, cat.limite, cat.mensual, cat.mia, cat.categoria = sug.categoria as sugerida,
       f.fact12, (select mail from yo) as mail, cat.orden
  from cat, f, sug;

-- ── BCRA: el TC del mes que corre se actualiza ─────────────────────────
-- OJO: bcra_procesar es de postgres. Este bloque lo corre Vicky en el SQL Editor
-- de Supabase (crm_giwa_dev no puede reemplazarla).
reset role;
create or replace function crm_giwa.bcra_procesar() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r record; det jsonb; n_tc int := 0; n_ipc int := 0;
  abierto date := (date_trunc('month', current_date) - interval '1 month')::date;   -- mes anterior y el que corre
begin
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
            tc  = case when crm_giwa.indices_ipc.mes >= abierto then coalesce(excluded.tc, crm_giwa.indices_ipc.tc)
                       else coalesce(crm_giwa.indices_ipc.tc, excluded.tc) end;
      get diagnostics n_ipc = row_count;
    end if;
    update crm_giwa.bcra_pedidos set procesado = now(), estado = 'ok' where id = r.id;
  end loop;
  -- el mes que corre todavía no tiene IPC: su TC se sigue igual con el último del mes
  update crm_giwa.indices_ipc i set tc = t.valor
    from (select distinct on (date_trunc('month', fecha)) date_trunc('month', fecha)::date mes, valor
            from crm_giwa.tipo_cambio where fecha >= abierto order by date_trunc('month', fecha), fecha desc) t
   where i.mes = t.mes and i.tc is distinct from t.valor;
  update crm_giwa.bcra_pedidos set procesado = now(), estado = 'sin respuesta'
  where procesado is null and pedido < now() - interval '1 hour';
  return jsonb_build_object('tipo_cambio', n_tc, 'indices_ipc', n_ipc);
end $$;

set role crm_giwa_dev;

-- ── Diagnóstico de alertas ─────────────────────────────────────────────
create or replace view crm_giwa.v_diag_alertas with (security_invoker = true) as
with ab as (
  select t.id, t.titulo, t.responsable, t.vencimiento, crm_giwa.cat_admin(t.titulo, t.alerta_tipo) cat,
         (crm_giwa.refs_tarea(t.proyecto_id, t.desarrollo_id)).iids[1] item
    from crm_giwa.tareas t
   where coalesce(t.tipo, '') ~* 'administr' and crm_giwa.canon_tarea(t.estado) not in ('finalizada', 'cancelada')),
fact as (select item_id from crm_giwa.v_facturar_mensuales union select item_id from crm_giwa.v_facturar_saldos)
select 'Duplicada' as problema, a.id, a.titulo, a.item,
       'Hay ' || count(*) over (partition by a.cat, a.item) || ' alertas abiertas de lo mismo' as detalle
  from ab a where a.item is not null
   and (select count(*) from ab b where b.cat = a.cat and b.item = a.item) > 1
union all
select 'Sin nada para facturar', a.id, a.titulo, a.item, 'El desarrollo ya no tiene saldo ni abono por facturar'
  from ab a where a.cat = 'factur' and a.item is not null and a.item not in (select item_id from fact)
union all
select 'Sin responsable', a.id, a.titulo, a.item, 'Nadie la va a ver en Hoy'
  from ab a where coalesce(trim(a.responsable), '') = ''
union all
select 'Falta la alerta', null, 'Facturación · ' || coalesce(f.empresa, '') || ' · ' || coalesce(f.titulo, ''), f.item_id,
       'Tiene algo para facturar y ninguna alerta lo avisa'
  from (select item_id, empresa, titulo from crm_giwa.v_facturar_mensuales
        union select item_id, empresa, titulo from crm_giwa.v_facturar_saldos) f
 where f.item_id not in (select item from crm_giwa.v_reglas_facturacion where item is not null)
   and f.item_id not in (select item from crm_giwa.v_cobertura_facturacion where tipo = 'cubierto' and item is not null);

-- ── Telegram: el resumen sólo para mí ──────────────────────────────────
create or replace function crm_giwa._tg_resumen(solo text) returns jsonb
language plpgsql security definer set search_path = crm_giwa, public as $$
declare u record; txt text; n int := 0; adm text := crm_giwa.norm_mail(crm_giwa.mail_admin());
begin
  if not exists (select 1 from crm_giwa.secretos where clave = 'telegram_bot_token') then return jsonb_build_object('ok', false, 'msg', 'Falta el token'); end if;
  for u in select nombre, crm_giwa.norm_mail(mail) mail, telegram from crm_giwa.usuarios
            where es_giwa and activo and coalesce(telegram, '') <> ''
              and (solo is null or crm_giwa.norm_mail(mail) = solo) order by orden loop
    select string_agg(
             case when t.overdue then 'VENCIDA · ' else '' end || crm_giwa._tg_esc(coalesce(nullif(t.alert_type, ''), 'Administración')) ||
             ' · ' || crm_giwa._tg_esc(t.title) || case when coalesce(t.client_name, '') <> '' then ' · ' || crm_giwa._tg_esc(t.client_name) else '' end ||
             ' · vence ' || to_char(t.due, 'DD/MM/YYYY'),
             E'\n' order by t.due)
      into txt
      from crm_giwa.v_tareas t
     where not coalesce(t.closed, false) and not coalesce(t.hidden, false) and coalesce(t.dup_of, '') = '' and t.due is not null
       and (t.type ~* 'administr' or coalesce(t.channels, '') ~* 'telegram')
       and u.mail = any (case when coalesce(t.assignees, '') = '' then array[adm]
                              else array(select crm_giwa.norm_mail(x) from unnest(crm_giwa.lista_csv(t.assignees)) x) end);
    if txt is null and solo is not null then txt := 'Sin recordatorios pendientes.'; end if;   -- la prueba siempre llega
    continue when txt is null;
    perform crm_giwa._tg_llamar('sendMessage', jsonb_build_object('chat_id', u.telegram, 'parse_mode', 'HTML',
      'text', '<b>Recordatorios · ' || to_char(crm_giwa.hoy(), 'DD/MM/YYYY') || '</b>' || E'\n' || txt), 'resumen', u.mail);
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'enviados', n);
end $$;
revoke all on function crm_giwa._tg_resumen(text) from public, anon, authenticated;

create or replace function crm_giwa.telegram_resumen_diario() returns jsonb
language sql security definer set search_path = crm_giwa, public as $$ select crm_giwa._tg_resumen(null) $$;

create or replace function crm_giwa.telegram_resumen_mio() returns jsonb
language plpgsql security definer set search_path = crm_giwa, public as $$
declare r jsonb;
begin
  if not crm_giwa.es_equipo() then raise exception 'Sin permiso'; end if;
  if not exists (select 1 from crm_giwa.usuarios where crm_giwa.norm_mail(mail) = crm_giwa.mi_mail() and coalesce(telegram, '') <> '') then
    return jsonb_build_object('ok', false, 'msg', 'No tenés chat de Telegram cargado en Usuarios.'); end if;
  r := crm_giwa._tg_resumen(crm_giwa.mi_mail());
  return r || jsonb_build_object('msg', case when (r ->> 'ok')::boolean then 'Resumen enviado: mirá Telegram.' else r ->> 'msg' end);
end $$;

-- ── Usuarios: escribe sólo Administración ──────────────────────────────
create or replace function crm_giwa.guardar_usuario(p jsonb) returns jsonb
language plpgsql security definer set search_path = crm_giwa, public as $$
declare v_mail text := crm_giwa.norm_mail(p ->> 'mail'); uid text := nullif(trim(coalesce(p ->> 'id', '')), '');
begin
  if not crm_giwa.es_admin() then raise exception 'Sólo Administración puede cambiar usuarios.'; end if;
  if coalesce(trim(p ->> 'nombre'), '') = '' then raise exception 'Falta el nombre'; end if;
  if coalesce(v_mail, '') !~ '@' then raise exception 'Falta un mail válido'; end if;
  if exists (select 1 from crm_giwa.usuarios u where crm_giwa.norm_mail(u.mail) = v_mail and u.id is distinct from uid) then
    raise exception 'Ya hay un usuario con ese mail'; end if;
  if uid is null then
    -- mismo formato que los que ya están (D1, S2, V3): inicial + número
    uid := upper(left(trim(p ->> 'nombre'), 1)) || ((select count(*) from crm_giwa.usuarios) + 1);
    while exists (select 1 from crm_giwa.usuarios u where u.id = uid) loop uid := uid || 'b'; end loop;
    insert into crm_giwa.usuarios (id, nombre, mail, es_giwa, activo, orden) values (uid, trim(p ->> 'nombre'), v_mail, true, true,
      coalesce((select max(u.orden) from crm_giwa.usuarios u), 0) + 1);
  end if;
  update crm_giwa.usuarios u set
    nombre     = trim(p ->> 'nombre'),
    mail       = v_mail,
    rol        = coalesce(p ->> 'rol', u.rol),
    es_giwa    = coalesce((p ->> 'es_giwa')::boolean, u.es_giwa),
    factura    = coalesce((p ->> 'factura')::boolean, u.factura),
    telegram   = coalesce(trim(p ->> 'telegram'), u.telegram),
    calendario = coalesce(trim(p ->> 'calendario'), u.calendario),
    activo     = coalesce((p ->> 'activo')::boolean, u.activo)
  where u.id = uid;
  return jsonb_build_object('ok', true, 'id', uid);
end $$;

drop policy if exists equipo on crm_giwa.usuarios;
create policy equipo on crm_giwa.usuarios for select to authenticated using ((select crm_giwa.es_equipo()));

grant select on crm_giwa.v_diag_alertas, crm_giwa.v_monotributo to authenticated;
grant execute on function crm_giwa.telegram_resumen_mio(), crm_giwa.guardar_usuario(jsonb), crm_giwa.sincronizar_alertas_facturacion() to authenticated;
revoke execute on function crm_giwa.telegram_resumen_diario() from public, anon, authenticated;
