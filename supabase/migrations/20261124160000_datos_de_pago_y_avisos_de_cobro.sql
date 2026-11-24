-- Pedido de Vicky, 24/11/2026
-- 1 · Usuarios: titular, CUIT, banco, CBU y alias. El mail de la factura los toma de quien la emite. guardar_usuario valida el CUIT.
-- 2 · Al registrar un depósito se comenta en la alerta de Facturación, con mención a los otros dos; al transferirle al
--     socio, sólo a quien le corresponde (reparto 50/50: Diego | Sebastián y Victoria). Sin tareas nuevas ni mails.
--     Si el aviso falla, el pago se registra igual y el mensaje lo dice.
-- 3 · La alerta de Facturación de un desarrollo con saldo no se cierra al facturar una cuota: pasa al mes siguiente.
--     Se reabren las de URBA y Prodigy Lector, que se cerraron con la primera de dos cuotas.
set role crm_giwa_dev;
set search_path = crm_giwa, public;

-- ── 1 · Usuarios ──
alter table crm_giwa.usuarios add column if not exists titular text;
alter table crm_giwa.usuarios add column if not exists cuit text;
alter table crm_giwa.usuarios add column if not exists banco text;
alter table crm_giwa.usuarios add column if not exists cbu text;
alter table crm_giwa.usuarios add column if not exists alias text;

create or replace function crm_giwa.cuit_ok(c text) returns boolean
language sql immutable as $function$
  with n as (select regexp_replace(coalesce(c, ''), '[^0-9]', '', 'g') d)
  select case when n.d !~ '^[0-9]{11}$' then false else
    (select (11 - sum(substr(n.d, i, 1)::int * (array[5,4,3,2,7,6,5,4,3,2])[i]) % 11) % 11 from generate_series(1, 10) i) = substr(n.d, 11, 1)::int end
  from n
$function$;

do $$
declare o text; n text;
begin
  o := pg_get_functiondef('crm_giwa.guardar_usuario(jsonb)'::regprocedure);
  n := replace(o, $a$  if uid is null then$a$,
    $a$  if nullif(trim(coalesce(p ->> 'cuit', '')), '') is not null and not crm_giwa.cuit_ok(p ->> 'cuit') then
    raise exception 'El CUIT % no es válido: revisá los números.', trim(p ->> 'cuit'); end if;
  if uid is null then$a$);
  if n = o then raise exception 'guardar_usuario: validación'; end if; o := n;
  n := replace(o, $a$    monotributo_cat  = case$a$,
    $a$    titular    = case when p ? 'titular' then nullif(trim(p ->> 'titular'), '') else u.titular end,
    cuit       = case when p ? 'cuit' then regexp_replace(nullif(regexp_replace(p ->> 'cuit', '[^0-9]', '', 'g'), ''), '^(..)(........)(.)$', '\1-\2-\3') else u.cuit end,
    banco      = case when p ? 'banco' then nullif(trim(p ->> 'banco'), '') else u.banco end,
    cbu        = case when p ? 'cbu' then nullif(trim(p ->> 'cbu'), '') else u.cbu end,
    alias      = case when p ? 'alias' then nullif(trim(p ->> 'alias'), '') else u.alias end,
    monotributo_cat  = case$a$);
  if n = o then raise exception 'guardar_usuario: campos'; end if;
  execute n;
end $$;

-- ── 2 · Avisos de cobro y de transferencia ──
create or replace function crm_giwa._avisar_cobro(ids text[], que text, fecha date) returns boolean
language plpgsql as $function$
declare
  x record; tid text; txt text; quienes text; mails text[]; yo text := coalesce(crm_giwa.mi_mail(), '');
  plata text;
begin
  if coalesce(array_length(ids, 1), 0) = 0 then return true; end if;
  if que = 'deposito' then
    select string_agg('@' || trim(nombre), ' ' order by orden), array_agg(crm_giwa.norm_mail(mail)) into quienes, mails
      from crm_giwa.usuarios where es_giwa and activo and crm_giwa.norm_mail(mail) <> yo;
  else   -- transferencia: Diego (D1) le transfiere a Victoria (V3); Victoria o Sebastián, a Diego
    select '@' || trim(nombre), array[crm_giwa.norm_mail(mail)] into quienes, mails from crm_giwa.usuarios
     where id = case when yo = (select crm_giwa.norm_mail(mail) from crm_giwa.usuarios where id = 'D1') then 'V3' else 'D1' end and activo;
  end if;
  if quienes is null then return true; end if;
  for x in
    select v.empresa, sum(v.monto) as monto, coalesce(sum(r.socio), 0) as socio,
           array_agg(distinct v.desarrollo_id) filter (where coalesce(v.desarrollo_id, '') <> '') as devs, min(v.proyecto_id) as proy
      from crm_giwa.v_cobros_det v left join crm_giwa.v_reparto_socio r on r.id = v.id
     where v.id = any (ids) group by v.empresa
  loop
    plata := '$ ' || translate(to_char(case when que = 'deposito' then x.monto else x.socio end, 'FM999,999,999,990.00'), ',.', '.,');
    txt := quienes || case when que = 'deposito' then ' cobramos ' || plata || ' de ' || rtrim(coalesce(x.empresa, '—'), '.') || '.'
                           else ' te transferí ' || plata || ' por ' || coalesce(x.empresa, '—') || ', el ' || to_char(fecha, 'DD/MM') || '.' end;
    select t.id into tid from crm_giwa.tareas t
     where coalesce(t.tipo, '') ~* 'administr' and crm_giwa.cat_admin(t.titulo, t.alerta_tipo) = 'factur'
       and (crm_giwa.refs_tarea(t.proyecto_id, t.desarrollo_id)).iids && x.devs
       and crm_giwa.canon_tarea(t.estado) <> 'cancelada'
     order by crm_giwa.canon_tarea(t.estado) = 'finalizada', t.vencimiento desc nulls last limit 1;
    if tid is not null then
      perform crm_giwa.comentar(jsonb_build_object('tarea_id', tid, 'texto', txt));
    elsif x.proy is not null then
      perform crm_giwa.comentar(jsonb_build_object('proyecto_id', x.proy, 'texto', txt));
      perform crm_giwa._tg_avisar(mails, crm_giwa._tg_esc(crm_giwa.nombre_usuario(yo) || ': ' || txt), 'mencion');
    end if;
  end loop;
  return true;
exception when others then
  return false;
end $function$;

do $$
declare o text; n text;
begin
  o := pg_get_functiondef('crm_giwa.registrar_deposito(text[],date,date)'::regprocedure);
  n := replace(o, $a$falta text; clientes int; n_dep int := 0; n_soc int := 0;$a$,
    $a$falta text; clientes int; n_dep int := 0; n_soc int := 0; nuevos text[]; nuevos_s text[]; aviso boolean := true;$a$);
  if n = o then raise exception 'registrar_deposito: declare'; end if; o := n;
  n := replace(o, $a$  update crm_giwa.cobros set
    deposito_fecha =$a$, $a$  select array_agg(id) into nuevos from crm_giwa.cobros where id = any (ids) and deposito_fecha is null;
  update crm_giwa.cobros set
    deposito_fecha =$a$);
  if n = o then raise exception 'registrar_deposito: nuevos'; end if; o := n;
  n := replace(o, $a$    update crm_giwa.cobros set transf_fecha =$a$, $a$    select array_agg(id) into nuevos_s from crm_giwa.cobros where id = any (ids) and transf_fecha is null and deposito_fecha is not null;
    update crm_giwa.cobros set transf_fecha =$a$);
  if n = o then raise exception 'registrar_deposito: socio'; end if; o := n;
  n := replace(o, $a$  return jsonb_build_object('ok', true, 'depositos'$a$, $a$  if not crm_giwa._avisar_cobro(nuevos, 'deposito', fecha_deposito) then aviso := false; end if;
  if not crm_giwa._avisar_cobro(nuevos_s, 'socio', fecha_socio) then aviso := false; end if;
  return jsonb_build_object('ok', true, 'depositos'$a$);
  if n = o then raise exception 'registrar_deposito: aviso'; end if; o := n;
  n := replace(o, $a$else ' · lo del socio queda pendiente' end end);$a$, $a$else ' · lo del socio queda pendiente' end end ||
                case when aviso then '' else ' · no se pudo comentar el aviso' end);$a$);
  if n = o then raise exception 'registrar_deposito: mensaje'; end if;
  execute n;
end $$;

create or replace function crm_giwa.marcar_transferido_socio(ids text[], fecha date) returns jsonb
language plpgsql as $function$
declare f date := coalesce(fecha, crm_giwa.hoy()); nuevos text[]; r jsonb;
begin
  select array_agg(c.id) into nuevos from crm_giwa.cobros c where c.id = any (ids) and c.transf_fecha is null and c.deposito_fecha is not null;
  r := crm_giwa.marcar_fecha_cobros(ids, 'fecha_transf', f);
  return r || jsonb_build_object('aviso', crm_giwa._avisar_cobro(nuevos, 'socio', f));
end $function$;

-- ── 3 · Alertas de Facturación con cuotas pendientes ──
do $$
declare o text; n text;
begin
  o := pg_get_functiondef('crm_giwa._procesar_alerta(text,text)'::regprocedure);
  n := replace(o, $a$  fin := coalesce(t.fin,$a$, $a$  -- Facturación de un desarrollo con saldo: queda la próxima cuota (24/11/2026)
  if nxt is null and crm_giwa.cat_admin(t.titulo, t.alerta_tipo) = 'factur'
     and exists (select 1 from crm_giwa.v_facturar_saldos s where s.item_id = any ((crm_giwa.refs_tarea(t.proyecto_id, t.desarrollo_id)).iids)) then
    nxt := (due + interval '1 month')::date;
    if nxt <= crm_giwa.hoy() then nxt := (crm_giwa.hoy() + interval '1 month')::date; end if;
  end if;
  fin := coalesce(t.fin,$a$);
  if n = o then raise exception '_procesar_alerta'; end if;
  execute n;
end $$;

update crm_giwa.tareas t set estado = 'En progreso', enviada = false, vencimiento = (t.vencimiento + interval '1 month')::date
 where t.id in ('T-0086', 'T-0094') and crm_giwa.canon_tarea(t.estado) = 'finalizada'
   and t.desarrollo_id in (select s.item_id from crm_giwa.v_facturar_saldos s);
