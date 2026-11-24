-- El Cotizador no pisa nada (Vicky, 24/11/2026): al guardar un proyecto que ya existe escribe sólo lo que se cambió ahí.
-- cot_leer: trae el monto y el alcance actuales (no los de sus notas). El precio viene vacío sólo si sigue siendo el sugerido.
-- cot_guardar: el resumen ejecutivo es el del proyecto (d.resumen) y sólo se escribe si viene, igual que sponsors y minuta.
--   La pantalla marca por desarrollo: igual (no se toca), func_igual y ext_igual; y en mant: igual. Un estimado en 0 nunca
--   reemplaza un monto. El dólar se recalcula sólo si cambió el monto. El MMR conserva meses, nombre, IPC y hora de soporte.
-- cot_alta: anota el total para saber si el precio sigue siendo el sugerido.
set role crm_giwa_dev;

do $$
declare f text; n text;
begin
  f := pg_get_functiondef('crm_giwa.cot_leer(text)'::regprocedure);
  n := replace(f, $a$'objetivo', coalesce(m ->> 'objetivo', d.descripcion)$a$, $a$'objetivo', coalesce(d.descripcion, m ->> 'objetivo')$a$);
  if n = f then raise exception 'cot_leer: objetivo'; end if; f := n;
  n := replace(f, $a$'precio', crm_giwa.num_ar(m ->> 'precio'),$a$,
    $a$'precio', case when coalesce(d.total_ars, 0) = 0 then crm_giwa.num_ar(m ->> 'precio')
                          when coalesce(crm_giwa.num_ar(m ->> 'precio'), 0) = 0 and m ? 'total' and crm_giwa.num_ar(m ->> 'total') = d.total_ars then null   -- sigue el sugerido
                          else d.total_ars end,$a$);
  if n = f then raise exception 'cot_leer: precio'; end if;
  execute n;
  f := pg_get_functiondef('crm_giwa.cot_alta(jsonb,text)'::regprocedure);
  n := replace(f, $a$from unnest(ids) xi), 'origen', nota)::text$a$, $a$from unnest(ids) xi), 'origen', nota, 'total', precio)::text$a$);
  if n = f then raise exception 'cot_alta: total'; end if;
  execute n;
end $$;

create or replace function crm_giwa.cot_guardar(d jsonb) returns jsonb
language plpgsql as $function$
declare
  emp text := nullif(btrim(d ->> 'empresa'), ''); nom text := btrim(coalesce(d ->> 'nombre', ''));
  pid text := nullif(btrim(d ->> 'pid'), ''); est text := 'Borrador'; borr boolean; yo text := crm_giwa.mi_mail();
  sps text[] := crm_giwa.lista_csv(d ->> 'sponsor'); min jsonb := coalesce(d -> 'minuta', '{}');
  tc numeric := crm_giwa._cot_tc(); v jsonb; i int := 0; did text; mid text; e jsonb; tot numeric; hs numeric; mt jsonb; ab numeric;
  x crm_giwa.desarrollos; z crm_giwa.desarrollos; out jsonb := '[]'; ids text[] := '{}'; mids text[] := '{}'; k int; tit text; mo jsonb; fi boolean; cur numeric; ipc0 boolean;
begin
  if emp is null or nom = '' then raise exception 'Falta la empresa o el nombre del proyecto'; end if;
  perform pg_advisory_xact_lock(hashtext('crm_giwa.ids'));
  if pid is not null then
    select estado_id into est from crm_giwa.proyectos where id = pid;
    if est is null then raise exception 'No existe %', pid; end if;
    if not crm_giwa._cot_editable(est) then raise exception 'Ya está aprobado: se edita desde Proyectos'; end if;
    update crm_giwa.proyectos set empresa_id = emp, nombre = nom,
           sponsor_id = case when d ? 'sponsor' then sps[1] else sponsor_id end,
           sponsors = case when d ? 'sponsor' then array_to_string(sps, ',') else sponsors end,
           owner = coalesce(nullif(d ->> 'owner', ''), owner),
           resumen_ejecutivo = case when d ? 'resumen' then nullif(btrim(d ->> 'resumen'), '') else resumen_ejecutivo end,
           minuta = case when min = '{}'::jsonb then minuta else (crm_giwa._cot_j(minuta) || min)::text end
     where id = pid;
  else
    pid := crm_giwa.proximo_id('P', 'proyectos', 4);
    insert into crm_giwa.proyectos (id, empresa_id, nombre, sponsor_id, sponsors, owner, tipo, estado_id, probabilidad, detenido, resumen_ejecutivo, minuta)
    values (pid, emp, nom, sps[1], array_to_string(sps, ','), coalesce(nullif(d ->> 'owner', ''), yo), 'Cliente', est, 50, false,
            coalesce(nullif(btrim(coalesce(d ->> 'resumen', '')), ''), nullif(btrim(coalesce(min ->> 'objetivo', '')), '')), min::text);
  end if;
  if d ? 'fecha_cierre' then update crm_giwa.proyectos set fecha_cierre_probable = nullif(d ->> 'fecha_cierre', '')::date where id = pid; end if;
  borr := est = 'Borrador';
  for did in select jsonb_array_elements_text(coalesce(d -> 'borrados', '[]')) loop
    select * into x from crm_giwa.desarrollos where id = did and proyecto_id = pid;
    continue when x.id is null;
    if crm_giwa.estado_canonico(x.estado_id) <> 'nueva' then raise exception '% ya no está en Nuevo: no se borra desde el Cotizador', did; end if;
    perform crm_giwa._cot_borrar_des(did);
  end loop;
  for v in select * from jsonb_array_elements(coalesce(d -> 'devs', '[]')) loop
    tit := coalesce(nullif(btrim(v ->> 'titulo'), ''), v ->> 'tipo');
    did := nullif(v ->> 'id', ''); x := null;
    mt := coalesce(v -> 'mant', '{}'); mid := nullif(mt ->> 'id', '');
    if did is not null then
      select * into x from crm_giwa.desarrollos where id = did and proyecto_id = pid;
      if x.id is null then raise exception 'El desarrollo % no es de este proyecto', did; end if;
      -- Sin cambios en el Cotizador: no se toca, ni el desarrollo ni su MMR
      if coalesce((v ->> 'igual')::boolean, false) then
        ids := ids || did; mids := mids || coalesce(mid, '');
        out := out || jsonb_build_array(jsonb_build_object('id', did, 'mant_id', mid, 'horas', coalesce(x.duracion_horas, 0), 'total', x.total_ars));
        continue;
      end if;
      if crm_giwa.estado_canonico(x.estado_id) <> 'nueva' then raise exception '% ya no está en Nuevo: se edita desde Proyectos', did; end if;
    end if;
    mo := crm_giwa._cot_j(x.minuta);
    fi := did is not null and coalesce((v ->> 'func_igual')::boolean, false);   -- las mismas funcionalidades: ni horas ni precio sugerido
    e := crm_giwa.estimar_desarrollo(v ->> 'tipo', emp, jsonb_build_object('sel', crm_giwa._cot_sel(v), 'cant', coalesce(v -> 'cant', '{}'),
           'mejora', coalesce(v -> 'mejora', 'false'::jsonb), 'escala', coalesce(v ->> 'escala', ''), 'reuso', coalesce(v -> 'reuso', mo -> 'reuso', '{}'::jsonb)));
    hs := case when fi then x.duracion_horas when (e ->> 'ok')::boolean then (e ->> 'horas')::numeric end;
    tot := case when coalesce(crm_giwa.num_ar(v ->> 'precio'), 0) > 0 then round(crm_giwa.num_ar(v ->> 'precio'))
                when fi then x.total_ars
                when (e ->> 'ok')::boolean and (e ->> 'total_ars')::numeric > 0 then round((e ->> 'total_ars')::numeric)
                else coalesce(x.total_ars, 0) end;                             -- un estimado en 0 nunca reemplaza un monto
    if x.total_ars is not null and tot = round(x.total_ars) then tot := x.total_ars; end if;
    if did is not null then
      update crm_giwa.desarrollos set tipo_id = v ->> 'tipo', titulo = tit, descripcion = nullif(btrim(coalesce(v ->> 'objetivo', '')), ''),
             total_ars = tot,
             total_usd = case when tot is not distinct from x.total_ars then total_usd else round(tot / tc, 2) end,
             tipo_cambio = case when tot is not distinct from x.total_ars then tipo_cambio else tc end,
             moneda = coalesce(nullif(v ->> 'moneda', ''), 'ARS'),
             modelo_pago_id = coalesce(nullif(v ->> 'forma_pago', ''), modelo_pago_id), fecha_inicio = nullif(v ->> 'inicio', '')::date,
             duracion_horas = coalesce(nullif(hs, 0), duracion_horas), tier_id = case when fi then tier_id else coalesce(e ->> 'tier', tier_id) end,
             valor_hora = case when fi and tot is not distinct from x.total_ars then valor_hora when coalesce(hs, 0) > 0 then round(tot / hs) else valor_hora end
       where id = did;
    else
      did := crm_giwa.proximo_id('D', 'desarrollos', 4);
      insert into crm_giwa.desarrollos (id, proyecto_id, tipo_id, titulo, descripcion, estado_id, moneda, total_ars, total_usd, tipo_cambio, q_cuotas,
                                        modelo_pago_id, fecha_inicio, creador, tier_id, duracion_horas, valor_hora, mant_de, detenido, bonificado)
      values (did, pid, v ->> 'tipo', tit, nullif(btrim(coalesce(v ->> 'objetivo', '')), ''), 'Nuevo', coalesce(nullif(v ->> 'moneda', ''), 'ARS'),
              tot, round(tot / tc, 2), tc, 1, nullif(v ->> 'forma_pago', ''), nullif(v ->> 'inicio', '')::date, yo, e ->> 'tier', hs,
              case when coalesce(hs, 0) > 0 then round(tot / hs) end, '{}', false, false);
    end if;
    update crm_giwa.desarrollos set minuta = (mo || jsonb_build_object('objetivo', coalesce(v ->> 'objetivo', ''), 'r', coalesce(v -> 'r', '{}'),
             'cant', coalesce(v -> 'cant', '{}'), 'etapa', coalesce(v -> 'etapa', '{}'), 'notas', coalesce(v -> 'notas', '{}'),
             'ext', coalesce(v -> 'ext', '{}'), 'base', coalesce(v -> 'base', '{}'), 'na', coalesce(v -> 'na', '{}'),
             'mejora', coalesce(v -> 'mejora', 'false'::jsonb), 'escala', coalesce(v ->> 'escala', ''), 'reuso', coalesce(v -> 'reuso', mo -> 'reuso', '{}'::jsonb),
             'precio', crm_giwa.num_ar(v ->> 'precio'), 'total', tot,
             'vh', v -> 'vh', 'vh_soporte', v -> 'vh_sop', 'semanas', v -> 'semanas',
             'mant_modalidad', v -> 'mant' -> 'modalidad', 'mant_comparte', v -> 'mant' -> 'comparte'))::text,
           garantia_dias = case when v ? 'garantia' then nullif(crm_giwa.num_ar(v ->> 'garantia'), 0)::int else garantia_dias end
     where id = did;
    if not borr and not fi then
      perform crm_giwa.guardar_modulos_desarrollo(did, jsonb_build_object('tipo', v ->> 'tipo', 'sel', crm_giwa._cot_sel(v),
                                                   'cant', coalesce(v -> 'cant', '{}'), 'mejora', coalesce(v -> 'mejora', 'false'::jsonb), 'escala', coalesce(v ->> 'escala', ''), 'reuso', coalesce(v -> 'reuso', mo -> 'reuso', '{}'::jsonb)));
    end if;
    if not borr and not (fi and coalesce((v ->> 'ext_igual')::boolean, false)) then
      perform crm_giwa._cot_costos(pid, did, crm_giwa._cot_ext(v));
    end if;
    -- Dejó de compartir el mantenimiento de otro: se saca de ese MMR (si sigue compartiendo, se vuelve a sumar al final)
    if not coalesce((mt ->> 'on')::boolean, false) or coalesce(mt ->> 'comparte', '') <> '' then
      update crm_giwa.desarrollos set mant_de = array_remove(mant_de, did)
       where proyecto_id = pid and did = any(mant_de) and mant_de[1] <> did and crm_giwa.estado_canonico(estado_id) = 'nueva';
    end if;
    if coalesce((mt ->> 'on')::boolean, false) and coalesce(mt ->> 'comparte', '') = '' then
      ab := round(coalesce(crm_giwa.num_ar(mt ->> 'abono'), 0));
      z := null; if mid is not null then select * into z from crm_giwa.desarrollos where id = mid and proyecto_id = pid; end if;
      if z.id is not null then
        if not coalesce((mt ->> 'igual')::boolean, false) and crm_giwa.estado_canonico(z.estado_id) = 'nueva' then
          cur := coalesce(nullif(z.valor_cuota_actual, 0), z.cuota, 0);
          ipc0 := coalesce(z.ajuste, '') ~* 'ipc|ajuste' and coalesce(z.ajuste, '') !~* 'sin';
          update crm_giwa.desarrollos set
                 titulo = case when titulo = 'MMR de ' || x.titulo then 'MMR de ' || tit else titulo end,
                 total_ars = case when ab = round(cur) then total_ars else ab * coalesce(nullif(q_cuotas, 0), 12) end,
                 total_usd = case when ab = round(cur) then total_usd else round(ab * coalesce(nullif(q_cuotas, 0), 12) / tc, 2) end,
                 tipo_cambio = case when ab = round(cur) then tipo_cambio else tc end,
                 q_cuotas = coalesce(nullif(q_cuotas, 0), 12),
                 cuota = case when ab = round(cur) then cuota else ab end, valor_cuota_actual = case when ab = round(cur) then valor_cuota_actual else ab end,
                 mantenimiento_horas = coalesce(nullif(crm_giwa.num_ar(mt ->> 'hs'), 0), mantenimiento_horas, 6),
                 soporte_hora_ars = coalesce(nullif(soporte_hora_ars, 0), nullif(crm_giwa.num_ar(mt ->> 'exc'), 0)),
                 ajuste = case when coalesce((mt ->> 'ipc')::boolean, true) = ipc0 then ajuste when coalesce((mt ->> 'ipc')::boolean, true) then 'IPC trimestral' else 'Sin Ajuste' end
           where id = mid;
        end if;
      else
        mid := crm_giwa.proximo_id('D', 'desarrollos', 4);
        insert into crm_giwa.desarrollos (id, proyecto_id, tipo_id, titulo, descripcion, estado_id, moneda, total_ars, total_usd, tipo_cambio,
                                          q_cuotas, cuota, valor_cuota_actual, mantenimiento_horas, soporte_hora_ars, ajuste, modelo_pago_id, creador, mant_de, detenido, bonificado)
        values (mid, pid, 'MM', 'MMR de ' || tit, 'Mantenimiento mensual de ' || tit, 'Nuevo', 'ARS', ab * 12, round(ab * 12 / tc, 2), tc,
                12, ab, ab, coalesce(nullif(crm_giwa.num_ar(mt ->> 'hs'), 0), 6), crm_giwa.num_ar(mt ->> 'exc'),
                case when coalesce((mt ->> 'ipc')::boolean, true) then 'IPC trimestral' else 'Sin Ajuste' end, 'FP-03', yo, array[did], false, false);
      end if;
    elsif mid is not null then
      perform crm_giwa._cot_borrar_des(mid); mid := null;
    end if;
    ids := ids || did; mids := mids || coalesce(mid, '');
    out := out || jsonb_build_array(jsonb_build_object('id', did, 'mant_id', mid, 'horas', coalesce(hs, 0), 'total', tot));
    i := i + 1;
  end loop;
  i := 0;
  for v in select * from jsonb_array_elements(coalesce(d -> 'devs', '[]')) loop
    i := i + 1;
    continue when not coalesce((v -> 'mant' ->> 'on')::boolean, false) or coalesce(v -> 'mant' ->> 'comparte', '') = '';
    k := (v -> 'mant' ->> 'comparte')::int + 1;
    continue when k < 1 or k > coalesce(array_length(mids, 1), 0) or mids[k] = '';
    update crm_giwa.desarrollos set mant_de = array_append(mant_de, ids[i]) where id = mids[k] and not ids[i] = any(mant_de);
  end loop;
  return jsonb_build_object('ok', true, 'pid', pid, 'estado', est, 'devs', out);
end $function$;

reset role;
