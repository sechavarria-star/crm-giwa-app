-- MMR · nombre unificado (pedido de Vicky, 20/11/2026)
-- 1) Las funciones que crean mantenimientos los nombran «MMR de <desarrollo>»: alta_abono, alta_proyecto_rapido,
--    cot_alta y cot_guardar. Sólo cambia el texto del título; cada función se reescribe desde su definición actual.
-- 2) Los mantenimientos que hoy se llaman «Mantenimiento…» pasan a «MMR de …» (vista previa aprobada), con auditoría.
--    D-0029 («Automatizaciones») no se toca: su nombre no dice Mantenimiento.
set role crm_giwa_dev;

do $$
declare f record; def text; nuevo text;
begin
  for f in select * from (values
      ('crm_giwa.alta_abono(text,text,numeric,numeric,boolean,date,text,numeric)',
       $a$'Mantenimiento Mensual' || coalesce(' · ' || (select titulo from crm_giwa.desarrollos where id = padre), '')$a$,
       $b$'MMR' || coalesce(' de ' || (select titulo from crm_giwa.desarrollos where id = padre), '')$b$),
      ('crm_giwa.alta_proyecto_rapido(jsonb)', $a$'Mantenimiento — ' || tit$a$, $b$'MMR de ' || tit$b$),
      ('crm_giwa.cot_alta(jsonb,text)', $a$'Mantenimiento — ' || coalesce($a$, $b$'MMR de ' || coalesce($b$),
      ('crm_giwa.cot_guardar(jsonb)', $a$'Mantenimiento — ' || tit$a$, $b$'MMR de ' || tit$b$)
    ) as t(fn, viejo, nue)
  loop
    def := pg_get_functiondef(f.fn::regprocedure);
    if position(f.viejo in def) = 0 then raise exception 'No encontré el nombre viejo en %', f.fn; end if;
    nuevo := replace(def, f.viejo, f.nue);
    execute nuevo;
  end loop;
end $$;

with nombres(id, titulo) as (values
  ('D-0002', 'MMR WebApp de dashboard de control'),
  ('D-0005', 'MMR de AGente IA Atencion Clientes'),
  ('D-0007', 'MMR de Agente IA de Resultados'),
  ('D-0013', 'MMR de agente de gestion de talleres'),
  ('D-0015', 'MMR de Automatizaciones'),
  ('D-0017', 'MMR de Agente'),
  ('D-0021', 'MMR de Web App Entrega de Turnos'),
  ('D-0024', 'MMR de WebApp Odonto'),
  ('D-0027', 'MMR de WebApp Siniestros - ART'),
  ('D-0031', 'MMR de Agente IA para IT interno de la empresa'),
  ('D-0032', 'MMR de URBA - App Rugby'),
  ('D-0038', 'MMR de Agente Contacto de Alquiler (WA e IG)'),
  ('D-0042', 'MMR de Agente Contacto de Venta (WA e IG)'),
  ('D-0070', 'MMR de Agente de turnos · WhatsApp + Dentalink'),
  ('D-0091', 'MMR de KO Fumigaciones · Básica'),
  ('D-0095', 'MMR de Agente de turnos · WhatsApp + Dentalink'),
  ('D-0098', 'MMR de AGente IA Atencion Clientes'),
  ('D-0099', 'MMR de Lector del glucómetro')),
cambio as (
  select d.id, d.titulo as antes, n.titulo as despues from crm_giwa.desarrollos d join nombres n on n.id = d.id
  where d.titulo ~* '^\s*mantenimiento'),
aud as (
  insert into crm_giwa.admin_auditoria (quien, tabla, registro, accion, antes, despues, motivo)
  select 'v.gagey@giwa-ia.com', 'desarrollos', id, 'editar', jsonb_build_object('titulo', antes), jsonb_build_object('titulo', despues),
         'Nombre unificado de los MMR (pedido de Vicky 20/11/2026)' from cambio returning registro)
update crm_giwa.desarrollos d set titulo = c.despues from cambio c where d.id = c.id;

reset role;
