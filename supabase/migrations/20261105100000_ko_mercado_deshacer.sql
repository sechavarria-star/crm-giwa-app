-- Pedido del 05/11/2026: KO, Valores de mercado y Deshacer.
set role crm_giwa_dev;
select set_config('request.jwt.claims', '{"email":"v.gagey@giwa-ia.com"}', true);

-- KO: el mantenimiento de conciliaciones nunca existió; el desarrollo cerró el 13/10, pago único contra entrega
insert into crm_giwa.admin_auditoria(quien, tabla, registro, accion, antes, despues, motivo)
select 'v.gagey@giwa-ia.com', 'desarrollos', d.id, 'borrar', to_jsonb(d), null, 'Pedido de Victoria 05/11/2026: el mantenimiento de conciliaciones de KO nunca existió' from crm_giwa.desarrollos d where d.id = 'D-0072';
delete from crm_giwa.desarrollos where id = 'D-0072' and titulo = 'Mantenimiento — Conciliaciones bancarias' and estado_id = 'Rechazado';
update crm_giwa.desarrollos set fecha_fin = '2026-10-13' where id = 'D-0064';
update crm_giwa.proyectos set fecha_finalizado = '2026-10-13' where id = 'P-0035';

-- Valores de mercado: Tabla_valores_mercado_desarrollo_IA_webapps_2026.xlsx, hoja Tarifario. Referencia = el medio del archivo.
insert into crm_giwa.mercado_referencias(id,fuente,rol,tipo,unidad,valor_min,valor_ref,valor_max,fecha,nota,orden) values
('TAR-01','Upwork: Web/Front-End Developers','Desarrollo web / Frontend · Junior','venta','USD/hora',15,20,25,'2026-11-04','Maquetado, componentes y ajustes de interfaz · Estimación guiada por rangos publicados',101),
('TAR-02','Upwork: Front-End Developers; Lemon: Front-end','Desarrollo web / Frontend · Semi Senior','venta','USD/hora',20,27.5,35,'2026-11-04','Interfaces responsive, integración de APIs · Estimación guiada por rangos publicados',102),
('TAR-03','Upwork: React/Web Developers; Lemon','Desarrollo web / Frontend · Senior','venta','USD/hora',30,40,50,'2026-11-04','Arquitectura frontend, performance y calidad · Estimación guiada por rangos publicados',103),
('TAR-04','Upwork: API/Back-End Developers','Backend / APIs · Junior','venta','USD/hora',15,20,25,'2026-11-04','Endpoints simples, CRUD e integraciones básicas · Estimación guiada por rangos publicados',104),
('TAR-05','Upwork: Back-End/API Developers','Backend / APIs · Semi Senior','venta','USD/hora',20,30,40,'2026-11-04','APIs, autenticación, lógica y bases de datos · Estimación guiada por rangos publicados',105),
('TAR-06','Upwork; CPCIPC Backend','Backend / APIs · Senior','venta','USD/hora',30,42.5,55,'2026-11-04','Diseño de servicios, seguridad y escalabilidad · Estimación + referencia local CPCIPC',106),
('TAR-07','Upwork: Full-Stack Developers','Full Stack / Web Apps · Junior','venta','USD/hora',16,20.5,25,'2026-11-04','Módulos acotados con frontend y backend · Estimación guiada por rangos publicados',107),
('TAR-08','Lemon Argentina; Upwork Full-Stack','Full Stack / Web Apps · Semi Senior','venta','USD/hora',21,28,35,'2026-11-04','Aplicaciones web funcionales, auth, DB e integraciones · Estimación guiada por rangos publicados',108),
('TAR-09','Lemon Argentina Q3 2026; CPCIPC Full Stack','Full Stack / Web Apps · Senior','venta','USD/hora',34,39.5,45,'2026-11-04','Sistemas de gestión, SaaS y decisiones técnicas · Rango anclado en Lemon Argentina + referencia local',109),
('TAR-10','Upwork AI Developers; CPCIPC Programador IA','Desarrollo IA / Integración LLM · Junior','venta','USD/hora',25,32.5,40,'2026-11-04','Integrar APIs de modelos, prompts y funciones simples · Estimación + referencia local CPCIPC',110),
('TAR-11','Upwork AI Developers/Engineers','Desarrollo IA / Integración LLM · Semi Senior','venta','USD/hora',30,40,50,'2026-11-04','RAG básico, herramientas, evaluación e integraciones · Estimación guiada por rangos publicados',111),
('TAR-12','Upwork AI Engineers; Lemon AI Engineer','Desarrollo IA / Integración LLM · Senior','venta','USD/hora',35,47.5,60,'2026-11-04','Diseño de soluciones LLM listas para producción · Estimación guiada por rangos publicados',112),
('TAR-13','Upwork AI/ML; CPCIPC Científico de Datos/IA/ML','Ingeniería IA / ML · Junior','venta','USD/hora',30,40,50,'2026-11-04','Modelos y pipelines acotados con supervisión · Estimación + referencia local CPCIPC',113),
('TAR-14','Upwork ML Engineers; Lemon AI Engineering','Ingeniería IA / ML · Semi Senior','venta','USD/hora',40,57.5,75,'2026-11-04','Pipelines ML, evaluación, inferencia y datos · Estimación guiada por rangos publicados',114),
('TAR-15','Upwork ML Engineers; Lemon AI Engineering','Ingeniería IA / ML · Senior','venta','USD/hora',55,77.5,100,'2026-11-04','ML en producción, optimización y arquitectura · Rango de especialidad; validar alcance',115),
('TAR-16','Lemon AI stack premiums; Upwork AI','Agentes IA / RAG / Voice AI · Junior','venta','USD/hora',30,37.5,45,'2026-11-04','Prototipos de agentes y flujos simples · Estimación orientativa',116),
('TAR-17','Lemon AI stack premiums','Agentes IA / RAG / Voice AI · Semi Senior','venta','USD/hora',45,57.5,70,'2026-11-04','Agentes con herramientas, RAG y orquestación · Estimación orientativa',117),
('TAR-18','Lemon AI stack premiums: RAG/agentic $60–95','Agentes IA / RAG / Voice AI · Senior','venta','USD/hora',60,77.5,95,'2026-11-04','Sistemas agentic, multiagente, observabilidad y seguridad · Rango publicado para especialidad avanzada',118),
('TAR-19','Upwork API/Automation adjacent','Automatizaciones / n8n / Make · Junior','venta','USD/hora',15,20,25,'2026-11-04','Flujos simples, webhooks y conectores · Estimación orientativa',119),
('TAR-20','Upwork Marketing Automation/API','Automatizaciones / n8n / Make · Semi Senior','venta','USD/hora',25,35,45,'2026-11-04','Automatizaciones multietapa, APIs y manejo de errores · Estimación orientativa',120),
('TAR-21','Upwork Marketing Automation Consultants','Automatizaciones / n8n / Make · Senior','venta','USD/hora',40,55,70,'2026-11-04','Arquitectura de procesos, integraciones críticas · Estimación orientativa',121),
('TAR-22','Upwork Chatbot Developers','Chatbots / WhatsApp · Junior','venta','USD/hora',20,25,30,'2026-11-04','Bot de FAQ y flujos básicos · Estimación orientativa',122),
('TAR-23','Upwork Chatbot Developers','Chatbots / WhatsApp · Semi Senior','venta','USD/hora',30,37.5,45,'2026-11-04','WhatsApp API, CRM y handoff humano · Estimación orientativa',123),
('TAR-24','Upwork Chatbot Developers; AI Developers','Chatbots / WhatsApp · Senior','venta','USD/hora',45,57.5,70,'2026-11-04','Asistentes con IA, contexto, métricas e integraciones · Estimación orientativa',124),
('TAR-25','Upwork UI/UX; CPCIPC UI/UX','UX/UI / Product Design · Junior','venta','USD/hora',15,20,25,'2026-11-04','Wireframes y UI de pantallas acotadas · Estimación + referencia local CPCIPC',125),
('TAR-26','Upwork UI/UX/Product Designers','UX/UI / Product Design · Semi Senior','venta','USD/hora',20,27.5,35,'2026-11-04','Diseño de flujos, prototipos y sistema visual · Estimación guiada por rangos publicados',126),
('TAR-27','Upwork UX/Product Design','UX/UI / Product Design · Senior','venta','USD/hora',30,40,50,'2026-11-04','Research, estrategia de producto y design systems · Estimación guiada por rangos publicados',127),
('TAR-28','Upwork Data Analysts','Data / BI / Dashboards · Junior','venta','USD/hora',20,25,30,'2026-11-04','Reportes, consultas y visualizaciones básicas · Estimación orientativa',128),
('TAR-29','Upwork Data/BI; CPCIPC Consultor BI','Data / BI / Dashboards · Semi Senior','venta','USD/hora',25,35,45,'2026-11-04','Modelado, ETL y dashboards conectados · Estimación + referencia local CPCIPC',129),
('TAR-30','Upwork Data Scientists/BI; CPCIPC','Data / BI / Dashboards · Senior','venta','USD/hora',35,47.5,60,'2026-11-04','Arquitectura de datos, analítica y gobierno · Estimación orientativa',130),
('TAR-31','Upwork Cloud/DevOps','DevOps / Cloud · Junior','venta','USD/hora',25,32.5,40,'2026-11-04','Deploys, CI/CD y mantenimiento supervisado · Estimación orientativa',131),
('TAR-32','Upwork DevOps; CPCIPC DevOps','DevOps / Cloud · Semi Senior','venta','USD/hora',40,52.5,65,'2026-11-04','Infraestructura cloud, pipelines y monitoreo · Estimación + referencia local CPCIPC',132),
('TAR-33','Upwork DevOps Engineers','DevOps / Cloud · Senior','venta','USD/hora',60,80,100,'2026-11-04','Arquitectura cloud, seguridad, resiliencia y costos · Estimación guiada por rangos publicados',133),
('TAR-34','Upwork QA/Software Testers; CPCIPC Testing','QA / Testing · Junior','venta','USD/hora',12,16,20,'2026-11-04','Pruebas manuales y casos de prueba · Estimación + referencia local CPCIPC',134),
('TAR-35','Upwork QA Engineers; CPCIPC Test Automation','QA / Testing · Semi Senior','venta','USD/hora',20,27.5,35,'2026-11-04','Testing funcional, API y automatización básica · Estimación + referencia local CPCIPC',135),
('TAR-36','Upwork QA Engineers; CPCIPC QA','QA / Testing · Senior','venta','USD/hora',35,47.5,60,'2026-11-04','Estrategia QA, automatización y performance · Estimación + referencia local CPCIPC',136),
('TAR-37','Upwork IT/Consulting; CPCIPC Arquitecto Software','Arquitectura / Tech Lead · Senior','venta','USD/hora',60,80,100,'2026-11-04','Diseño de arquitectura, revisión y liderazgo técnico · Estimación + referencia local CPCIPC',137),
('TAR-38','Upwork Project Managers; CPCIPC Líder de Proyectos','Project Manager técnico · Semi Senior','venta','USD/hora',25,35,45,'2026-11-04','Planificación, seguimiento y coordinación · Estimación + referencia local CPCIPC',138),
('TAR-39','Upwork Agile PM; CPCIPC Director de Proyecto','Project Manager técnico · Senior','venta','USD/hora',40,62.5,85,'2026-11-04','Dirección de proyectos y gestión de stakeholders · Estimación + referencia local CPCIPC',139)
on conflict (id) do update set fuente=excluded.fuente,rol=excluded.rol,tipo=excluded.tipo,unidad=excluded.unidad,valor_min=excluded.valor_min,valor_ref=excluded.valor_ref,valor_max=excluded.valor_max,fecha=excluded.fecha,nota=excluded.nota,orden=excluded.orden;

-- Deshacer: foto de cómo estaba y restauración, 5 minutos y sólo quien hizo la acción
create table if not exists crm_giwa.deshacer_log (
  id bigint generated always as identity primary key,
  quien text not null, cuando timestamptz not null default now(), etiqueta text not null,
  tabla text not null, ids text[] not null, fotos jsonb, usado timestamptz);
alter table crm_giwa.deshacer_log enable row level security;
drop policy if exists propio on crm_giwa.deshacer_log;
create policy propio on crm_giwa.deshacer_log for select to authenticated using (quien = crm_giwa.mi_mail());
grant select on crm_giwa.deshacer_log to authenticated;

create or replace function crm_giwa.deshacer_foto(etiqueta text, tabla text, ids text[], creados boolean default false) returns bigint
language plpgsql volatile security definer set search_path = crm_giwa, public as $$
declare f jsonb; nid bigint;
begin
  if not crm_giwa.es_equipo() then raise exception 'Sin permiso'; end if;
  if tabla not in ('cobros', 'desarrollos') then raise exception 'La tabla % no admite deshacer.', tabla; end if;
  if not creados then
    execute format('select jsonb_agg(to_jsonb(t)) from crm_giwa.%I t where t.id = any($1)', tabla) into f using ids;
  end if;
  insert into crm_giwa.deshacer_log(quien, etiqueta, tabla, ids, fotos) values (crm_giwa.mi_mail(), etiqueta, tabla, ids, f) returning id into nid;
  return nid;
end $$;

create or replace function crm_giwa.deshacer(lid bigint) returns jsonb
language plpgsql volatile security definer set search_path = crm_giwa, public as $$
declare l crm_giwa.deshacer_log; sets text; f jsonb;
begin
  select * into l from crm_giwa.deshacer_log where id = lid and quien = crm_giwa.mi_mail() for update;
  if not found then raise exception 'No encontré esa acción.'; end if;
  if l.usado is not null then raise exception 'Esa acción ya se deshizo.'; end if;
  if now() - l.cuando > interval '5 minutes' then raise exception 'Pasaron los 5 minutos: ya no se puede deshacer.'; end if;
  if l.fotos is null then
    execute format('delete from crm_giwa.%I t where t.id = any($1)', l.tabla) using l.ids;
  else
    select string_agg(format('%I = r.%I', a.attname, a.attname), ', ') into sets
      from pg_attribute a where a.attrelid = ('crm_giwa.' || quote_ident(l.tabla))::regclass and a.attnum > 0 and not a.attisdropped
       and a.attname not in ('id', 'creado', 'actualizado', 'orden') and a.attgenerated = '';
    for f in select * from jsonb_array_elements(l.fotos) loop
      execute format('update crm_giwa.%I t set %s from jsonb_populate_record(null::crm_giwa.%I, $1) r where t.id = $2', l.tabla, sets, l.tabla) using f, f ->> 'id';
    end loop;
  end if;
  update crm_giwa.deshacer_log set usado = now() where id = lid;
  perform crm_giwa.sincronizar_alertas_facturacion();
  return jsonb_build_object('ok', true, 'etiqueta', l.etiqueta);
end $$;
grant execute on function crm_giwa.deshacer_foto(text, text, text[], boolean), crm_giwa.deshacer(bigint) to authenticated;

reset role;
