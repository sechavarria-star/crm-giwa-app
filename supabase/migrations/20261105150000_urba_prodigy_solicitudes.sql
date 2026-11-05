-- 05/11/2026: URBA vuelve a Negociación, saldo de Prodigy dado por perdido, clave de Gemini fuera del alcance del navegador,
-- solicitudes de mejoras al CRM y Deshacer también para proyectos (aprobar).
set role crm_giwa_dev;
select set_config('request.jwt.claims', '{"email":"v.gagey@giwa-ia.com"}', true);
update crm_giwa.desarrollos set estado_id = 'Nuevo', fecha_aprobado = null, total_ars = 17880000 where id = 'D-0032' and estado_id = 'Aprobado';
update crm_giwa.desarrollos set estado_id = 'Nuevo', fecha_aprobado = null, minuta = (crm_giwa._cot_j(minuta) - 'aprobado')::text where id = 'D-0033' and estado_id = 'Aprobado';
update crm_giwa.proyectos set estado_id = 'Negociación', probabilidad = 50, fecha_aprobacion = null, minuta = (crm_giwa._cot_j(minuta) - 'aprobada')::text where id = 'P-0012' and estado_id = 'Aprobado';
update crm_giwa.desarrollos set bonificado = true where id = 'D-0006';
drop policy if exists equipo on crm_giwa.cot_config;
create policy equipo on crm_giwa.cot_config for all to authenticated using ((select crm_giwa.es_equipo()) and clave <> 'gemini_api_key') with check ((select crm_giwa.es_equipo()) and clave <> 'gemini_api_key');
create table if not exists crm_giwa.solicitudes_crm (
  id bigint generated always as identity primary key, quien text not null, creado timestamptz not null default now(),
  texto text not null, estado text not null default 'Nueva');
alter table crm_giwa.solicitudes_crm enable row level security;
drop policy if exists equipo on crm_giwa.solicitudes_crm;
create policy equipo on crm_giwa.solicitudes_crm for all to authenticated using ((select crm_giwa.es_equipo())) with check ((select crm_giwa.es_equipo()));
grant select, update on crm_giwa.solicitudes_crm to authenticated;
create or replace function crm_giwa.enviar_solicitud(txt text) returns jsonb
language plpgsql volatile security definer set search_path = crm_giwa, public as $$
declare t text := trim(coalesce(txt, ''));
begin
  if not crm_giwa.es_equipo() then raise exception 'Sin permiso'; end if;
  if t = '' then raise exception 'Escribí el pedido.'; end if;
  insert into crm_giwa.solicitudes_crm(quien, texto) values (crm_giwa.mi_mail(), t);
  perform crm_giwa._tg_avisar(array[crm_giwa.mail_admin()], '<b>Nueva solicitud al CRM</b>' || E'\n' || crm_giwa._tg_esc(crm_giwa.nombre_usuario(crm_giwa.mi_mail())) || ': ' || crm_giwa._tg_esc(left(t, 300)), 'solicitud');
  return jsonb_build_object('ok', true);
end $$;
grant execute on function crm_giwa.enviar_solicitud(text) to authenticated;
do $$
declare o text;
begin
  select pg_get_functiondef(p.oid) into o from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'crm_giwa' and p.proname = 'deshacer_foto';
  execute replace(o, '''cobros'', ''desarrollos'')', '''cobros'', ''desarrollos'', ''proyectos'')');
end $$;
reset role;
