-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · Pagos a proveedores y sus alertas · 14/11/2026
-- ──────────────────────────────────────────────────────────────────────
--   proveedores        + exterior (sin CUIT, por razón social) y medio_pago
--                        (Transferencia · Tarjeta · Débito automático).
--   gastos_internos    + vence y pagado. «A pagar» = gasto con proveedor, con
--                        vencimiento y sin pago. Con tarjeta o débito automático
--                        nace pagado. Los gastos de antes no cambian (no quedan a pagar).
--   guardar_gasto      resuelve el proveedor (CUIT o, del exterior, razón social),
--                        el medio de pago, el vencimiento (factura, o fecha + dias_pago_proveedor)
--                        y pone al día la alerta.
--   _alerta_pago_gasto una alerta «Pago a proveedor» por gasto a pagar (Administración);
--                        se cierra sola con el pago. Al borrar el gasto se borra, con auditoría.
--   registrar_pago_gasto(ids, fecha)  · deshacer: + gastos_internos y tareas.
--   v_gastos_plata, v_proveedores: + lo de pagos.
--   Los 6 proveedores del exterior que ya se pagan con tarjeta.
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

-- ── proveedores ──
alter table crm_giwa.proveedores alter column cuit drop not null;
alter table crm_giwa.proveedores add column if not exists exterior boolean not null default false;
alter table crm_giwa.proveedores add column if not exists medio_pago text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'proveedores_cuit_o_exterior') then
    alter table crm_giwa.proveedores add constraint proveedores_cuit_o_exterior check (cuit is not null or exterior);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'proveedores_medio_ok') then
    alter table crm_giwa.proveedores add constraint proveedores_medio_ok check (medio_pago in ('Transferencia', 'Tarjeta', 'Débito automático'));
  end if;
end $$;
create unique index if not exists proveedores_exterior_nombre on crm_giwa.proveedores (lower(btrim(razon_social))) where cuit is null;

-- ── gastos: vencimiento y pago ──
alter table crm_giwa.gastos_internos add column if not exists vence date;
alter table crm_giwa.gastos_internos add column if not exists pagado date;

-- Proveedor del exterior por nombre: «Supabase, Inc.» es «Supabase»
create or replace function crm_giwa._proveedor_exterior(nombre text) returns text
language sql stable as $$
  select v.id from crm_giwa.proveedores v
   where v.cuit is null and btrim(coalesce(nombre, '')) <> ''
     and (lower(btrim(nombre)) = lower(btrim(v.razon_social)) or lower(btrim(nombre)) like lower(btrim(v.razon_social)) || '%')
   order by length(v.razon_social) desc limit 1
$$;

-- ── la alerta de un gasto: crearla, moverla o cerrarla ──
create or replace function crm_giwa._alerta_pago_gasto(gid text) returns void
language plpgsql volatile as $$
declare g record; tid text; adm text; tit text;
begin
  select x.*, coalesce(v.razon_social, '') as prov into g
    from crm_giwa.gastos_internos x left join crm_giwa.proveedores v on v.id = x.proveedor_id where x.id = gid;
  if not found then return; end if;
  select t.id into tid from crm_giwa.tareas t
   where t.origen = gid and t.alerta_tipo = 'Pago a proveedor' and crm_giwa.canon_tarea(t.estado) not in ('finalizada', 'cancelada')
   order by t.id limit 1;
  if g.proveedor_id is not null and g.pagado is null and g.vence is not null then
    tit := 'Pago a proveedor · ' || g.prov || coalesce(' · ' || nullif(trim(coalesce(g.datos_fc ->> 'tipo', '') || ' ' || coalesce(g.datos_fc ->> 'numero', '')), ''), '');
    if tid is null then
      adm := coalesce((select u.mail from crm_giwa.usuarios u where u.activo and u.es_giwa and u.rol ~* 'administr' order by u.orden limit 1), crm_giwa.mi_mail());
      perform crm_giwa._alta_tarea(jsonb_build_object('type', 'Administración', 'title', tit,
        'detail', g.descripcion || ' · ' || g.moneda || ' ' || to_char(case when g.moneda = 'USD' then g.monto_usd else g.monto_ars end, 'FM999G999G990D00') ||
                  '. Se cierra sola al registrar el pago del gasto.',
        'assignees', adm, 'due', g.vence::text, 'frequency', 'Única', 'alertType', 'Pago a proveedor', 'origin', gid));
    else
      update crm_giwa.tareas set vencimiento = g.vence, titulo = tit where id = tid;
    end if;
  elsif tid is not null then
    update crm_giwa.tareas set estado = 'Finalizada', enviada = true where id = tid;
    perform crm_giwa._comentar_tarea(tid, case when g.pagado is not null then 'Cerrada: pago registrado el ' || to_char(g.pagado, 'DD/MM/YYYY') || '.'
                                              else 'Cerrada: el gasto ya no está a pagar.' end);
  end if;
end $$;

-- ── guardar_gasto: lo de antes + exterior, medio de pago, vencimiento y alerta ──
create or replace function crm_giwa.guardar_gasto(p jsonb) returns jsonb
language plpgsql volatile as $$
declare
  gid    text := nullif(trim(coalesce(p ->> 'id', '')), '');
  v_fecha date := coalesce(nullif(p ->> 'fecha', '')::date, crm_giwa.hoy());
  mon    text := case when upper(coalesce(p ->> 'moneda', 'ARS')) like '%USD%' then 'USD' else 'ARS' end;
  monto  numeric := coalesce(nullif(p ->> 'monto', '')::numeric, 0);
  tc     numeric := coalesce(nullif(crm_giwa.tc_de_fecha(v_fecha), 0), nullif(crm_giwa.num_ar((select valor from crm_giwa.cot_config where clave = 'tc_default')), 0), 1200);
  ars numeric; usd numeric;
  frec   text := coalesce(nullif(p ->> 'frecuencia', ''), 'Mensual');
  con    text := nullif(trim(coalesce(p ->> 'contratacion', '')), '');
  datos  jsonb := case when jsonb_typeof(p -> 'datos_fc') = 'object' then p -> 'datos_fc' end;
  link   text := nullif(trim(coalesce(p ->> 'link_fc', '')), '');
  pcuit  text := nullif(regexp_replace(coalesce(p #>> '{proveedor,cuit}', ''), '\D', '', 'g'), '');
  prs    text := nullif(btrim(coalesce(p #>> '{proveedor,razon_social}', '')), '');
  medio  text := nullif(btrim(coalesce(p ->> 'medio_pago', '')), '');
  v_vence date := nullif(p ->> 'vence', '')::date;
  prv    text; viejo crm_giwa.gastos_internos; v_pag date; v_vto date;
begin
  if trim(coalesce(p ->> 'descripcion', '')) = '' then raise exception 'Descripción obligatoria'; end if;
  if not exists (select 1 from crm_giwa.contrataciones where id = con) then
    raise exception 'Elegí la contratación del gasto'; end if;
  if medio is not null and medio not in ('Transferencia', 'Tarjeta', 'Débito automático') then raise exception 'Medio de pago desconocido: %', medio; end if;
  if pcuit is not null then
    if length(pcuit) <> 11 then raise exception 'El CUIT del proveedor tiene que tener 11 dígitos'; end if;
    insert into crm_giwa.proveedores (cuit, razon_social, condicion_iva, contratacion_id, medio_pago)
    values (pcuit, coalesce(prs, pcuit), nullif(trim(coalesce(p #>> '{proveedor,condicion_iva}', '')), ''), con, medio)
    on conflict (cuit) do update set contratacion_id = excluded.contratacion_id, actualizado = now(),
      condicion_iva = coalesce(crm_giwa.proveedores.condicion_iva, excluded.condicion_iva),
      medio_pago = coalesce(excluded.medio_pago, crm_giwa.proveedores.medio_pago)
    returning id into prv;
  elsif prs is not null then                      -- del exterior: sin CUIT, por razón social
    prv := crm_giwa._proveedor_exterior(prs);
    if prv is null then
      insert into crm_giwa.proveedores (cuit, razon_social, exterior, contratacion_id, medio_pago)
      values (null, prs, true, con, medio) returning id into prv;
    else
      update crm_giwa.proveedores set contratacion_id = con, medio_pago = coalesce(medio, medio_pago), actualizado = now() where id = prv;
    end if;
  end if;
  if prv is not null and coalesce(datos ->> 'numero', '') <> '' and exists (select 1 from crm_giwa.gastos_internos g
       where g.proveedor_id = prv and g.id is distinct from gid
         and lower(coalesce(g.datos_fc ->> 'tipo', '')) = lower(coalesce(datos ->> 'tipo', ''))
         and crm_giwa.nro_comp_norm(g.datos_fc ->> 'numero') = crm_giwa.nro_comp_norm(datos ->> 'numero')) then
    raise exception '% % de este proveedor ya está cargada', coalesce(datos ->> 'tipo', 'El comprobante'), datos ->> 'numero'; end if;
  if mon = 'USD' then usd := monto; ars := round(monto * tc); else ars := monto; usd := case when tc > 0 then round(monto / tc) else 0 end; end if;
  frec := case when frec ~* 'anual' then 'Anual' when frec ~* '[uú]nic' then 'Único' else 'Mensual' end;
  select * into viejo from crm_giwa.gastos_internos where id = gid;
  prv := coalesce(prv, viejo.proveedor_id);
  v_pag := viejo.pagado; v_vto := coalesce(v_vence, viejo.vence);
  if prv is not null then                         -- sólo los gastos con proveedor se pagan y vencen
    medio := coalesce(medio, (select medio_pago from crm_giwa.proveedores where id = prv), 'Transferencia');
    if medio in ('Tarjeta', 'Débito automático') then v_pag := coalesce(v_pag, v_fecha); v_vto := null;
    elsif v_pag is null then v_vto := coalesce(v_vto, v_fecha + crm_giwa.umbral('dias_pago_proveedor', 30)::int); end if;
  end if;
  if viejo.id is not null then
    update crm_giwa.gastos_internos set fecha = v_fecha, categoria = coalesce(p ->> 'categoria', ''),
      descripcion = trim(p ->> 'descripcion'), moneda = mon, monto_ars = ars, monto_usd = usd, recurrencia = frec,
      prorratear = coalesce((p ->> 'prorratear')::boolean, false), contratacion_id = con,
      pagador = coalesce(nullif(crm_giwa.norm_mail(p ->> 'pagador'), ''), nullif(crm_giwa.mi_mail(), '')), creador = nullif(crm_giwa.mi_mail(), ''),
      proveedor_id = prv, datos_fc = coalesce(datos, datos_fc), link_fc = coalesce(link, link_fc), vence = v_vto, pagado = v_pag
    where id = gid;
  else
    gid := crm_giwa.proximo_id('G', 'gastos_internos', 4);
    insert into crm_giwa.gastos_internos (id, fecha, categoria, descripcion, moneda, monto_ars, monto_usd, recurrencia, prorratear,
                                          contratacion_id, pagador, creador, proveedor_id, datos_fc, link_fc, vence, pagado)
    values (gid, v_fecha, coalesce(p ->> 'categoria', ''), trim(p ->> 'descripcion'), mon, ars, usd, frec,
            coalesce((p ->> 'prorratear')::boolean, false), con,
            coalesce(nullif(crm_giwa.norm_mail(p ->> 'pagador'), ''), nullif(crm_giwa.mi_mail(), '')), nullif(crm_giwa.mi_mail(), ''),
            prv, datos, link, v_vto, v_pag);
  end if;
  perform crm_giwa._alerta_pago_gasto(gid);
  return jsonb_build_object('ok', true, 'id', gid);
end $$;

-- ── Registrar el pago de uno o varios gastos ──
create or replace function crm_giwa.registrar_pago_gasto(ids text[], fecha date) returns jsonb
language plpgsql volatile as $$
declare x text; n int := 0;
begin
  if fecha is null then raise exception 'Falta la fecha del pago'; end if;
  foreach x in array coalesce(ids, '{}') loop
    update crm_giwa.gastos_internos set pagado = registrar_pago_gasto.fecha where id = x and pagado is null and proveedor_id is not null;
    if found then n := n + 1; perform crm_giwa._alerta_pago_gasto(x); end if;
  end loop;
  if n = 0 then raise exception 'No había nada a pagar'; end if;
  return jsonb_build_object('ok', true, 'pagados', n);
end $$;

-- ── Borrar un gasto: su alerta abierta también, con auditoría (alertas sin fantasmas) ──
create or replace function crm_giwa.borrar_gasto(gid text) returns jsonb
language plpgsql volatile as $$
begin
  insert into crm_giwa.admin_auditoria (cuando, quien, tabla, registro, accion, antes, despues, motivo)
  select now(), crm_giwa.mi_mail(), 'tareas', t.id, 'borrar', to_jsonb(t), null, 'Se borró el gasto ' || trim(gid)
    from crm_giwa.tareas t where t.origen = trim(gid) and t.alerta_tipo = 'Pago a proveedor' and crm_giwa.canon_tarea(t.estado) not in ('finalizada', 'cancelada');
  delete from crm_giwa.tareas t where t.origen = trim(gid) and t.alerta_tipo = 'Pago a proveedor' and crm_giwa.canon_tarea(t.estado) not in ('finalizada', 'cancelada');
  delete from crm_giwa.gastos_internos where id = trim(gid);
  return jsonb_build_object('ok', true);
end $$;

-- ── deshacer: también gastos y tareas (Registrar pago de un gasto) ──
do $$
declare o text := pg_get_functiondef('crm_giwa.deshacer_foto(text,text,text[],boolean)'::regprocedure); n text;
begin
  n := replace(o, $a$tabla not in ('cobros', 'desarrollos', 'proyectos')$a$, $a$tabla not in ('cobros', 'desarrollos', 'proyectos', 'gastos_internos', 'tareas')$a$);
  if n = o then raise exception 'No encontré la lista de tablas de deshacer_foto'; end if;
  execute n;
end $$;

-- ── vistas ──
create or replace view crm_giwa.v_gastos_plata with (security_invoker = true) as
 WITH g AS (
         SELECT g.id, g.fecha, g.categoria, g.tipo, g.mes, g.descripcion, g.moneda, g.monto_ars, g.monto_usd, g.recurrencia, g.prorratear,
            g.pagador, g.creador, g.contratacion_id, g.creado, g.actualizado, g.orden,
            crm_giwa.tc_de_fecha(g.fecha) AS tc,
            to_char(COALESCE(g.mes, g.fecha)::timestamp with time zone, 'YYYY-MM'::text) AS mes_key,
            g.proveedor_id, g.vence, g.pagado, g.link_fc
           FROM crm_giwa.gastos_internos g
        ), x AS (
         SELECT g.*,
            crm_giwa.norm((COALESCE(g.categoria, ''::text) || ' '::text) || COALESCE(g.descripcion, ''::text)) ~ '(impuesto|monotrib|arca|afip|ingresos brutos|iibb|retenc)'::text AS es_impuesto
           FROM g
        )
 SELECT id, fecha, categoria, tipo, descripcion, moneda, recurrencia, prorratear, pagador, contratacion_id, mes_key, tc,
        CASE
            WHEN COALESCE(monto_ars, 0::numeric) = 0::numeric AND COALESCE(monto_usd, 0::numeric) <> 0::numeric THEN round(monto_usd * tc)
            ELSE COALESCE(monto_ars, 0::numeric)
        END AS monto_ars,
        CASE
            WHEN COALESCE(monto_usd, 0::numeric) = 0::numeric AND COALESCE(monto_ars, 0::numeric) <> 0::numeric AND tc > 0::numeric THEN round(monto_ars / tc, 2)
            ELSE COALESCE(monto_usd, 0::numeric)
        END AS monto_usd,
    es_impuesto,
    NOT es_impuesto OR crm_giwa.norm(COALESCE(descripcion, ''::text)) ~ 'monotrib'::text AND (EXISTS ( SELECT 1
           FROM crm_giwa.usuarios u
          WHERE u.monotributo_giwa AND crm_giwa.norm_mail(u.mail) = crm_giwa.norm_mail(x.pagador))) AS costo_giwa,
    proveedor_id, vence, pagado, link_fc,
    (proveedor_id IS NOT NULL AND pagado IS NULL AND vence IS NOT NULL) AS a_pagar
   FROM x;

create or replace view crm_giwa.v_proveedores with (security_invoker = true) as
select v.id, v.razon_social, coalesce(v.cuit, '') as cuit, coalesce(v.condicion_iva, '') as condicion_iva,
       v.contratacion_id, coalesce(k.producto, '') as contratacion,
       count(g.id) as facturas, coalesce(sum(g.monto_ars), 0) as total_ars, max(g.fecha) as ultima,
       v.exterior, coalesce(v.medio_pago, '') as medio_pago,
       coalesce(sum(g.monto_ars) filter (where g.pagado is null and g.vence is not null), 0) as a_pagar_ars,
       min(g.vence) filter (where g.pagado is null and g.vence is not null) as proximo_vence
from crm_giwa.proveedores v
left join crm_giwa.contrataciones k on k.id = v.contratacion_id
left join crm_giwa.gastos_internos g on g.proveedor_id = v.id
group by v.id, k.producto;

grant select on crm_giwa.v_gastos_plata, crm_giwa.v_proveedores to authenticated;
grant execute on function crm_giwa.registrar_pago_gasto(text[], date) to authenticated;

-- ── Configuración: los días para pagar se editan en Listas › Cobros y gastos; el tipo de alerta nuevo ──
do $$
declare o text := pg_get_functiondef('crm_giwa.config_editables()'::regprocedure); n text;
begin
  n := replace(o, $a$'target_fee_mensual','target_proyectos_mes']$a$, $a$'target_fee_mensual','target_proyectos_mes','dias_pago_proveedor']$a$);
  if n = o then raise exception 'No encontré la lista de números de config_editables'; end if;
  execute n;
end $$;
update crm_giwa.cot_config set valor = valor || ',Pago a proveedor'
 where clave = 'Tarea_AlertaTipo' and position('Pago a proveedor' in valor) = 0;

-- ── Los que ya se pagan con tarjeta (gastos vigentes al 14/11/2026). La razón social
--    se completa con la primera factura: «Supabase, Inc.» se reconoce como «Supabase». ──
insert into crm_giwa.proveedores (cuit, razon_social, exterior, medio_pago, contratacion_id)
select null, x.n, true, 'Tarjeta', x.c from (values ('OpenAI', 'CONT-017'), ('Anthropic', 'CONT-038'), ('Google', 'CONT-006'),
                                               ('Meta', 'CONT-031'), ('n8n', 'CONT-009'), ('Supabase', 'CONT-005')) x(n, c)
where crm_giwa._proveedor_exterior(x.n) is null;

reset role;
