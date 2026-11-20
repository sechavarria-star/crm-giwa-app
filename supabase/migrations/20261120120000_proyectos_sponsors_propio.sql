-- Proyectos · los sponsors tienen su propio campo (opción A, Vicky 20/11/2026)
-- «contactos» queda para Contactos del cliente (la ★ de la ficha, contactos_proyecto): son los que se van a vincular
-- a los accesos de Soporte y a los mails de Facturación. Hasta hoy el Cotizador guardaba ahí la lista de sponsors.
--   · proyectos.sponsors: la lista de sponsors (sponsor_id sigue siendo el primero)
--   · cot_guardar, alta_proyecto_rapido y editar_proyecto guardan los sponsors en «sponsors» y dejan de pisar «contactos»
--   · editar_proyecto recibe además 'contactos_cliente' (lista) → «contactos»
--   · cot_leer devuelve 'sponsors' (si está vacío, el sponsor_id)
--   · datos: los proyectos cuyo «contactos» tiene al sponsor (cargados desde el Cotizador) copian esa lista a «sponsors»;
--     «contactos» no se toca. Con auditoría.
set role crm_giwa_dev;

alter table crm_giwa.proyectos add column if not exists sponsors text;
comment on column crm_giwa.proyectos.sponsors is 'Sponsors del proyecto, ids de contactos separados por coma; sponsor_id = el primero (20/11/2026)';
comment on column crm_giwa.proyectos.contactos is 'Contactos del cliente para este proyecto (la ★ de la ficha): Soporte y mails de Facturación (20/11/2026)';

do $$
declare f record; def text;
begin
  for f in select * from (values
      ('crm_giwa.cot_guardar(jsonb)', $a$sponsor_id = sps[1], contactos = array_to_string(sps, ',')$a$, $b$sponsor_id = sps[1], sponsors = array_to_string(sps, ',')$b$),
      ('crm_giwa.cot_guardar(jsonb)', $a$insert into crm_giwa.proyectos (id, empresa_id, nombre, sponsor_id, contactos,$a$, $b$insert into crm_giwa.proyectos (id, empresa_id, nombre, sponsor_id, sponsors,$b$),
      ('crm_giwa.alta_proyecto_rapido(jsonb)', $a$insert into crm_giwa.proyectos (id, empresa_id, nombre, sponsor_id, contactos,$a$, $b$insert into crm_giwa.proyectos (id, empresa_id, nombre, sponsor_id, sponsors,$b$),
      ('crm_giwa.cot_leer(text)', $a$'contactos', p.contactos,$a$, $b$'contactos', p.contactos, 'sponsors', coalesce(nullif(p.sponsors, ''), p.sponsor_id),$b$),
      ('crm_giwa.editar_proyecto(jsonb)', $a$contactos         = case when sps is not null then array_to_string(sps, ',') else contactos end,$a$,
       $b$sponsors          = case when sps is not null then array_to_string(sps, ',') else sponsors end,
    contactos         = case when jsonb_typeof(p -> 'contactos_cliente') = 'array'
                             then nullif(array_to_string(array(select btrim(s) from jsonb_array_elements_text(p -> 'contactos_cliente') s where btrim(s) <> ''), ','), '')
                             else contactos end,$b$)
    ) as t(fn, viejo, nue)
  loop
    def := pg_get_functiondef(f.fn::regprocedure);
    if position(f.viejo in def) = 0 then raise exception 'No encontré el texto a cambiar en %: %', f.fn, f.viejo; end if;
    execute replace(def, f.viejo, f.nue);
  end loop;
end $$;

with cambio as (
  select id, contactos from crm_giwa.proyectos
  where coalesce(sponsors, '') = '' and sponsor_id is not null and sponsor_id = any(string_to_array(replace(coalesce(contactos, ''), ' ', ''), ','))),
aud as (
  insert into crm_giwa.admin_auditoria (quien, tabla, registro, accion, antes, despues, motivo)
  select 'v.gagey@giwa-ia.com', 'proyectos', id, 'editar', jsonb_build_object('sponsors', null), jsonb_build_object('sponsors', contactos),
         'Sponsors a su propio campo: venían en contactos desde el Cotizador (opción A, Vicky 20/11/2026)' from cambio returning registro)
update crm_giwa.proyectos p set sponsors = c.contactos from cambio c where p.id = c.id;

reset role;
