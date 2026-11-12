-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · Cotizador: base del agente según el tipo · 11/11/2026
-- ──────────────────────────────────────────────────────────────────────
-- Pedido de Vicky: la base del agente IA (32 h) no sirve igual para todo.
--   Completo  → base 32 h (lo de hoy)
--   Sencillo  → base 18 h  (cot_config.base_horas_sencillo)
--   Evolución → base 7 h   (cot_config.base_horas_evolucion) y lo repetible al 50 %
-- Las tareas de la base (nivel = 'base') se escalan en proporción hasta ese total,
-- así el reparto por etapa sigue igual. Sin «escala» todo da lo mismo que antes:
-- mejora = true se toma como evolución; si no, completo.
-- Cambios quirúrgicos (replace sobre la definición vigente): estimar_desarrollo,
-- cot_guardar, cot_leer y guardar_modulos_desarrollo sólo pasan y guardan «escala».
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

insert into crm_giwa.cot_config (clave, valor, orden, aclaracion)
select x.clave, x.valor, (select coalesce(max(orden), 0) from crm_giwa.cot_config) + x.o, x.acl
  from (values ('base_horas_sencillo', '18', 1, 'Base del agente IA sencillo (horas)'),
               ('base_horas_evolucion', '7', 2, 'Base del agente IA que evoluciona uno existente (horas)')) x(clave, valor, o, acl)
 where not exists (select 1 from crm_giwa.cot_config c where c.clave = x.clave);

do $mig$
declare f text; g text;
begin
  -- estimar_desarrollo
  f := pg_get_functiondef('crm_giwa.estimar_desarrollo(text,text,jsonb)'::regprocedure);
  g := f;
  g := replace(g, '  cupo numeric; margen numeric; vh_sop numeric := 0;
begin', '  cupo numeric; margen numeric; vh_sop numeric := 0;
  esc text; tgt numeric; nat numeric := 0; rb numeric := 1;
begin');
  g := replace(g, '  reut := case when coalesce((o ->> ''mejora'')::boolean, false)',
'  -- Tipo de agente: completo, sencillo o evolución (sin dato: mejora = evolución)
  esc := lower(coalesce(nullif(o ->> ''escala'', ''''), case when coalesce((o ->> ''mejora'')::boolean, false) then ''evolucion'' else ''completo'' end));
  if esc not in (''completo'', ''sencillo'', ''evolucion'') then esc := ''completo''; end if;
  select coalesce(sum(c.horas_base), 0) into nat from crm_giwa.catalogo_modulos c
   where upper(c.tipo_desarrollo_id) = cod and c.activo is not false and c.nivel = ''base'';
  tgt := case esc when ''sencillo'' then crm_giwa.num_ar((select valor from crm_giwa.cot_config where clave = ''base_horas_sencillo''))
                  when ''evolucion'' then crm_giwa.num_ar((select valor from crm_giwa.cot_config where clave = ''base_horas_evolucion'')) end;
  if coalesce(tgt, 0) > 0 and nat > 0 then rb := tgt / nat; end if;

  reut := case when esc = ''evolucion'' or coalesce((o ->> ''mejora'')::boolean, false)');
  g := replace(g, '    r := case when coalesce(m.es_replicable, false) then reut else 1 end;',
                  '    r := case when m.nivel = ''base'' and rb <> 1 then rb when coalesce(m.es_replicable, false) then reut else 1 end;');
  g := replace(g, '''mejora'', coalesce((o ->> ''mejora'')::boolean, false), ''reutilizacion'', reut,',
                  '''mejora'', coalesce((o ->> ''mejora'')::boolean, false), ''escala'', esc, ''reutilizacion'', reut,');
  if g = f or position('rb := tgt / nat' in g) = 0 or position('then rb when' in g) = 0 or position('''escala'', esc' in g) = 0
     or position('esc text; tgt numeric' in g) = 0 then
    raise exception 'estimar_desarrollo: la definición vigente no coincide con la esperada';
  end if;
  execute g;

  -- cot_guardar: pasa y guarda «escala» (motor, minuta y módulos)
  f := pg_get_functiondef('crm_giwa.cot_guardar(jsonb)'::regprocedure);
  g := replace(f, '''mejora'', coalesce(v -> ''mejora'', ''false''::jsonb)',
                  '''mejora'', coalesce(v -> ''mejora'', ''false''::jsonb), ''escala'', coalesce(v ->> ''escala'', '''')');
  if (length(g) - length(f)) <> 3 * length(', ''escala'', coalesce(v ->> ''escala'', '''')') then
    raise exception 'cot_guardar: la definición vigente no coincide con la esperada';
  end if;
  execute g;

  -- cot_leer: devuelve «escala»
  f := pg_get_functiondef('crm_giwa.cot_leer(text)'::regprocedure);
  g := replace(f, '''mejora'', coalesce((m ->> ''mejora'')::boolean, false),',
                  '''mejora'', coalesce((m ->> ''mejora'')::boolean, false), ''escala'', coalesce(m ->> ''escala'', ''''),');
  if g = f then raise exception 'cot_leer: la definición vigente no coincide con la esperada'; end if;
  execute g;

  -- guardar_modulos_desarrollo: pasa «escala» al motor
  f := pg_get_functiondef('crm_giwa.guardar_modulos_desarrollo(text,jsonb)'::regprocedure);
  g := replace(f, '''mejora'', coalesce(o -> ''mejora'', ''false''::jsonb)',
                  '''mejora'', coalesce(o -> ''mejora'', ''false''::jsonb), ''escala'', coalesce(o ->> ''escala'', '''')');
  if g = f then raise exception 'guardar_modulos_desarrollo: la definición vigente no coincide con la esperada'; end if;
  execute g;
end $mig$;

reset role;
