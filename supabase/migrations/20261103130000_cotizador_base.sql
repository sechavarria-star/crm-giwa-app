-- ══════════════════════════════════════════════════════════════════════
-- Cotizador · entrega 1: base y motor (03/11/2026)
-- ──────────────────────────────────────────────────────────────────────
-- 1. Mercado: 4 tablas cargadas UNA vez desde Parametros_Mercado_GIWA.xlsx
--    (MercadoReferencias, Parametros, Plataforma, Speeches). Se editan en Datos.
--    Guardan el valor original; el paso a USD por hora lo hace la vista con el
--    tipo de cambio del CRM (BCRA), no con el MEP de la planilla (decisión 2).
-- 2. Cotizador: cot_inicio, cot_listar, cot_leer, cot_guardar (borrador o
--    prospecto), cot_crear (borrador → prospecto: horas, costos y tarea),
--    cot_borrar, cot_alta (Reunión, README y Reutilizar: sólo filas nuevas),
--    cot_clonable, cot_base, cot_minutas, cot_herramientas («Evaluar costos»).
--    Las cuentas son las de estimar_desarrollo; acá no se calcula otra cosa.
-- 3. aprobar_proyecto congela lo aprobado en la minuta del desarrollo.
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

-- ── 1 · Mercado ──────────────────────────────────────────────────────
create table if not exists crm_giwa.mercado_referencias (
  id text primary key, fuente text not null, rol text, tipo text check (tipo in ('venta','honorario','costo_salarial')),
  unidad text check (unidad in ('USD/hora','ARS/hora','ARS/mes')), valor_min numeric, valor_ref numeric, valor_max numeric,
  fecha date, revisar_dias int default 90, verificado text, sesgo text, url text, nota text, orden int default 0);
create table if not exists crm_giwa.mercado_parametros (
  id text primary key, valor text, unidad text, descripcion text, actualizado date, revisar_dias int, fuente text, orden int default 0);
create table if not exists crm_giwa.mercado_plataforma (
  id text primary key, concepto text not null, unidad text, usd_min numeric, usd_ref numeric, usd_max numeric, gratis_mes int,
  vigente_desde date, fecha date, revisar_dias int default 90, fuente text, verificado text, nota text, orden int default 0);
create table if not exists crm_giwa.mercado_speeches (
  id text primary key, caso text not null, cuando text, texto text not null, huecos text, nota text, orden int default 0);

do $$ declare t text; begin
  foreach t in array array['mercado_referencias','mercado_parametros','mercado_plataforma','mercado_speeches'] loop
    execute format('alter table crm_giwa.%I enable row level security', t);
    execute format('drop policy if exists equipo_lee on crm_giwa.%I', t);
    execute format('create policy equipo_lee on crm_giwa.%I for select to authenticated using ((select crm_giwa.es_equipo()))', t);
    execute format('revoke all on crm_giwa.%I from authenticated', t);
    execute format('grant select on crm_giwa.%I to authenticated', t);
    execute format('grant all on crm_giwa.%I to service_role', t);
  end loop;
end $$;

-- Carga inicial (una sola vez) desde Parametros_Mercado_GIWA.xlsx · sin tc_usado: el TC es el del CRM
insert into crm_giwa.mercado_referencias(id,fuente,rol,tipo,unidad,valor_min,valor_ref,valor_max,fecha,revisar_dias,verificado,sesgo,url,nota,orden) values ('CPCI-IA','CPCI Córdoba','Programador IA / Prompt Engineering','honorario','ARS/hora',null,112583.46,null,null,90,'Valor pegado por la usuaria; fecha del cuadro sin confirmar',null,'https://cpcipc.org.ar/honorarios-recomendados/','Honorario bruto por hora a demanda (precio final). El cuadro se actualiza con el índice IPIM sobre la base de enero 2022.',1) on conflict (id) do nothing;
insert into crm_giwa.mercado_referencias(id,fuente,rol,tipo,unidad,valor_min,valor_ref,valor_max,fecha,revisar_dias,verificado,sesgo,url,nota,orden) values ('CPCI-FS','CPCI Córdoba','Full Stack','honorario','ARS/hora',null,102536.52,null,null,90,'Valor pegado por la usuaria; fecha del cuadro sin confirmar',null,'https://cpcipc.org.ar/honorarios-recomendados/','Honorario bruto por hora a demanda (precio final). El cuadro se actualiza con el índice IPIM sobre la base de enero 2022.',2) on conflict (id) do nothing;
insert into crm_giwa.mercado_referencias(id,fuente,rol,tipo,unidad,valor_min,valor_ref,valor_max,fecha,revisar_dias,verificado,sesgo,url,nota,orden) values ('CPCI-BE','CPCI Córdoba','Backend','honorario','ARS/hora',null,96292.36,null,null,90,'Valor pegado por la usuaria; fecha del cuadro sin confirmar',null,'https://cpcipc.org.ar/honorarios-recomendados/','Honorario bruto por hora a demanda (precio final). El cuadro se actualiza con el índice IPIM sobre la base de enero 2022.',3) on conflict (id) do nothing;
insert into crm_giwa.mercado_referencias(id,fuente,rol,tipo,unidad,valor_min,valor_ref,valor_max,fecha,revisar_dias,verificado,sesgo,url,nota,orden) values ('CPCI-FE','CPCI Córdoba','Frontend','honorario','ARS/hora',null,91365.2,null,null,90,'Valor pegado por la usuaria; fecha del cuadro sin confirmar',null,'https://cpcipc.org.ar/honorarios-recomendados/','Honorario bruto por hora a demanda (precio final). El cuadro se actualiza con el índice IPIM sobre la base de enero 2022.',4) on conflict (id) do nothing;
insert into crm_giwa.mercado_referencias(id,fuente,rol,tipo,unidad,valor_min,valor_ref,valor_max,fecha,revisar_dias,verificado,sesgo,url,nota,orden) values ('CPCI-DO','CPCI Córdoba','DevOps','honorario','ARS/hora',null,112583.55,null,null,90,'Valor pegado por la usuaria; fecha del cuadro sin confirmar',null,'https://cpcipc.org.ar/honorarios-recomendados/','Honorario bruto por hora a demanda (precio final). El cuadro se actualiza con el índice IPIM sobre la base de enero 2022.',5) on conflict (id) do nothing;
insert into crm_giwa.mercado_referencias(id,fuente,rol,tipo,unidad,valor_min,valor_ref,valor_max,fecha,revisar_dias,verificado,sesgo,url,nota,orden) values ('CPCI-BI','CPCI Córdoba','Consultor BI / Analytics','honorario','ARS/hora',null,122643.41,null,null,90,'Valor pegado por la usuaria; fecha del cuadro sin confirmar',null,'https://cpcipc.org.ar/honorarios-recomendados/','Honorario bruto por hora a demanda (precio final). El cuadro se actualiza con el índice IPIM sobre la base de enero 2022.',6) on conflict (id) do nothing;
insert into crm_giwa.mercado_referencias(id,fuente,rol,tipo,unidad,valor_min,valor_ref,valor_max,fecha,revisar_dias,verificado,sesgo,url,nota,orden) values ('CPCI-CI','CPCI Córdoba','Consultor Informático','honorario','ARS/hora',null,112154.51,null,null,90,'Valor pegado por la usuaria; fecha del cuadro sin confirmar',null,'https://cpcipc.org.ar/honorarios-recomendados/','Honorario bruto por hora a demanda (precio final). El cuadro se actualiza con el índice IPIM sobre la base de enero 2022.',7) on conflict (id) do nothing;
insert into crm_giwa.mercado_referencias(id,fuente,rol,tipo,unidad,valor_min,valor_ref,valor_max,fecha,revisar_dias,verificado,sesgo,url,nota,orden) values ('CPCI-AR','CPCI Córdoba','Arquitecto de software','honorario','ARS/hora',null,118183.22,null,null,90,'Valor pegado por la usuaria; fecha del cuadro sin confirmar',null,'https://cpcipc.org.ar/honorarios-recomendados/','Honorario bruto por hora a demanda (precio final). El cuadro se actualiza con el índice IPIM sobre la base de enero 2022.',8) on conflict (id) do nothing;
insert into crm_giwa.mercado_referencias(id,fuente,rol,tipo,unidad,valor_min,valor_ref,valor_max,fecha,revisar_dias,verificado,sesgo,url,nota,orden) values ('LEM-GEN','Lemon.io Argentina','Senior general','venta','USD/hora',33.0,40.0,45.0,'2026-08-01',90,'Sí','Vende talento (sesgo comercial)','https://lemon.io/rate-calculator/argentina/','Mediana senior; mín y máx son P25 y P75. Contratos reales según la propia fuente. Fecha: agosto 2026, día aproximado.',9) on conflict (id) do nothing;
insert into crm_giwa.mercado_referencias(id,fuente,rol,tipo,unidad,valor_min,valor_ref,valor_max,fecha,revisar_dias,verificado,sesgo,url,nota,orden) values ('LEM-AI','Lemon.io Argentina','Senior Python / ML / LLM','venta','USD/hora',null,45.0,null,'2026-08-01',90,'Sí','Vende talento (sesgo comercial)','https://lemon.io/rate-calculator/argentina/','Prima del 13% sobre la mediana senior.',10) on conflict (id) do nothing;
insert into crm_giwa.mercado_referencias(id,fuente,rol,tipo,unidad,valor_min,valor_ref,valor_max,fecha,revisar_dias,verificado,sesgo,url,nota,orden) values ('LEM-STR','Lemon.io Argentina','Senior fuerte','venta','USD/hora',null,50.0,null,'2026-08-01',90,'Sí','Vende talento (sesgo comercial)','https://lemon.io/rate-calculator/argentina/',null,11) on conflict (id) do nothing;
insert into crm_giwa.mercado_referencias(id,fuente,rol,tipo,unidad,valor_min,valor_ref,valor_max,fecha,revisar_dias,verificado,sesgo,url,nota,orden) values ('LEM-RNG','Lemon.io Argentina','Todos los niveles (rango)','venta','USD/hora',20.0,null,60.0,'2026-08-01',90,'Sí','Vende talento (sesgo comercial)','https://lemon.io/rate-calculator/argentina/','Rango total de la plataforma para Argentina.',12) on conflict (id) do nothing;
insert into crm_giwa.mercado_referencias(id,fuente,rol,tipo,unidad,valor_min,valor_ref,valor_max,fecha,revisar_dias,verificado,sesgo,url,nota,orden) values ('LEM-US','Lemon.io USA','Senior','venta','USD/hora',null,68.0,null,'2026-08-01',90,'Sí','Vende talento (sesgo comercial)','https://lemon.io/rate-calculator/argentina/','Referencia de USA de la misma fuente.',13) on conflict (id) do nothing;
insert into crm_giwa.mercado_referencias(id,fuente,rol,tipo,unidad,valor_min,valor_ref,valor_max,fecha,revisar_dias,verificado,sesgo,url,nota,orden) values ('CLU-A','Clutch Argentina','Agencias, banda baja','venta','USD/hora',25.0,null,49.0,'2026-10-26',90,'Sí','Las declara cada agencia','https://clutch.co/ar/app-developers','Tarifa promedio por agencia, no por rol ni seniority. Fecha: actualización de ratings del listado.',14) on conflict (id) do nothing;
insert into crm_giwa.mercado_referencias(id,fuente,rol,tipo,unidad,valor_min,valor_ref,valor_max,fecha,revisar_dias,verificado,sesgo,url,nota,orden) values ('CLU-B','Clutch Argentina','Agencias, banda alta','venta','USD/hora',50.0,null,99.0,'2026-10-26',90,'Sí','Las declara cada agencia','https://clutch.co/ar/app-developers','Misma aclaración que CLU-A.',15) on conflict (id) do nothing;
insert into crm_giwa.mercado_referencias(id,fuente,rol,tipo,unidad,valor_min,valor_ref,valor_max,fecha,revisar_dias,verificado,sesgo,url,nota,orden) values ('DEV-AR','Develop Argentina','Desarrollador en Argentina','venta','USD/hora',30.0,null,70.0,'2025-12-03',90,'Sí','Proveedor de staffing (sesgo comercial)','https://developargentina.com/blog/argentina-nearshore-software-development-hub-2025','Blog del 3/12/2025.',16) on conflict (id) do nothing;
insert into crm_giwa.mercado_referencias(id,fuente,rol,tipo,unidad,valor_min,valor_ref,valor_max,fecha,revisar_dias,verificado,sesgo,url,nota,orden) values ('DEV-SEN','Develop Argentina','Senior','venta','USD/hora',35.0,null,65.0,'2026-03-28',90,'Sí','Proveedor de staffing (sesgo comercial)','https://developargentina.com/blog/cuanto-cuesta-hacer-app-argentina-2026','Guía de costos del 28/3/2026.',17) on conflict (id) do nothing;
insert into crm_giwa.mercado_referencias(id,fuente,rol,tipo,unidad,valor_min,valor_ref,valor_max,fecha,revisar_dias,verificado,sesgo,url,nota,orden) values ('DEV-SR','Develop Argentina','Senior full stack (unos 8 años)','venta','USD/hora',null,60.0,null,'2025-12-03',90,'Sí','Proveedor de staffing (sesgo comercial)','https://developargentina.com/blog/argentina-nearshore-software-development-hub-2025','Valor aproximado que da la fuente.',18) on conflict (id) do nothing;
insert into crm_giwa.mercado_referencias(id,fuente,rol,tipo,unidad,valor_min,valor_ref,valor_max,fecha,revisar_dias,verificado,sesgo,url,nota,orden) values ('HIR-IA','HiresLink','Agente de IA, LATAM','venta','USD/hora',30.0,null,75.0,null,90,'Fuente secundaria','Agencia (sesgo comercial)',null,'Según seniority y experiencia en producción. Completar URL y fecha.',19) on conflict (id) do nothing;
insert into crm_giwa.mercado_referencias(id,fuente,rol,tipo,unidad,valor_min,valor_ref,valor_max,fecha,revisar_dias,verificado,sesgo,url,nota,orden) values ('SEC-US','Second Talent','Agente de IA, USA, nivel medio','venta','USD/hora',119.0,null,185.0,null,90,'Fuente secundaria','Vende talento (sesgo comercial)',null,'Piso de USA, no de Argentina. Completar URL y fecha.',20) on conflict (id) do nothing;
insert into crm_giwa.mercado_referencias(id,fuente,rol,tipo,unidad,valor_min,valor_ref,valor_max,fecha,revisar_dias,verificado,sesgo,url,nota,orden) values ('UPW-IA','Upwork (varias fuentes secundarias)','Agente de IA freelance, global','venta','USD/hora',30.0,null,150.0,null,90,'Fuente secundaria','Rango muy amplio',null,'Solo orientativo. Completar fecha.',21) on conflict (id) do nothing;
insert into crm_giwa.mercado_referencias(id,fuente,rol,tipo,unidad,valor_min,valor_ref,valor_max,fecha,revisar_dias,verificado,sesgo,url,nota,orden) values ('TEC-JR','Teclab','Freelance internacional, junior','venta','USD/hora',20.0,null,35.0,null,90,'Referencia sin fuente declarada','Instituto educativo','https://teclab.edu.ar/tecnologia-y-desarrollo/cuanto-cobra-un-programador-en-argentina/','Es referencia internacional, no de Argentina.',22) on conflict (id) do nothing;
insert into crm_giwa.mercado_referencias(id,fuente,rol,tipo,unidad,valor_min,valor_ref,valor_max,fecha,revisar_dias,verificado,sesgo,url,nota,orden) values ('TEC-SS','Teclab','Freelance internacional, semi senior','venta','USD/hora',40.0,null,60.0,null,90,'Referencia sin fuente declarada','Instituto educativo','https://teclab.edu.ar/tecnologia-y-desarrollo/cuanto-cobra-un-programador-en-argentina/','Es referencia internacional, no de Argentina.',23) on conflict (id) do nothing;
insert into crm_giwa.mercado_referencias(id,fuente,rol,tipo,unidad,valor_min,valor_ref,valor_max,fecha,revisar_dias,verificado,sesgo,url,nota,orden) values ('TEC-SR','Teclab','Freelance internacional, senior','venta','USD/hora',65.0,null,90.0,null,90,'Referencia sin fuente declarada','Instituto educativo','https://teclab.edu.ar/tecnologia-y-desarrollo/cuanto-cobra-un-programador-en-argentina/','Es referencia internacional, no de Argentina.',24) on conflict (id) do nothing;
insert into crm_giwa.mercado_referencias(id,fuente,rol,tipo,unidad,valor_min,valor_ref,valor_max,fecha,revisar_dias,verificado,sesgo,url,nota,orden) values ('BLS-23','BLS (OEWS)','Software Developers USA','costo_salarial','USD/hora',37.03,63.59,100.3,'2023-05-01',90,'Sí (oficial)',null,'https://www.bls.gov/oes/','Mediana; mín = P10 y máx = P90. Código de ocupación 15-1252. Sueldo de empleado, sin cargas ni margen.',25) on conflict (id) do nothing;
insert into crm_giwa.mercado_referencias(id,fuente,rol,tipo,unidad,valor_min,valor_ref,valor_max,fecha,revisar_dias,verificado,sesgo,url,nota,orden) values ('BLS-25R','BLS (réplica de datos)','Software Developers USA','costo_salarial','USD/hora',null,65.38,null,'2025-05-01',90,'No: viene de un sitio que replica datos BLS',null,null,'USD 135.980 anuales. Confirmar en bls.gov antes de usar.',26) on conflict (id) do nothing;
insert into crm_giwa.mercado_referencias(id,fuente,rol,tipo,unidad,valor_min,valor_ref,valor_max,fecha,revisar_dias,verificado,sesgo,url,nota,orden) values ('GLA-US','Glassdoor','Software Developer USA','costo_salarial','USD/hora',null,59.0,null,null,90,'Fuente secundaria','Autodeclarado y estimado por modelo','https://www.glassdoor.com/','Promedio de USD 122.372 anuales. Completar fecha.',27) on conflict (id) do nothing;
insert into crm_giwa.mercado_referencias(id,fuente,rol,tipo,unidad,valor_min,valor_ref,valor_max,fecha,revisar_dias,verificado,sesgo,url,nota,orden) values ('SYS-JR','Sysarmy 2026.1 (vía Teclab y Coderhouse)','Junior','costo_salarial','ARS/mes',null,1538500.0,null,'2026-03-06',90,'Sí','Mismo dato que Teclab y Coderhouse: una sola fuente','https://sysarmy.com/','Mediana de sueldo bruto mensual. Se pasa a hora con horas_mes_sueldo y factor_cargas.',28) on conflict (id) do nothing;
insert into crm_giwa.mercado_referencias(id,fuente,rol,tipo,unidad,valor_min,valor_ref,valor_max,fecha,revisar_dias,verificado,sesgo,url,nota,orden) values ('SYS-SS','Sysarmy 2026.1 (vía Teclab y Coderhouse)','Semi senior','costo_salarial','ARS/mes',null,2501629.0,null,'2026-03-06',90,'Sí','Mismo dato que Teclab y Coderhouse: una sola fuente','https://sysarmy.com/','Mediana de sueldo bruto mensual.',29) on conflict (id) do nothing;
insert into crm_giwa.mercado_referencias(id,fuente,rol,tipo,unidad,valor_min,valor_ref,valor_max,fecha,revisar_dias,verificado,sesgo,url,nota,orden) values ('SYS-SR','Sysarmy 2026.1 (vía Teclab y Coderhouse)','Senior','costo_salarial','ARS/mes',null,3500000.0,null,'2026-03-06',90,'Sí','Mismo dato que Teclab y Coderhouse: una sola fuente','https://sysarmy.com/','Mediana de sueldo bruto mensual.',30) on conflict (id) do nothing;
insert into crm_giwa.mercado_parametros(id,valor,unidad,descripcion,actualizado,revisar_dias,fuente,orden) values ('horas_mes_sueldo','160','horas','Horas por mes para pasar un sueldo mensual a valor hora.','2026-10-27',365,'Supuesto: 8 h × 20 días. Editable.',2) on conflict (id) do nothing;
insert into crm_giwa.mercado_parametros(id,valor,unidad,descripcion,actualizado,revisar_dias,fuente,orden) values ('factor_cargas','1','multiplicador','Cargas sociales sobre el sueldo (1 = sin cargas).','2026-10-27',365,'A definir por vos. 1 = sueldo bruto sin cargas.',3) on conflict (id) do nothing;
insert into crm_giwa.mercado_parametros(id,valor,unidad,descripcion,actualizado,revisar_dias,fuente,orden) values ('meta_gratis_msj','1000','mensajes/mes','Mensajes de servicio gratis por mes y por número en WhatsApp.','2026-10-17',90,'Fuente: guías de precios WhatsApp API 2026 (desde 1/10/2026). Confirmar en el tarifario de Meta.',4) on conflict (id) do nothing;
insert into crm_giwa.mercado_parametros(id,valor,unidad,descripcion,actualizado,revisar_dias,fuente,orden) values ('garantia_dias','30','días','Días de ajustes incluidos sin abono.','2026-10-27',365,'Criterio comercial tuyo.',5) on conflict (id) do nothing;
insert into crm_giwa.mercado_parametros(id,valor,unidad,descripcion,actualizado,revisar_dias,fuente,orden) values ('colchon_pct','20','%','Colchón de horas para el escenario con contingencia.','2026-10-27',365,'Criterio mío. Editable.',6) on conflict (id) do nothing;
insert into crm_giwa.mercado_parametros(id,valor,unidad,descripcion,actualizado,revisar_dias,fuente,orden) values ('riesgo_pct','40','%','Colchón de horas para el escenario de riesgo técnico.','2026-10-27',365,'Criterio mío. Editable.',7) on conflict (id) do nothing;
insert into crm_giwa.mercado_parametros(id,valor,unidad,descripcion,actualizado,revisar_dias,fuente,orden) values ('dias_vieja','90','días','Pasados estos días una referencia de mercado figura como vieja.','2026-10-27',365,'Criterio mío. Editable.',8) on conflict (id) do nothing;
insert into crm_giwa.mercado_parametros(id,valor,unidad,descripcion,actualizado,revisar_dias,fuente,orden) values ('vh_objetivo_usd','50','USD por hora','Tu valor hora de venta estándar (objetivo de la banda).','2026-10-27',90,'Es la tarifa que ya negociaste con el cliente. Editable.',9) on conflict (id) do nothing;
insert into crm_giwa.mercado_parametros(id,valor,unidad,descripcion,actualizado,revisar_dias,fuente,orden) values ('costo_pct_venta','70','%','Costo como porcentaje de la venta (venta menos 30%).','2026-10-27',365,'Tu regla: costo = venta × 0,70.',10) on conflict (id) do nothing;
insert into crm_giwa.mercado_parametros(id,valor,unidad,descripcion,actualizado,revisar_dias,fuente,orden) values ('vh_soporte_usd','60','USD por hora','Valor hora de soporte sin abono (bolsa de horas).','2026-10-27',90,'Criterio mío: el soporte puntual interrumpe, por eso va sobre la tarifa de proyecto. Definilo vos.',11) on conflict (id) do nothing;
insert into crm_giwa.mercado_parametros(id,valor,unidad,descripcion,actualizado,revisar_dias,fuente,orden) values ('banda_mercado_usd','40,50,66,72','texto','Piso, objetivo, colegio y techo, para pegar en CotConfig.','2026-10-27',90,'Se calcula en la hoja Banda.',12) on conflict (id) do nothing;
insert into crm_giwa.mercado_plataforma(id,concepto,unidad,usd_min,usd_ref,usd_max,gratis_mes,vigente_desde,fecha,revisar_dias,fuente,verificado,nota,orden) values ('PL-01','WhatsApp · mensaje de servicio','USD por mensaje',null,0.026,null,1000,'2026-10-01','2026-10-17',90,'Guías de precios WhatsApp API 2026','Fuente secundaria; confirmar en el tarifario de Meta','Respuestas del bot dentro de la ventana de 24 h. Antes eran gratis. Facturación en pesos desde abril 2026.',1) on conflict (id) do nothing;
insert into crm_giwa.mercado_plataforma(id,concepto,unidad,usd_min,usd_ref,usd_max,gratis_mes,vigente_desde,fecha,revisar_dias,fuente,verificado,nota,orden) values ('PL-02','WhatsApp · plantilla de utilidad','USD por mensaje',null,0.026,null,0,null,'2026-10-17',90,'Guías de precios WhatsApp API 2026','Fuente secundaria; confirmar en el tarifario de Meta','Mensajes que inicia el negocio (recordatorios, avisos).',2) on conflict (id) do nothing;
insert into crm_giwa.mercado_plataforma(id,concepto,unidad,usd_min,usd_ref,usd_max,gratis_mes,vigente_desde,fecha,revisar_dias,fuente,verificado,nota,orden) values ('PL-03','WhatsApp · plantilla de marketing','USD por mensaje',null,0.0618,null,0,null,'2026-10-17',90,'Guías de precios WhatsApp API 2026','Fuente secundaria; confirmar en el tarifario de Meta','Algunas calculadoras muestran valores distintos.',3) on conflict (id) do nothing;
insert into crm_giwa.mercado_plataforma(id,concepto,unidad,usd_min,usd_ref,usd_max,gratis_mes,vigente_desde,fecha,revisar_dias,fuente,verificado,nota,orden) values ('PL-04','n8n Cloud','USD por mes',20.0,null,50.0,null,null,null,90,'Blog de agencia (Togahi)','Fuente secundaria','Completar fecha.',4) on conflict (id) do nothing;
insert into crm_giwa.mercado_plataforma(id,concepto,unidad,usd_min,usd_ref,usd_max,gratis_mes,vigente_desde,fecha,revisar_dias,fuente,verificado,nota,orden) values ('PL-05','Consumo de IA (tokens)','USD por mes',20.0,null,100.0,null,null,null,90,'Blog de agencia (Artics)','Fuente secundaria','Con tráfico normal. Completar fecha.',5) on conflict (id) do nothing;
insert into crm_giwa.mercado_plataforma(id,concepto,unidad,usd_min,usd_ref,usd_max,gratis_mes,vigente_desde,fecha,revisar_dias,fuente,verificado,nota,orden) values ('PL-06','Hosting y herramientas base','USD por mes',20.0,null,null,null,null,null,90,'Blog de agencia (Artics)','Fuente secundaria','Dice ''desde 20''. Completar fecha.',6) on conflict (id) do nothing;
insert into crm_giwa.mercado_speeches(id,caso,cuando,texto,huecos,nota,orden) values ('SP-1','1 · Sin abono','El cliente rechazó el mantenimiento mensual.','Entiendo que por ahora no querés un mantenimiento mensual. Para que el proyecto funcione igual, cerramos la implementación en USD {P_usd}, con {garantia} días de ajustes incluidos. Después de ese plazo, los cambios y el soporte se trabajan por bolsa de horas a USD {soporte_usd} la hora, y si más adelante preferís previsibilidad, se suma el mantenimiento. Los costos de plataforma ({plataforma_lista}) quedan a nombre de tu empresa: hoy estimamos unos USD {plataforma_usd} por mes, así ves el gasto real.','{P_usd} {garantia} {soporte_usd} {plataforma_lista} {plataforma_usd}','Sin abono, todo lo que pasa después de producción sale de tu margen: por eso la bolsa de horas.',1) on conflict (id) do nothing;
insert into crm_giwa.mercado_speeches(id,caso,cuando,texto,huecos,nota,orden) values ('SP-2','2 · Piden bajar la tarifa','El cliente pide una tarifa menor por hora.','Entiendo el pedido. El valor por hora ya está ajustado a USD {vh_usd} y no lo puedo bajar más sin resignar calidad en lo que entregamos. Lo que sí puedo hacer es acomodar el total a tu presupuesto reduciendo alcance: {modulos_a_sacar} (unas {horas_a_sacar} horas) pasan a una segunda etapa. Con eso, el total queda en USD {Px_usd}.','{vh_usd} {modulos_a_sacar} {horas_a_sacar} {Px_usd}','No bajes la hora sin sacar alcance ni recibir algo a cambio.',2) on conflict (id) do nothing;
insert into crm_giwa.mercado_speeches(id,caso,cuando,texto,huecos,nota,orden) values ('SP-3','3 · Cambió el costo de WhatsApp','El proyecto usa WhatsApp y el cliente no sabía del cobro de Meta.','Un aviso sobre los costos: desde el 1 de octubre Meta también cobra las respuestas del bot por mensaje, después de {meta_gratis} gratis por mes por número. Con el volumen que estimamos serían unos USD {meta_usd} por mes, a cargo de tu empresa. Si preferís evitarlo, podemos operar por Telegram, que no tiene costo por mensaje.','{meta_gratis} {meta_usd}','Confirmá el precio vigente en el tarifario de Meta antes de enviarlo.',3) on conflict (id) do nothing;
insert into crm_giwa.mercado_speeches(id,caso,cuando,texto,huecos,nota,orden) values ('SP-4','4 · No le cierra: averiguar por qué','Primera respuesta cuando dice que la propuesta no le cierra.','Gracias por contarme. Para ajustar la propuesta sin perder lo que más te importa, ¿qué es lo que no te cierra: el monto total, cuándo se paga o el alcance? Con eso te armo una versión completa y otra por etapas, con el mismo valor por hora.','(ninguno)','Antes de bajar nada, averiguá cuál de los tres es el problema.',4) on conflict (id) do nothing;
insert into crm_giwa.mercado_speeches(id,caso,cuando,texto,huecos,nota,orden) values ('SP-5','5 · No le cierra: dos opciones','Ya sabés que el problema es el monto. Se ofrecen dos caminos.','Te dejo dos caminos. Opción A, completa: USD {P_usd} por {H} horas de trabajo. Opción B, primera etapa: USD {PB_usd} por {HB} horas; {modulos_a_sacar} quedan para una segunda etapa. En las dos el valor por hora es el mismo (USD {vh_usd}): cambia lo que se construye y cuándo. ¿Con cuál preferís arrancar?','{P_usd} {H} {PB_usd} {HB} {modulos_a_sacar} {vh_usd}','Elegir entre A y B cierra más que preguntar si le interesa.',5) on conflict (id) do nothing;
insert into crm_giwa.mercado_speeches(id,caso,cuando,texto,huecos,nota,orden) values ('SP-6','6 · Dice que es caro o consigue más barato','Compara con otra propuesta o con una tarifa menor.','Entiendo la comparación. Además de la hora conviene mirar dos cosas: cuántas horas lleva el trabajo y qué queda incluido. Yo te cotizo el entregable cerrado en USD {P_usd}, con {garantia} días de ajustes incluidos. Si tenés otra propuesta, mandámela y la revisamos juntos punto por punto: qué incluye, qué no y cuánto cuesta mantenerlo. Si el alcance es el mismo, te muestro dónde podemos ajustar sin tocar lo esencial.','{P_usd} {garantia}','No afirmes cuántas horas necesita otro proveedor si no lo podés demostrar.',6) on conflict (id) do nothing;
insert into crm_giwa.mercado_speeches(id,caso,cuando,texto,huecos,nota,orden) values ('SP-7','7 · No cierra: no hay presupuesto ahora','El proyecto le interesa pero no tiene partida este período.','Entiendo que ahora no está en el presupuesto. Te propongo arrancar con una primera etapa de USD {PB_usd} ({HB} horas) y dejar {modulos_a_sacar} para cuando haya partida. El valor por hora no cambia: USD {vh_usd}.','{PB_usd} {HB} {modulos_a_sacar} {vh_usd}','No prometas congelar el precio de la segunda etapa si no lo vas a cumplir.',7) on conflict (id) do nothing;
insert into crm_giwa.mercado_speeches(id,caso,cuando,texto,huecos,nota,orden) values ('SP-8','8 · No responde después de enviar','Pasaron varios días sin respuesta a la propuesta.','Hola {nombre}, ¿cómo estás? Te escribo por la propuesta de {proyecto}, que sigue vigente hasta el {fecha_vigencia}. Si el monto o el alcance son lo que frena la decisión, puedo armarte una versión por etapas con un primer pago menor. ¿La vemos 15 minutos esta semana?','{nombre} {proyecto} {fecha_vigencia}','Un mensaje corto y con fecha, sin presionar.',8) on conflict (id) do nothing;

-- Parámetro de mercado como número
create or replace function crm_giwa.mercado_param(k text) returns numeric language sql stable as $$
  select crm_giwa.num_ar(valor) from crm_giwa.mercado_parametros where id = k
$$;

-- Referencias en USD por hora con el TC del CRM; «Vieja» pasados dias_vieja (Parametros)
create or replace view crm_giwa.v_mercado_referencias with (security_invoker = true) as
with tc as (select coalesce(nullif((select valor from crm_giwa.v_tipo_cambio_hoy), 0),
                            nullif(crm_giwa.num_ar((select valor from crm_giwa.cot_config where clave = 'tc_default')), 0), 1) v),
     p as (select coalesce(crm_giwa.mercado_param('horas_mes_sueldo'), 160) hm, coalesce(crm_giwa.mercado_param('factor_cargas'), 1) fc,
                  coalesce(crm_giwa.mercado_param('dias_vieja'), 90) dv)
select r.*, round(case r.unidad when 'USD/hora' then r.valor_min when 'ARS/hora' then r.valor_min / tc.v else r.valor_min * p.fc / p.hm / tc.v end, 2) usd_min,
            round(case r.unidad when 'USD/hora' then r.valor_ref when 'ARS/hora' then r.valor_ref / tc.v else r.valor_ref * p.fc / p.hm / tc.v end, 2) usd_ref,
            round(case r.unidad when 'USD/hora' then r.valor_max when 'ARS/hora' then r.valor_max / tc.v else r.valor_max * p.fc / p.hm / tc.v end, 2) usd_max,
       case when r.fecha is null then 'Falta fecha' when crm_giwa.hoy() - r.fecha > p.dv then 'Vieja' else 'Vigente' end estado,
       tc.v tc
  from crm_giwa.mercado_referencias r, tc, p;
grant select on crm_giwa.v_mercado_referencias to authenticated;

-- Datos (C6): las tablas de mercado también se administran desde ahí
create or replace function crm_giwa._admin_tablas() returns text[] language sql immutable as $$
  select array['empresas','contactos','razones_sociales','proyectos','desarrollos','cobros','tareas','comentarios',
               'gastos_internos','entregables','proveedor_docs','proyecto_horas','proyecto_costos',
               'mercado_referencias','mercado_parametros','mercado_plataforma','mercado_speeches']
$$;

-- ── 2 · Cotizador ────────────────────────────────────────────────────
-- Las listas de CotHerramientas.js (COT_WA, COT_IG, COT_INTEG, COT_RW, COT_SISTEMAS)
create or replace function crm_giwa._cot_reglas() returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'wa', '["IA-018","BOT-004","AUT-009"]'::jsonb, 'ig', '["IA-019","BOT-012"]'::jsonb,
    'integ', '["IA-038","IA-075","APP-012","APP-058"]'::jsonb,
    'rw', '["IA-038","IA-075","APP-012","APP-058","IA-040","IA-041","IA-071","APP-053","APP-054","AUT-003","AUT-006","AUT-021","AUT-022","AUT-024"]'::jsonb,
    'sistemas', '["Dentalink","Dental Care","Total Dental","Xintel","SAP","Tango","Odoo","Salesforce","HubSpot","AppSheet","Jira","InvGate","Presea","Conecta Rugby","UAR","Looker","Pluscargo","Magento"]'::jsonb)
$$;
create or replace function crm_giwa._cot_j(t text) returns jsonb language plpgsql immutable as $$
begin return coalesce(nullif(btrim(coalesce(t, '')), '')::jsonb, '{}'::jsonb); exception when others then return '{}'::jsonb; end $$;
create or replace function crm_giwa._cot_tc() returns numeric language sql stable as $$
  select coalesce(nullif((select valor from crm_giwa.v_tipo_cambio_hoy), 0),
                  nullif(crm_giwa.num_ar((select valor from crm_giwa.cot_config where clave = 'tc_default')), 0), 1)
$$;
create or replace function crm_giwa._cot_editable(est text) returns boolean language sql immutable as $$
  select coalesce(est, '') in ('Borrador', 'Prospecto', 'Negociación')
$$;
create or replace function crm_giwa._cot_es_mant(d crm_giwa.desarrollos) returns boolean language sql immutable as $$
  select d.tipo_id = 'MM' or coalesce(array_length(d.mant_de, 1), 0) > 0
$$;
-- Lo que entra al motor: Sí y en 1ª etapa (lo de etapa futura queda en la minuta, no en el precio)
create or replace function crm_giwa._cot_sel(m jsonb) returns jsonb language sql immutable as $$
  select coalesce(jsonb_object_agg(k, true), '{}'::jsonb) from jsonb_each_text(coalesce(m -> 'r', '{}')) e(k, v)
   where v = 'Sí' and coalesce(m -> 'etapa' ->> k, '') <> 'futura'
$$;
-- Costos de terceros que van a proyecto_costos: [{cid, cantidad, paga}]
create or replace function crm_giwa._cot_ext(m jsonb) returns jsonb language sql immutable as $$
  select coalesce(jsonb_agg(jsonb_build_object('cid', y ->> 'cid', 'cantidad', crm_giwa.num_ar(y ->> 'cantidad'),
                                               'paga', case when x ->> 'paga' = 'GIWA' then 'GIWA' else 'Cliente' end)), '[]'::jsonb)
    from jsonb_each(coalesce(m -> 'ext', '{}')) e(id, x),
         jsonb_array_elements(case when jsonb_typeof(x -> 'items') = 'array' then x -> 'items'
                                   when x ? 'cid' then jsonb_build_array(jsonb_build_object('cid', x -> 'cid', 'cantidad', x -> 'cantidad'))
                                   else '[]'::jsonb end) y
   where (id = '_terceros' or (coalesce(m -> 'r' ->> id, '') = 'Sí' and coalesce(m -> 'etapa' ->> id, '') <> 'futura'))
     and coalesce(y ->> 'cid', '') <> '' and crm_giwa.num_ar(y ->> 'cantidad') > 0
$$;
-- Horas del abono (regla de oro 22/10): 5 h + 0,5 WhatsApp + 0,5 Instagram + 1 integración, una vez cada uno
create or replace function crm_giwa._cot_mant_hs(ids text[]) returns numeric language sql stable as $$
  with r as (select crm_giwa._cot_reglas() j),
       c as (select coalesce(nullif(crm_giwa.num_ar((select valor from crm_giwa.cot_config where clave = 'mant_hs_base')), 0), 5) b,
                    coalesce(nullif(crm_giwa.num_ar((select valor from crm_giwa.cot_config where clave = 'mant_hs_canal')), 0), 0.5) k,
                    coalesce(nullif(crm_giwa.num_ar((select valor from crm_giwa.cot_config where clave = 'mant_hs_integracion')), 0), 1) i)
  select round(c.b + case when exists (select 1 from jsonb_array_elements_text(r.j -> 'wa') x where x = any(ids)) then c.k else 0 end
                   + case when exists (select 1 from jsonb_array_elements_text(r.j -> 'ig') x where x = any(ids)) then c.k else 0 end
                   + case when exists (select 1 from jsonb_array_elements_text(r.j -> 'rw') x where x = any(ids)) then c.i else 0 end, 2)
    from r, c
$$;
-- Hora de soporte (VHSOPORTEGIWAARS; si no, la de USD × TC)
create or replace function crm_giwa._cot_vh_soporte() returns numeric language sql stable as $$
  select coalesce(nullif(crm_giwa.num_ar((select valor from crm_giwa.cot_config where clave = 'VHSOPORTEGIWAARS')), 0),
                  round(crm_giwa.num_ar((select valor from crm_giwa.cot_config where clave = 'VHSOPORTEGIWAUSD')) * crm_giwa._cot_tc()))
$$;

-- Costos de terceros de un desarrollo: los de Contrataciones se reemplazan (como _guardarContrataciones)
create or replace function crm_giwa._cot_costos(pid text, did text, ext jsonb) returns int language plpgsql as $$
declare x jsonb; c crm_giwa.contrataciones; tc numeric := crm_giwa._cot_tc(); q numeric; a numeric; n int := 0;
begin
  delete from crm_giwa.proyecto_costos where desarrollo_id = did and coalesce(contratacion_id, '') <> '';
  for x in select * from jsonb_array_elements(coalesce(ext, '[]'::jsonb)) loop
    select * into c from crm_giwa.contrataciones where id = x ->> 'cid'; continue when c.id is null;
    q := coalesce(nullif(crm_giwa.num_ar(x ->> 'cantidad'), 0), 1);
    a := coalesce(nullif(c.costo_ars, 0), round(coalesce(c.costo_usd, 0) * tc));
    insert into crm_giwa.proyecto_costos (id, proyecto_id, desarrollo_id, tipo, descripcion, proveedor, recurrencia, externo, unidad, cantidad,
                                          usd, ars, total_usd, total_ars, tipo_cambio, creador, fecha_agregado, incluido, contratacion_id)
    values (crm_giwa.proximo_id('PC', 'proyecto_costos', 4), pid, did, coalesce(nullif(c.categoria, ''), 'Contratación'), c.producto,
            btrim(split_part(split_part(c.producto, '·', 1), '(', 1)), 'Mensual', x ->> 'paga' <> 'GIWA', coalesce(nullif(c.unidad, ''), 'Mensual'),
            q, coalesce(c.costo_usd, 0), a, round(coalesce(c.costo_usd, 0) * q, 2), round(a * q), tc, crm_giwa.mi_mail(), crm_giwa.hoy(), true, c.id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Integración con un sistema externo → tarea Alta «Validar conector API y seguridad con …»
create or replace function crm_giwa._cot_tarea_integracion(pid text, did text, sistema text, detalle text) returns text language plpgsql as $$
declare nid text; resp text := 's.echavarria@giwa-ia.com';   -- Sebastián (en el Apps Script, sebastian@giwa-ia.com)
begin
  if not exists (select 1 from crm_giwa.usuarios where mail = resp) then resp := crm_giwa.mi_mail(); end if;
  nid := crm_giwa._alta_tarea(jsonb_build_object('type', 'Tarea', 'title', 'Validar conector API y seguridad con ' || coalesce(nullif(btrim(sistema), ''), 'el sistema externo'),
           'detail', coalesce(detalle, ''), 'projectId', pid, 'itemIds', did, 'priority', 'Alta', 'assignees', resp, 'origin', 'Cotizador'));
  return nid;
end $$;
-- Sistemas nombrados en un texto (la lista conocida); si no hay ninguno, «el sistema externo»
create or replace function crm_giwa._cot_sistemas(txt text) returns text[] language sql stable as $$
  select coalesce(nullif(array_agg(s), '{}'), array['el sistema externo'])
    from jsonb_array_elements_text(crm_giwa._cot_reglas() -> 'sistemas') s
   where coalesce(txt, '') ~* ('\m' || replace(s, ' ', '\s+') || '\M')
$$;

-- Un desarrollo del Cotizador y lo que cuelga de él (horas y costos)
create or replace function crm_giwa._cot_borrar_des(did text) returns void language plpgsql as $$
begin
  delete from crm_giwa.proyecto_costos where desarrollo_id = did;
  delete from crm_giwa.proyecto_horas where desarrollo_id = did;
  delete from crm_giwa.desarrollos where id = did;
end $$;

-- ── Lecturas ──
-- Borradores, Prospectos y en Negociación: lo que todavía se edita en el Cotizador
create or replace function crm_giwa.cot_listar() returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'empresa', coalesce(e.nombre, p.empresa_id), 'empresa_id', p.empresa_id, 'nombre', p.nombre,
           'estado', p.estado_id, 'borrador', p.estado_id = 'Borrador', 'fecha', p.creado::date,
           'total', (select coalesce(round(sum(d.total_ars)), 0) from crm_giwa.desarrollos d where d.proyecto_id = p.id and not crm_giwa._cot_es_mant(d)))
         order by p.creado desc), '[]'::jsonb)
    from crm_giwa.proyectos p left join crm_giwa.empresas e on e.id = p.empresa_id
   where crm_giwa._cot_editable(p.estado_id)
$$;

create or replace function crm_giwa.cot_inicio() returns jsonb language sql stable as $$
  select jsonb_build_object('ok', true,
    'empresas', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'nombre', e.nombre, 'tier', e.tier_id,
                   'mult', coalesce((select nullif(t.multiplicador, 0) from crm_giwa.tier t where crm_giwa.norm(t.id) = crm_giwa.norm(e.tier_id)), 1)) order by e.nombre), '[]')
                   from crm_giwa.empresas e where e.nombre !~* '^giwa\M'),
    'contactos', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'nombre', btrim(coalesce(c.nombre, '') || ' ' || coalesce(c.apellido, '')),
                   'empresa', c.empresa_id, 'tel', c.telefono) order by c.nombre), '[]') from crm_giwa.contactos c),
    'contrataciones', (select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'categoria', k.categoria, 'producto', k.producto, 'unidad', k.unidad,
                   'usd', k.costo_usd, 'ars', k.costo_ars) order by k.orden), '[]') from crm_giwa.contrataciones k where coalesce(k.producto, '') <> ''),
    'modelos', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'nombre', m.nombre) order by m.orden), '[]') from crm_giwa.modelos_pago m
                 where coalesce(m.tipo, '') <> 'recurrente' and m.id <> 'FP-03'),
    'valores', jsonb_build_object('giwa', crm_giwa.num_ar((select valor from crm_giwa.cot_config where clave = 'vh_giwa_ars')),
                 'costo', crm_giwa.num_ar((select valor from crm_giwa.cot_config where clave = 'vh_costo_ars')),
                 'mercado', crm_giwa.num_ar((select valor from crm_giwa.cot_config where clave = 'vh_mercado_ars')),
                 'soporte', crm_giwa._cot_vh_soporte(), 'tc', crm_giwa._cot_tc()),
    'reglas', crm_giwa._cot_reglas(), 'lista', crm_giwa.cot_listar())
$$;

-- Un proyecto para seguir editándolo (getCotizacionCot)
create or replace function crm_giwa.cot_leer(pid text) returns jsonb language plpgsql stable as $$
declare p crm_giwa.proyectos; devs jsonb;
begin
  select * into p from crm_giwa.proyectos where id = pid;
  if p.id is null then raise exception 'No existe %', pid; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'tipo', d.tipo_id, 'titulo', d.titulo, 'objetivo', coalesce(m ->> 'objetivo', d.descripcion),
           'r', coalesce(m -> 'r', '{}'), 'cant', coalesce(m -> 'cant', '{}'), 'etapa', coalesce(m -> 'etapa', '{}'), 'notas', coalesce(m -> 'notas', '{}'),
           'ext', coalesce(m -> 'ext', '{}'), 'base', coalesce(m -> 'base', '{}'), 'na', coalesce(m -> 'na', '{}'), 'mejora', coalesce((m ->> 'mejora')::boolean, false),
           'precio', crm_giwa.num_ar(m ->> 'precio'), 'total', d.total_ars, 'horas', d.duracion_horas, 'estado', d.estado_id,
           'moneda', coalesce(d.moneda, 'ARS'), 'forma_pago', d.modelo_pago_id, 'inicio', d.fecha_inicio,
           'vh', crm_giwa.num_ar(m ->> 'vh'), 'vh_sop', crm_giwa.num_ar(m ->> 'vh_soporte'), 'semanas', crm_giwa.num_ar(m ->> 'semanas'),
           'mant', coalesce((select jsonb_build_object('on', true, 'id', x.id, 'hs', coalesce(x.mantenimiento_horas, 0), 'exc', x.soporte_hora_ars,
                       'ipc', coalesce(x.ajuste, '') ~* 'ipc|ajuste' and coalesce(x.ajuste, '') !~* 'sin', 'modalidad', coalesce(m ->> 'mant_modalidad', 'Abono fijo'),
                       'abono', coalesce(nullif(x.valor_cuota_actual, 0), x.cuota), 'cubre', to_jsonb(x.mant_de))
                     from crm_giwa.desarrollos x where x.proyecto_id = p.id and d.id = any(x.mant_de) and crm_giwa._cot_es_mant(x)
                     order by (x.mant_de[1] = d.id) desc limit 1),
                   jsonb_build_object('on', false)))
         order by d.creado, d.id), '[]'::jsonb) into devs
    from crm_giwa.desarrollos d, lateral (select crm_giwa._cot_j(d.minuta) m) mm
   where d.proyecto_id = p.id and not crm_giwa._cot_es_mant(d);
  return jsonb_build_object('ok', true, 'pid', p.id, 'estado', p.estado_id, 'editable', crm_giwa._cot_editable(p.estado_id),
    'empresa', p.empresa_id, 'nombre', p.nombre, 'sponsor', p.sponsor_id, 'contactos', p.contactos, 'owner', p.owner,
    'fecha', p.creado::date, 'resumen', p.resumen_ejecutivo, 'minuta', crm_giwa._cot_j(p.minuta), 'devs', devs);
end $$;

-- «Partir de un proyecto existente»: las funcionalidades de sus desarrollos (getBaseReutilizar)
create or replace function crm_giwa.cot_base(pid text) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(z order by z ->> 'id'), '[]'::jsonb) from (
    select jsonb_build_object('id', d.id, 'tipo', d.tipo_id, 'titulo', d.titulo, 'alcance', d.descripcion,
             'ids', (select coalesce(jsonb_agg(distinct i), '[]') from (
                       select h.modulo_id i from crm_giwa.proyecto_horas h where h.desarrollo_id = d.id and coalesce(h.modulo_id, '') <> ''
                       union select k from jsonb_each_text(coalesce(crm_giwa._cot_j(d.minuta) -> 'r', '{}')) e(k, v) where v = 'Sí') q),
             'cant', coalesce(crm_giwa._cot_j(d.minuta) -> 'cant', '{}')) z
      from crm_giwa.desarrollos d where d.proyecto_id = pid and not crm_giwa._cot_es_mant(d)) w
   where jsonb_array_length(z -> 'ids') > 0
$$;

-- «Buscar minuta»: minutas y resúmenes guardados de una empresa (getMinutasCot)
create or replace function crm_giwa.cot_minutas(empresa text) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(x order by x ->> 'fecha' desc), '[]'::jsonb) from (
    select jsonb_build_object('pid', p.id, 'nombre', p.nombre, 'estado', p.estado_id, 'fecha', p.creado::date,
             'texto', coalesce(nullif(crm_giwa._cot_j(p.minuta) ->> 'texto', ''),
                               (select string_agg(e ->> 'texto', E'\n\n') from jsonb_array_elements(case when jsonb_typeof(crm_giwa._cot_j(p.minuta) -> 'entradas') = 'array'
                                                                                                    then crm_giwa._cot_j(p.minuta) -> 'entradas' else '[]' end) e),
                               p.resumen_ejecutivo, '')) x
      from crm_giwa.proyectos p where coalesce(empresa, '') = '' or p.empresa_id = empresa
     order by p.creado desc limit 60) y
   where length(btrim(x ->> 'texto')) > 10
$$;

-- «Evaluar costos» (calcularHerramientas): la más económica, una intermedia y la recomendada, puntaje sobre 23
create or replace function crm_giwa.cot_herramientas(c jsonb) returns jsonb language plpgsql stable as $$
declare tc numeric := crm_giwa._cot_tc(); mx numeric := coalesce(nullif(crm_giwa.num_ar(c ->> 'costo_max'), 0), 99999);
  si_b boolean := coalesce(c ->> 'backend', '') ~* '^(s|t)'; si_d boolean := coalesce(c ->> 'db', '') ~* '^(s|t)';
  ev boolean := coalesce(c ->> 'evitar_tarjeta', '') ~* '^(s|t)'; L jsonb; rec jsonb; eco jsonb; med jsonb;
begin
  select coalesce(jsonb_agg(x), '[]') into L from (
    select jsonb_build_object('cid', a.contratacion_id, 'producto', k.producto, 'usd', u.usd, 'ars', coalesce(nullif(k.costo_ars, 0), round(u.usd * tc)),
             'rec', coalesce(a.recomendada, false), 'ideal', a.ideal,
             'puntos', (case when ev and not coalesce(a.tarjeta, false) then 4 else 0 end) + (case when si_b and a.backend then 3 else 0 end)
                     + (case when si_d and a.db then 3 else 0 end) + (case when u.usd <= mx then 4 else 0 end)
                     + (case when c ->> 'presupuesto' = 'Bajo' and u.usd <= 10 then 4 else 0 end)
                     + (case when c ->> 'complejidad' = 'Baja' and a.complejidad = 'Baja' then 3 else 0 end) + (case when a.riesgo = 'Bajo' then 2 else 0 end)) x
      from crm_giwa.alternativas a join crm_giwa.contrataciones k on k.id = a.contratacion_id,
           lateral (select coalesce(nullif(k.costo_usd, 0), case when coalesce(k.costo_ars, 0) > 0 then round(k.costo_ars / tc, 2) else 0 end) usd) u
     where (coalesce(c ->> 'categoria', '') = '' or a.categoria = c ->> 'categoria')
       and not (si_b and not coalesce(a.backend, false)) and not (si_d and not coalesce(a.db, false))) q;
  if jsonb_array_length(L) = 0 then return jsonb_build_object('ok', true, 'opciones', '[]'::jsonb, 'maximo', 23); end if;
  select x into rec from jsonb_array_elements(L) x order by (x ->> 'puntos')::int desc, (x ->> 'rec')::boolean desc, (x ->> 'usd')::numeric limit 1;
  select x into eco from jsonb_array_elements(L) x where x <> rec order by (x ->> 'usd')::numeric, (x ->> 'puntos')::int desc limit 1;
  select x into med from jsonb_array_elements(L) x where x <> rec and x is distinct from eco order by (x ->> 'puntos')::int desc, (x ->> 'usd')::numeric limit 1;
  return jsonb_build_object('ok', true, 'maximo', 23, 'opciones',
    (case when eco is not null then jsonb_build_array(eco || '{"rol":"Más económica"}') else '[]' end)
    || (case when med is not null then jsonb_build_array(med || '{"rol":"Intermedia"}') else '[]' end)
    || jsonb_build_array(rec || '{"rol":"Recomendada"}'));
end $$;

-- ── Escrituras ──
-- Guardar borrador (o los cambios de un Prospecto / Negociación) · guardarCotizacionCot
-- d = { pid, empresa, nombre, sponsor (uno o varios, separados por coma), owner, minuta:{…}, borrados:[did],
--       devs:[{ id, tipo, titulo, objetivo, r, cant, etapa, notas, ext, base, na, mejora, precio, moneda, forma_pago, inicio,
--               vh, vh_sop, semanas, mant:{ on, id, hs, exc, ipc, modalidad, abono, comparte (índice del que lo tiene) } }] }
-- Un Borrador no escribe horas ni costos: eso pasa al Crear.
create or replace function crm_giwa.cot_guardar(d jsonb) returns jsonb language plpgsql as $$
declare
  emp text := nullif(btrim(d ->> 'empresa'), ''); nom text := btrim(coalesce(d ->> 'nombre', ''));
  pid text := nullif(btrim(d ->> 'pid'), ''); est text := 'Borrador'; borr boolean; yo text := crm_giwa.mi_mail();
  sps text[] := crm_giwa.lista_csv(d ->> 'sponsor'); min jsonb := coalesce(d -> 'minuta', '{}');
  tc numeric := crm_giwa._cot_tc(); v jsonb; i int := 0; did text; mid text; e jsonb; tot numeric; hs numeric; mt jsonb; ab numeric;
  x crm_giwa.desarrollos; out jsonb := '[]'; ids text[] := '{}'; mids text[] := '{}'; k int; tit text;
begin
  if emp is null or nom = '' then raise exception 'Falta la empresa o el nombre del proyecto'; end if;
  perform pg_advisory_xact_lock(hashtext('crm_giwa.ids'));
  if pid is not null then
    select estado_id into est from crm_giwa.proyectos where id = pid;
    if est is null then raise exception 'No existe %', pid; end if;
    if not crm_giwa._cot_editable(est) then raise exception 'Ya está aprobado: se edita desde Proyectos'; end if;
    update crm_giwa.proyectos set empresa_id = emp, nombre = nom, sponsor_id = sps[1], contactos = array_to_string(sps, ','),
           owner = coalesce(nullif(d ->> 'owner', ''), owner), resumen_ejecutivo = nullif(btrim(coalesce(min ->> 'objetivo', '')), ''), minuta = min::text
     where id = pid;
  else
    pid := crm_giwa.proximo_id('P', 'proyectos', 4);
    insert into crm_giwa.proyectos (id, empresa_id, nombre, sponsor_id, contactos, owner, tipo, estado_id, probabilidad, detenido, resumen_ejecutivo, minuta)
    values (pid, emp, nom, sps[1], array_to_string(sps, ','), coalesce(nullif(d ->> 'owner', ''), yo), 'Cliente', est, 50, false,
            nullif(btrim(coalesce(min ->> 'objetivo', '')), ''), min::text);
  end if;
  borr := est = 'Borrador';

  -- Lo que se sacó: sólo desarrollos de este proyecto que no se aprobaron
  for did in select jsonb_array_elements_text(coalesce(d -> 'borrados', '[]')) loop
    select * into x from crm_giwa.desarrollos where id = did and proyecto_id = pid;
    continue when x.id is null;
    if crm_giwa.estado_canonico(x.estado_id) <> 'nueva' then raise exception '% ya no está en Nuevo: no se borra desde el Cotizador', did; end if;
    perform crm_giwa._cot_borrar_des(did);
  end loop;

  for v in select * from jsonb_array_elements(coalesce(d -> 'devs', '[]')) loop
    tit := coalesce(nullif(btrim(v ->> 'titulo'), ''), v ->> 'tipo');
    e := crm_giwa.estimar_desarrollo(v ->> 'tipo', emp, jsonb_build_object('sel', crm_giwa._cot_sel(v), 'cant', coalesce(v -> 'cant', '{}'),
                                                                       'mejora', coalesce(v -> 'mejora', 'false'::jsonb)));
    hs := case when (e ->> 'ok')::boolean then (e ->> 'horas')::numeric end;
    tot := round(coalesce(nullif(crm_giwa.num_ar(v ->> 'precio'), 0), case when (e ->> 'ok')::boolean then (e ->> 'total_ars')::numeric end, 0));
    did := nullif(v ->> 'id', '');
    if did is not null then
      select * into x from crm_giwa.desarrollos where id = did and proyecto_id = pid;
      if x.id is null then raise exception 'El desarrollo % no es de este proyecto', did; end if;
      if crm_giwa.estado_canonico(x.estado_id) <> 'nueva' then raise exception '% ya no está en Nuevo: se edita desde Proyectos', did; end if;
      update crm_giwa.desarrollos set tipo_id = v ->> 'tipo', titulo = tit, descripcion = nullif(btrim(coalesce(v ->> 'objetivo', '')), ''),
             total_ars = tot, total_usd = round(tot / tc, 2), tipo_cambio = tc, moneda = coalesce(nullif(v ->> 'moneda', ''), 'ARS'),
             modelo_pago_id = coalesce(nullif(v ->> 'forma_pago', ''), modelo_pago_id), fecha_inicio = nullif(v ->> 'inicio', '')::date,
             duracion_horas = hs, tier_id = coalesce(e ->> 'tier', tier_id),
             valor_hora = case when coalesce(hs, 0) > 0 then round(tot / hs) else valor_hora end
       where id = did;
    else
      did := crm_giwa.proximo_id('D', 'desarrollos', 4);
      insert into crm_giwa.desarrollos (id, proyecto_id, tipo_id, titulo, descripcion, estado_id, moneda, total_ars, total_usd, tipo_cambio, q_cuotas,
                                        modelo_pago_id, fecha_inicio, creador, tier_id, duracion_horas, valor_hora, mant_de, detenido, bonificado)
      values (did, pid, v ->> 'tipo', tit, nullif(btrim(coalesce(v ->> 'objetivo', '')), ''), 'Nuevo', coalesce(nullif(v ->> 'moneda', ''), 'ARS'),
              tot, round(tot / tc, 2), tc, 1, nullif(v ->> 'forma_pago', ''), nullif(v ->> 'inicio', '')::date, yo, e ->> 'tier', hs,
              case when coalesce(hs, 0) > 0 then round(tot / hs) end, '{}', false, false);
    end if;
    update crm_giwa.desarrollos set minuta = jsonb_build_object('objetivo', coalesce(v ->> 'objetivo', ''), 'r', coalesce(v -> 'r', '{}'),
             'cant', coalesce(v -> 'cant', '{}'), 'etapa', coalesce(v -> 'etapa', '{}'), 'notas', coalesce(v -> 'notas', '{}'),
             'ext', coalesce(v -> 'ext', '{}'), 'base', coalesce(v -> 'base', '{}'), 'na', coalesce(v -> 'na', '{}'),
             'mejora', coalesce(v -> 'mejora', 'false'::jsonb), 'precio', crm_giwa.num_ar(v ->> 'precio'),
             'vh', v -> 'vh', 'vh_soporte', v -> 'vh_sop', 'semanas', v -> 'semanas',
             'mant_modalidad', v -> 'mant' -> 'modalidad', 'mant_comparte', v -> 'mant' -> 'comparte')::text
     where id = did;
    if not borr then
      perform crm_giwa.guardar_modulos_desarrollo(did, jsonb_build_object('tipo', v ->> 'tipo', 'sel', crm_giwa._cot_sel(v),
                                                   'cant', coalesce(v -> 'cant', '{}'), 'mejora', coalesce(v -> 'mejora', 'false'::jsonb)));
      perform crm_giwa._cot_costos(pid, did, crm_giwa._cot_ext(v));
    end if;

    -- Mantenimiento propio (el compartido se suma después al del otro desarrollo)
    mt := coalesce(v -> 'mant', '{}'); mid := nullif(mt ->> 'id', '');
    if coalesce((mt ->> 'on')::boolean, false) and coalesce(mt ->> 'comparte', '') = '' then
      ab := round(coalesce(crm_giwa.num_ar(mt ->> 'abono'), 0));
      if mid is not null and exists (select 1 from crm_giwa.desarrollos where id = mid and proyecto_id = pid) then
        update crm_giwa.desarrollos set titulo = 'Mantenimiento — ' || tit, descripcion = 'Mantenimiento mensual de ' || tit,
               total_ars = ab * 12, total_usd = round(ab * 12 / tc, 2), tipo_cambio = tc, q_cuotas = 12, cuota = ab, valor_cuota_actual = ab,
               mantenimiento_horas = coalesce(nullif(crm_giwa.num_ar(mt ->> 'hs'), 0), 6), soporte_hora_ars = crm_giwa.num_ar(mt ->> 'exc'),
               ajuste = case when coalesce((mt ->> 'ipc')::boolean, true) then 'IPC trimestral' else 'Sin Ajuste' end, mant_de = array[did]
         where id = mid and crm_giwa.estado_canonico(estado_id) = 'nueva';
      else
        mid := crm_giwa.proximo_id('D', 'desarrollos', 4);
        insert into crm_giwa.desarrollos (id, proyecto_id, tipo_id, titulo, descripcion, estado_id, moneda, total_ars, total_usd, tipo_cambio,
                                          q_cuotas, cuota, valor_cuota_actual, mantenimiento_horas, soporte_hora_ars, ajuste, modelo_pago_id, creador, mant_de, detenido, bonificado)
        values (mid, pid, 'MM', 'Mantenimiento — ' || tit, 'Mantenimiento mensual de ' || tit, 'Nuevo', 'ARS', ab * 12, round(ab * 12 / tc, 2), tc,
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

  -- Mantenimiento compartido: el desarrollo que comparte se suma a lo que cubre el del otro
  i := 0;
  for v in select * from jsonb_array_elements(coalesce(d -> 'devs', '[]')) loop
    i := i + 1;
    continue when not coalesce((v -> 'mant' ->> 'on')::boolean, false) or coalesce(v -> 'mant' ->> 'comparte', '') = '';
    k := (v -> 'mant' ->> 'comparte')::int + 1;
    continue when k < 1 or k > coalesce(array_length(mids, 1), 0) or mids[k] = '';
    update crm_giwa.desarrollos set mant_de = array_append(array_remove(mant_de, ids[i]), ids[i]) where id = mids[k];
  end loop;

  return jsonb_build_object('ok', true, 'pid', pid, 'estado', est, 'devs', out);
end $$;

-- Crear: el borrador pasa a Prospecto y recién ahí escribe horas, costos y la tarea de integración
create or replace function crm_giwa.cot_crear(pid text) returns jsonb language plpgsql as $$
declare p crm_giwa.proyectos; x crm_giwa.desarrollos; m jsonb; s text; nt int := 0; nc int := 0;
begin
  select * into p from crm_giwa.proyectos where id = pid;
  if p.id is null then raise exception 'No existe %', pid; end if;
  if p.estado_id <> 'Borrador' then return jsonb_build_object('ok', true, 'pid', pid, 'estado', p.estado_id, 'msg', 'Ya estaba creado'); end if;
  perform pg_advisory_xact_lock(hashtext('crm_giwa.ids'));
  -- Sin fecha de propuesta: se sella al enviarla
  update crm_giwa.proyectos set estado_id = 'Prospecto', fecha_propuesta = null where id = pid;
  for x in select * from crm_giwa.desarrollos d where d.proyecto_id = pid and not crm_giwa._cot_es_mant(d) order by d.id loop
    m := crm_giwa._cot_j(x.minuta);
    perform crm_giwa.guardar_modulos_desarrollo(x.id, jsonb_build_object('tipo', x.tipo_id, 'sel', crm_giwa._cot_sel(m), 'cant', coalesce(m -> 'cant', '{}'),
                                                 'mejora', coalesce(m -> 'mejora', 'false'::jsonb)));
    nc := nc + crm_giwa._cot_costos(pid, x.id, crm_giwa._cot_ext(m));
    if exists (select 1 from jsonb_array_elements_text(crm_giwa._cot_reglas() -> 'integ') g where crm_giwa._cot_sel(m) ? g) then
      foreach s in array crm_giwa._cot_sistemas(concat_ws(E'\n', (select string_agg(value, ' ') from jsonb_each_text(coalesce(m -> 'notas', '{}'))),
                                                         crm_giwa._cot_j(p.minuta) ->> 'texto', p.resumen_ejecutivo)) loop
        perform crm_giwa._cot_tarea_integracion(pid, x.id, s, 'Desde el Cotizador · ' || coalesce(x.titulo, x.id)); nt := nt + 1;
      end loop;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'pid', pid, 'estado', 'Prospecto', 'costos', nc, 'tareas', nt);
end $$;

-- Borrar: todo lo del proyecto. Sólo si no se aprobó nada.
create or replace function crm_giwa.cot_borrar(pid text) returns jsonb language plpgsql as $$
declare p crm_giwa.proyectos; n int := 0; did text;
begin
  select * into p from crm_giwa.proyectos where id = pid;
  if p.id is null then raise exception 'No existe %', pid; end if;
  if not crm_giwa._cot_editable(p.estado_id) then raise exception 'Ya está aprobado: no se borra desde el Cotizador'; end if;
  if exists (select 1 from crm_giwa.desarrollos d where d.proyecto_id = pid and crm_giwa.estado_canonico(d.estado_id) <> 'nueva' and crm_giwa.estado_canonico(d.estado_id) <> 'rechazada') then
    raise exception 'Tiene desarrollos aprobados: no se borra';
  end if;
  if exists (select 1 from crm_giwa.cobros where proyecto_id = pid) then raise exception 'Tiene cobros cargados: no se borra'; end if;
  delete from crm_giwa.comentarios where tarea_id in (select id from crm_giwa.tareas where proyecto_id = pid and origen = 'Cotizador');
  delete from crm_giwa.tareas where proyecto_id = pid and origen = 'Cotizador';
  for did in select id from crm_giwa.desarrollos where proyecto_id = pid loop perform crm_giwa._cot_borrar_des(did); n := n + 1; end loop;
  delete from crm_giwa.proyectos where id = pid;   -- si quedan tareas o comentarios cargados a mano, la base no deja y lo dice
  return jsonb_build_object('ok', true, 'pid', pid, 'desarrollos', n);
end $$;

-- En la reunión, Desde un README y Reutilizar (_cotGuardar): sólo filas nuevas, nunca modifica una existente.
-- origen: 'reunion' | 'readme' → Borrador · 'reutilizar' → Prospecto (clonado de d.ref)
-- d = { empresa, nombre, moneda, resumen, minuta, ref, sistemas:[{nombre, comentario}],
--       devs:[{ tipo, titulo, modulos:[{id, etapa, nombre, horas, horas_cat}], mant_on, mant, wa_msj, wa_mkt }] }
create or replace function crm_giwa.cot_alta(d jsonb, origen text) returns jsonb language plpgsql as $$
declare
  emp text := nullif(btrim(d ->> 'empresa'), ''); est text := case when origen = 'reutilizar' then 'Prospecto' else 'Borrador' end;
  nota text := case origen when 'readme' then 'Generado por README' when 'reutilizar' then 'Clonado de ' || coalesce(d ->> 'ref', '') else 'Generado en reunión' end;
  tc numeric := crm_giwa._cot_tc(); usd boolean := upper(coalesce(d ->> 'moneda', 'ARS')) = 'USD'; yo text := crm_giwa.mi_mail();
  mult numeric; vh numeric; pid text; did text; mid text; v jsonb; m jsonb; hs numeric; precio numeric; ab numeric; aj numeric; nom numeric;
  ids text[]; out jsonb := '[]'; nc int := 0; nt int := 0; s jsonb; sis jsonb; vol numeric;
begin
  if emp is null then raise exception 'Elegí el cliente.'; end if;
  if not exists (select 1 from jsonb_array_elements(coalesce(d -> 'devs', '[]')) xv, jsonb_array_elements(coalesce(xv -> 'modulos', '[]')) xm
                  where crm_giwa.num_ar(xm ->> 'horas') > 0 or crm_giwa.num_ar(xm ->> 'horas_cat') > 0) then
    raise exception 'Tildá al menos un módulo.';
  end if;
  perform pg_advisory_xact_lock(hashtext('crm_giwa.ids'));
  select coalesce((select nullif(t.multiplicador, 0) from crm_giwa.tier t where crm_giwa.norm(t.id) = crm_giwa.norm(e.tier_id)), 1) into mult
    from crm_giwa.empresas e where e.id = emp;
  vh := crm_giwa.num_ar((select valor from crm_giwa.cot_config where clave = 'vh_giwa_ars')) * coalesce(mult, 1);
  pid := crm_giwa.proximo_id('P', 'proyectos', 4);
  insert into crm_giwa.proyectos (id, empresa_id, nombre, owner, tipo, estado_id, probabilidad, detenido, resumen_ejecutivo, minuta)
  values (pid, emp, coalesce(nullif(btrim(d ->> 'nombre'), ''), 'Proyecto'), yo, 'Cliente', est, 50, false, nullif(btrim(coalesce(d ->> 'resumen', '')), ''),
          jsonb_build_object('texto', coalesce(d ->> 'minuta', ''), 'origen', nota)::text);
  sis := case when jsonb_array_length(coalesce(d -> 'sistemas', '[]')) > 0 then d -> 'sistemas'
              else (select jsonb_agg(jsonb_build_object('nombre', xs, 'comentario', '')) from unnest(crm_giwa._cot_sistemas(concat_ws(E'\n', d ->> 'minuta', d ->> 'resumen'))) xs) end;

  for v in select * from jsonb_array_elements(coalesce(d -> 'devs', '[]')) loop
    continue when not exists (select 1 from jsonb_array_elements(coalesce(v -> 'modulos', '[]')) xm
                               where crm_giwa.num_ar(xm ->> 'horas') > 0 or crm_giwa.num_ar(xm ->> 'horas_cat') > 0);
    select round(coalesce(sum(crm_giwa.num_ar(xm ->> 'horas')), 0), 2), array_agg(xm ->> 'id') into hs, ids
      from jsonb_array_elements(v -> 'modulos') xm where crm_giwa.num_ar(xm ->> 'horas') > 0 or crm_giwa.num_ar(xm ->> 'horas_cat') > 0;
    precio := round(hs * vh);
    did := crm_giwa.proximo_id('D', 'desarrollos', 4);
    insert into crm_giwa.desarrollos (id, proyecto_id, tipo_id, titulo, descripcion, estado_id, moneda, total_ars, total_usd, tipo_cambio, q_cuotas,
                                      creador, duracion_horas, valor_hora, tier_id, mant_de, detenido, bonificado, minuta)
    values (did, pid, v ->> 'tipo', coalesce(nullif(btrim(v ->> 'titulo'), ''), v ->> 'tipo'), nota, 'Nuevo', case when usd then 'USD' else 'ARS' end,
            precio, round(precio / tc, 2), tc, 1, yo, hs, round(vh), (select tier_id from crm_giwa.empresas where id = emp), '{}', false, false,
            jsonb_build_object('r', (select coalesce(jsonb_object_agg(xi, 'Sí'), '{}') from unnest(ids) xi), 'origen', nota)::text);
    mid := null;
    if coalesce((v ->> 'mant_on')::boolean, false) and crm_giwa.num_ar(v ->> 'mant') > 0 then
      ab := round(case when usd then crm_giwa.num_ar(v ->> 'mant') * tc else crm_giwa.num_ar(v ->> 'mant') end);
      mid := crm_giwa.proximo_id('D', 'desarrollos', 4);
      insert into crm_giwa.desarrollos (id, proyecto_id, tipo_id, titulo, descripcion, estado_id, moneda, total_ars, total_usd, tipo_cambio,
                                        q_cuotas, cuota, valor_cuota_actual, mantenimiento_horas, ajuste, modelo_pago_id, creador, mant_de, detenido, bonificado)
      values (mid, pid, 'MM', 'Mantenimiento — ' || coalesce(nullif(btrim(v ->> 'titulo'), ''), v ->> 'tipo'), nota, 'Nuevo', 'ARS', ab * 12, round(ab * 12 / tc, 2), tc,
              12, ab, ab, crm_giwa._cot_mant_hs(ids), 'IPC trimestral', 'FP-03', yo, array[did], false, false);
    end if;
    -- Horas nominales del catálogo + una fila de ajuste si se editaron
    aj := 0;
    for m in select * from jsonb_array_elements(v -> 'modulos') loop
      continue when not (crm_giwa.num_ar(m ->> 'horas') > 0 or crm_giwa.num_ar(m ->> 'horas_cat') > 0);
      nom := case when m ? 'horas_cat' and m ->> 'horas_cat' is not null then crm_giwa.num_ar(m ->> 'horas_cat') else crm_giwa.num_ar(m ->> 'horas') end;
      aj := aj + crm_giwa.num_ar(m ->> 'horas') - nom;
      insert into crm_giwa.proyecto_horas (id, proyecto_id, desarrollo_id, modulo_id, etapa, modulo_nombre, horas_est, estado, origen, nota)
      values (crm_giwa.proximo_id('PH', 'proyecto_horas', 4), pid, did, nullif(m ->> 'id', ''), m ->> 'etapa', m ->> 'nombre', nom, 'Nueva', 'Estimado', nota);
    end loop;
    if abs(aj) >= 0.01 then
      insert into crm_giwa.proyecto_horas (id, proyecto_id, desarrollo_id, etapa, modulo_nombre, horas_est, estado, origen, nota)
      values (crm_giwa.proximo_id('PH', 'proyecto_horas', 4), pid, did, 'Configuración', 'Ajuste manual por complejidad técnica', round(aj, 2), 'Nueva', 'Estimado',
              nota || ' · diferencia contra el catálogo');
    end if;
    -- WhatsApp → costo de Meta (utilidad y, si hay, marketing)
    if exists (select 1 from jsonb_array_elements_text(crm_giwa._cot_reglas() -> 'wa') xw where xw = any(ids)) then
      vol := coalesce(nullif(crm_giwa.num_ar(v ->> 'wa_msj'), 0), nullif(crm_giwa.num_ar((select valor from crm_giwa.cot_config where clave = 'meta_msj_mes_default')), 0), 500);
      nc := nc + crm_giwa._cot_costos(pid, did, jsonb_build_array(jsonb_build_object('cid', 'CONT-030', 'cantidad', vol, 'paga', 'Cliente'))
                    || case when crm_giwa.num_ar(v ->> 'wa_mkt') > 0 then jsonb_build_array(jsonb_build_object('cid', 'CONT-029', 'cantidad', crm_giwa.num_ar(v ->> 'wa_mkt'), 'paga', 'Cliente')) else '[]' end);
    end if;
    -- Integración con un sistema externo → tarea
    if exists (select 1 from jsonb_array_elements_text(crm_giwa._cot_reglas() -> 'integ') xg where xg = any(ids)) then
      for s in select * from jsonb_array_elements(coalesce(sis, '[]')) loop
        perform crm_giwa._cot_tarea_integracion(pid, did, s ->> 'nombre', s ->> 'comentario'); nt := nt + 1;
      end loop;
    end if;
    out := out || jsonb_build_array(jsonb_build_object('id', did, 'mant_id', mid, 'horas', hs, 'precio', precio));
  end loop;
  return jsonb_build_object('ok', true, 'pid', pid, 'estado', est, 'devs', out, 'costos', nc, 'tareas', nt);
end $$;

-- Reutilizar: un proyecto con sus módulos, precios con el Tier de la empresa nueva (getProyectoClonable)
create or replace function crm_giwa.cot_clonable(pid text, empresa text, moneda text default 'ARS') returns jsonb language plpgsql stable as $$
declare mult numeric; tid text; vh numeric; sop numeric := crm_giwa._cot_vh_soporte(); tc numeric := crm_giwa._cot_tc();
  usd boolean := upper(coalesce(moneda, 'ARS')) = 'USD'; devs jsonb;
begin
  select e.tier_id, coalesce((select nullif(t.multiplicador, 0) from crm_giwa.tier t where crm_giwa.norm(t.id) = crm_giwa.norm(e.tier_id)), 1)
    into tid, mult from crm_giwa.empresas e where e.id = empresa;
  vh := crm_giwa.num_ar((select valor from crm_giwa.cot_config where clave = 'vh_giwa_ars')) * coalesce(mult, 1);
  select coalesce(jsonb_agg(jsonb_build_object('origen', d.id, 'tipo', d.tipo_id, 'titulo', d.titulo, 'modulos', f.mods, 'horas', f.hs,
           'precio', case when usd then round(f.hs * vh / tc, 2) else round(f.hs * vh) end, 'mant_on', true, 'mant_hs', crm_giwa._cot_mant_hs(f.ids),
           'mant', case when usd then round(crm_giwa._cot_mant_hs(f.ids) * sop / tc, 2) else round(crm_giwa._cot_mant_hs(f.ids) * sop) end,
           'wa_msj', case when exists (select 1 from jsonb_array_elements_text(crm_giwa._cot_reglas() -> 'wa') w where w = any(f.ids))
                          then coalesce(nullif(crm_giwa.num_ar((select valor from crm_giwa.cot_config where clave = 'meta_msj_mes_default')), 0), 500) else 0 end)
         order by d.id), '[]') into devs
    from crm_giwa.desarrollos d,
         lateral (select coalesce(jsonb_agg(jsonb_build_object('id', h.modulo_id, 'etapa', h.etapa, 'nombre', h.modulo_nombre, 'horas', h.horas_est, 'horas_cat', h.horas_est,
                         'mant', case when h.modulo_id = any(array(select jsonb_array_elements_text(crm_giwa._cot_reglas() -> 'wa') union all select jsonb_array_elements_text(crm_giwa._cot_reglas() -> 'ig')))
                                      then 0.5 when h.modulo_id = any(array(select jsonb_array_elements_text(crm_giwa._cot_reglas() -> 'rw'))) then 1 else 0 end) order by h.id), '[]') mods,
                         round(coalesce(sum(h.horas_est), 0), 2) hs, coalesce(array_agg(h.modulo_id) filter (where h.modulo_id is not null), '{}') ids
                    from crm_giwa.proyecto_horas h where h.desarrollo_id = d.id and coalesce(h.horas_est, 0) > 0) f
   where d.proyecto_id = pid and not crm_giwa._cot_es_mant(d);
  return jsonb_build_object('ok', true, 'pid', pid, 'tier', coalesce(tid, 'sin Tier'), 'mult', coalesce(mult, 1), 'moneda', case when usd then 'USD' else 'ARS' end,
    'vh', case when usd then round(vh / tc, 2) else round(vh) end, 'vh_soporte', case when usd then round(sop / tc, 2) else sop end, 'devs', devs);
end $$;

grant execute on function crm_giwa.cot_listar(), crm_giwa.cot_inicio(), crm_giwa.cot_leer(text), crm_giwa.cot_base(text), crm_giwa.cot_minutas(text),
  crm_giwa.cot_herramientas(jsonb), crm_giwa.cot_guardar(jsonb), crm_giwa.cot_crear(text), crm_giwa.cot_borrar(text),
  crm_giwa.cot_alta(jsonb, text), crm_giwa.cot_clonable(text, text, text), crm_giwa.mercado_param(text) to authenticated;

-- ── 3 · Aprobar: congela lo aprobado (mismo flujo de siempre) ──
create or replace function crm_giwa.aprobar_proyecto(pid text, decisiones jsonb, montos jsonb default '{}'::jsonb, inicios jsonb default '{}'::jsonb)
returns jsonb language plpgsql as $function$
declare
  p crm_giwa.proyectos := crm_giwa._proyecto(pid);
  e int := 0; r int := 0; w int := 0; a int := 0; k text; m numeric; f date;
begin
  for k in select jsonb_object_keys(coalesce(montos, '{}'::jsonb)) loop
    if decisiones ->> k = 'entro' then
      m := nullif(montos ->> k, '')::numeric;
      if m is null or m <= 0 then raise exception 'El monto aprobado de % tiene que ser mayor a 0.', k; end if;
      update crm_giwa.desarrollos d set total_ars = m,
             total_usd = case when coalesce(d.tipo_cambio, 0) > 0 then round(m / d.tipo_cambio, 2) else d.total_usd end
       where d.id = k and d.proyecto_id = p.id;
    end if;
  end loop;
  update crm_giwa.desarrollos d set estado_id = crm_giwa.estado_des('aprobada'), fecha_aprobado = crm_giwa.hoy(), detenido = false
  where d.proyecto_id = p.id and decisiones ->> d.id = 'entro';
  get diagnostics e = row_count;
  if e = 0 then raise exception 'No marcaste ningún desarrollo como aprobado. Si no entró nada, usá No aceptar.'; end if;
  update crm_giwa.desarrollos d set estado_id = crm_giwa.estado_des('rechazada'), detenido = false
  where d.proyecto_id = p.id and decisiones ->> d.id = 'rechazado';
  get diagnostics r = row_count;
  update crm_giwa.desarrollos d set detenido = true
  where d.proyecto_id = p.id and decisiones ->> d.id = 'espera';
  get diagnostics w = row_count;
  update crm_giwa.proyectos set estado_id = 'Aprobado', probabilidad = 100, fecha_aprobacion = crm_giwa.hoy(),
         minuta = (crm_giwa._cot_j(minuta) || jsonb_build_object('aprobada', crm_giwa.hoy()))::text where id = p.id;
  -- Lo aprobado queda congelado en la minuta del desarrollo (como aprobarCotizacionCot): un cambio después es una mejora
  update crm_giwa.desarrollos d set minuta = (crm_giwa._cot_j(d.minuta) || jsonb_build_object('aprobado', jsonb_build_object(
           'fecha', crm_giwa.hoy(), 'precio', d.total_ars, 'horas', d.duracion_horas, 'tier', d.tier_id, 'valor_hora', d.valor_hora)))::text
   where d.proyecto_id = p.id and decisiones ->> d.id = 'entro' and not crm_giwa._cot_es_mant(d);
  -- ¿Inicia ya? Fecha de inicio y arrancar, con las mismas funciones que «Arrancar»
  for k in select jsonb_object_keys(coalesce(inicios, '{}'::jsonb)) loop
    f := nullif(inicios ->> k, '')::date;
    if f is null or decisiones ->> k is distinct from 'entro' then continue; end if;
    if not exists (select 1 from crm_giwa.desarrollos where id = k and proyecto_id = p.id) then
      raise exception 'El desarrollo % no es de este proyecto.', k;
    end if;
    perform crm_giwa.fecha_desarrollo(k, 'fecha_ini', f);
    perform crm_giwa.accion_desarrollo(k, 'arrancar');
    a := a + 1;
  end loop;
  return jsonb_build_object('ok', true, 'estado', 'Aprobado', 'entraron', e, 'rechazados', r, 'esperan', w, 'arrancaron', a,
    'msg', e || ' aprobado(s)' || case when a > 0 then ' · ' || a || ' arrancado(s)' else '' end
                                || case when r > 0 then ', ' || r || ' no aceptado(s)' else '' end
                                || case when w > 0 then ', ' || w || ' en espera' else '' end);
end $function$;
grant execute on function crm_giwa.aprobar_proyecto(text, jsonb, jsonb, jsonb) to authenticated, service_role;

reset role;
