-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa.valor_hora_mercado · referencias de mercado por perfil (21/10/2026)
-- ──────────────────────────────────────────────────────────────────────
-- Para comparar cada cotización contra el mercado argentino de SU fecha:
-- el simulador mapea cada módulo a un perfil, toma el valor de la fuente y,
-- si la fecha de la propuesta es anterior, lo deflacta con el IPC (igual
-- que el costo y la venta de GIWA). No es «ReferenciaMercado» (esa hoja
-- tiene otro formato y la usa Mercado.js).
--
-- Fuentes: CPCIBA · Tabla de referencia de honorarios, actualización
-- octubre 2026 (mínimo = con salud + jubilación + ley 19.302; máximo =
-- además con ganancias). Develop Argentina (catálogo). Tezeract 2026.
-- Teclab / Sysarmy 2026.1. Realistic AI (propuesta URBA 22/04/2026).
-- USD al TC de la fecha de la fuente (oct-2026: 1.545,01).
-- ══════════════════════════════════════════════════════════════════════

create table if not exists crm_giwa.valor_hora_mercado (
  id         text primary key,
  fuente     text not null,
  fecha      date not null,
  perfil     text not null,        -- clave que usa el simulador
  rol_fuente text,                 -- cómo lo llama la fuente
  unidad     text not null default 'hora',   -- hora · mes · proyecto · % anual
  ars_min    numeric(14,2),
  ars_max    numeric(14,2),
  usd_min    numeric(12,4),
  usd_max    numeric(12,4),
  uso        text,                 -- a qué trabajo se aplica
  nota       text
);
alter table crm_giwa.valor_hora_mercado add column if not exists orden bigint not null default nextval('crm_giwa.orden_seq');
create index if not exists valor_hora_mercado_orden on crm_giwa.valor_hora_mercado (orden);
alter table crm_giwa.valor_hora_mercado enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='crm_giwa' and tablename='valor_hora_mercado' and policyname='equipo') then
    create policy equipo on crm_giwa.valor_hora_mercado for all to authenticated
      using (crm_giwa.es_equipo()) with check (crm_giwa.es_equipo());
  end if;
end $$;
grant all on crm_giwa.valor_hora_mercado to service_role;
grant select, insert, update, delete on crm_giwa.valor_hora_mercado to authenticated;

-- La «hoja» ValorHoraMercado (para _SheetSB / el simulador)
delete from crm_giwa.mapa_hojas where hoja = 'ValorHoraMercado';
insert into crm_giwa.mapa_hojas (hoja, tabla, encabezado, columna, posicion) values
  ('ValorHoraMercado','valor_hora_mercado','VHM_ID','id',1),
  ('ValorHoraMercado','valor_hora_mercado','VHM_Fuente','fuente',2),
  ('ValorHoraMercado','valor_hora_mercado','VHM_Fecha','fecha',3),
  ('ValorHoraMercado','valor_hora_mercado','VHM_Perfil','perfil',4),
  ('ValorHoraMercado','valor_hora_mercado','VHM_RolFuente','rol_fuente',5),
  ('ValorHoraMercado','valor_hora_mercado','VHM_Unidad','unidad',6),
  ('ValorHoraMercado','valor_hora_mercado','VHM_ARSMin','ars_min',7),
  ('ValorHoraMercado','valor_hora_mercado','VHM_ARSMax','ars_max',8),
  ('ValorHoraMercado','valor_hora_mercado','VHM_USDMin','usd_min',9),
  ('ValorHoraMercado','valor_hora_mercado','VHM_USDMax','usd_max',10),
  ('ValorHoraMercado','valor_hora_mercado','VHM_Uso','uso',11),
  ('ValorHoraMercado','valor_hora_mercado','VHM_Nota','nota',12);

-- ── Datos ──
insert into crm_giwa.valor_hora_mercado (id, fuente, fecha, perfil, rol_fuente, unidad, ars_min, ars_max, usd_min, usd_max, uso, nota) values
  -- CPCIBA oct-2026 (ARS/hora). USD = ARS / 1.545,01
  ('CPCIBA-2610-analisis','CPCIBA','2026-10-01','analisis','Analista Funcional Senior','hora',26600.62,58160.68,17.2171,37.6435,'Discovery, relevamiento, análisis funcional',null),
  ('CPCIBA-2610-arquitectura','CPCIBA','2026-10-01','arquitectura','Arquitecto de Software','hora',43334.20,94747.66,28.0478,61.3249,'Arquitectura, modelo de datos',null),
  ('CPCIBA-2610-ia','CPCIBA','2026-10-01','ia','Programador IA','hora',42757.18,93486.04,27.6743,60.5084,'Agente, prompt, LLM, FAQ/RAG, visión, audio',null),
  ('CPCIBA-2610-consultor_ia','CPCIBA','2026-10-01','consultor_ia','Consultor BI/IA','hora',45238.37,98911.01,29.2802,64.0197,'Consultoría IA/BI','≈ vh_mercado_ars de CotConfig'),
  ('CPCIBA-2610-dev','CPCIBA','2026-10-01','dev','Analista Programador Senior','hora',38429.53,84023.89,24.8733,54.3840,'Backend, frontend, ABM, panel, webapp',null),
  ('CPCIBA-2610-web','CPCIBA','2026-10-01','web','Programador de páginas Web','hora',27408.45,59926.95,17.7400,38.7868,'Web simple, landing',null),
  ('CPCIBA-2610-integracion','CPCIBA','2026-10-01','integracion','Programador .net/java Senior','hora',37564.00,82131.46,24.3131,53.1592,'Integraciones, APIs, workflows n8n',null),
  ('CPCIBA-2610-qa','CPCIBA','2026-10-01','qa','Tester','hora',31332.19,68505.97,20.2795,44.3401,'QA y pruebas',null),
  ('CPCIBA-2610-capacitacion','CPCIBA','2026-10-01','capacitacion','Instructor Informático','hora',17483.71,38227.09,11.3162,24.7423,'Capacitación, manuales',null),
  ('CPCIBA-2610-pm','CPCIBA','2026-10-01','pm','Lider/Jefe de Proyectos','hora',42353.27,92602.91,27.4129,59.9368,'Gestión de proyecto o de proveedor',null),
  ('CPCIBA-2610-soporte','CPCIBA','2026-10-01','soporte','Soporte Técnico','hora',21695.95,47436.91,14.0425,30.7027,'Soporte del abono',null),
  ('CPCIBA-2610-ux','CPCIBA','2026-10-01','ux','Analista de Usabilidad/UX','hora',29370.32,64216.46,19.0098,41.5638,'UX, prototipo, mockup',null),
  ('CPCIBA-2610-mobile','CPCIBA','2026-10-01','mobile','Programador Moviles/Mobile Developer','hora',35371.33,77337.31,22.8939,50.0562,'App móvil',null),
  -- Otras fuentes (USD)
  ('SYSARMY-2026-freelance-ssr','Teclab / Sysarmy 2026.1','2026-06-01','freelance_ssr','Freelance semi senior','hora',null,null,40,60,'Banda freelance','Teclab las llama tarifas internacionales'),
  ('SYSARMY-2026-freelance-sr','Teclab / Sysarmy 2026.1','2026-06-01','freelance_sr','Freelance senior','hora',null,null,65,90,'Banda freelance',null),
  ('REALISTIC-2604-bubble','Realistic AI','2026-04-22','bubble_externo','Hora extra de desarrollo Bubble','hora',null,null,35,35,'Desarrollo tercerizado en Bubble','Precio real de compra (propuesta URBA)'),
  ('REALISTIC-2604-soporte','Realistic AI','2026-04-22','soporte_externo','Soporte mensual básico','mes',null,null,200,200,'Abono tercerizado',null),
  ('DEVELOP-2610-hora','Develop Argentina','2026-10-21','hora_suelta','Una hora de ayuda','hora',null,null,25,25,'Piso de hora suelta','Catálogo, precio «desde»'),
  ('DEVELOP-2610-capacitacion','Develop Argentina','2026-10-21','capacitacion_hora','Capacitación para tu equipo (1 h)','hora',null,null,49,49,'Capacitación',null),
  ('DEVELOP-2610-mant-app','Develop Argentina','2026-10-21','mantenimiento_app','Mantenimiento de tu aplicación','mes',null,null,149,149,'Piso del abono de una app','Precio «desde»'),
  ('DEVELOP-2610-wa-flujo','Develop Argentina','2026-10-21','wa_flujo','Un flujo por WhatsApp API','proyecto',null,null,249,249,'Piso de un flujo de WhatsApp','Precio «desde»'),
  ('DEVELOP-2610-asistente','Develop Argentina','2026-10-21','asistente_ia','Asistente conectado a tu negocio','proyecto',null,null,349,349,'Piso de un agente con una integración','Precio «desde»'),
  ('DEVELOP-2610-portal','Develop Argentina','2026-10-21','portal','Portal de clientes o dashboard (3 roles, 3 flujos)','proyecto',null,null,599,599,'Piso de un portal','Precio «desde»'),
  ('TEZERACT-2026-mant','Tezeract','2026-01-01','mant_pct_anual','Mantenimiento anual / desarrollo','% anual',null,null,15,25,'El abono anual debería ser 15-25% del desarrollo',null),
  ('TEZERACT-2026-mant-hora','Tezeract','2026-01-01','mant_desc_hora','Hora de mantenimiento vs desarrollo','% menos',null,null,20,30,'La hora del abono 20-30% más barata que la de desarrollo',null)
on conflict (id) do update set fuente=excluded.fuente, fecha=excluded.fecha, perfil=excluded.perfil, rol_fuente=excluded.rol_fuente,
  unidad=excluded.unidad, ars_min=excluded.ars_min, ars_max=excluded.ars_max, usd_min=excluded.usd_min, usd_max=excluded.usd_max,
  uso=excluded.uso, nota=excluded.nota;
