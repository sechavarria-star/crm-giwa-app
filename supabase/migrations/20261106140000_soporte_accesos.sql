-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · Soporte, etapa 3d: empresas en el portal y accesos · 06/11/2026
-- ──────────────────────────────────────────────────────────────────────
--   soporte_guardar_empresa(p)  habilita (o pausa) una empresa en el portal: activa, si ve horas
--                               y consumo del mantenimiento, y a quién más avisar (_guardarEmpresaPortal_)
--   soporte_acceso(p)           habilita o deshabilita un mail para entrar al portal. Entra sólo quien
--                               se habilita a mano (06/11/2026). Un mail es de una sola empresa.
-- El usuario de Auth y la invitación son la etapa 5.
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

create or replace function crm_giwa.soporte_guardar_empresa(p jsonb) returns jsonb
language plpgsql volatile as $$
declare emp text := p ->> 'empresa_id';
begin
  perform crm_giwa._soporte_equipo();
  if emp is null or not exists (select 1 from crm_giwa.empresas where id = emp) then raise exception 'Elegí la empresa.'; end if;
  insert into crm_giwa.soporte_empresas (empresa_id, activo, mostrar_horas, avisar_a)
  values (emp, coalesce((p ->> 'activo')::boolean, true), coalesce((p ->> 'mostrar_horas')::boolean, false), nullif(crm_giwa.norm_mails(p ->> 'avisar_a'), ''))
  on conflict (empresa_id) do update set
    activo = coalesce((p ->> 'activo')::boolean, soporte_empresas.activo),
    mostrar_horas = coalesce((p ->> 'mostrar_horas')::boolean, soporte_empresas.mostrar_horas),
    avisar_a = case when p ? 'avisar_a' then nullif(crm_giwa.norm_mails(p ->> 'avisar_a'), '') else soporte_empresas.avisar_a end;
  return jsonb_build_object('ok', true);
end $$;

create or replace function crm_giwa.soporte_acceso(p jsonb) returns jsonb
language plpgsql volatile as $$
declare m text := crm_giwa.norm_mail(p ->> 'mail'); emp text := p ->> 'empresa_id'; ya crm_giwa.soporte_accesos; cid text;
begin
  perform crm_giwa._soporte_equipo();
  if m is null or m !~ '^[^\s@]+@[^\s@]+\.[a-z]{2,}$' then raise exception 'Ese mail no es válido.'; end if;
  if not exists (select 1 from crm_giwa.soporte_empresas where empresa_id = emp) then raise exception 'Primero habilitá la empresa en el portal.'; end if;
  if exists (select 1 from crm_giwa.usuarios where es_giwa and crm_giwa.norm_mail(mail) = m) then raise exception 'Ese mail es del equipo de GIWA: no entra como cliente.'; end if;
  select * into ya from crm_giwa.soporte_accesos where mail = m;
  if ya.id is not null and ya.empresa_id <> emp then
    raise exception 'Ese mail ya tiene acceso como %.', coalesce((select nombre from crm_giwa.empresas where id = ya.empresa_id), ya.empresa_id);
  end if;
  select id into cid from crm_giwa.contactos where crm_giwa.norm_mail(email) = m and empresa_id = emp limit 1;
  insert into crm_giwa.soporte_accesos (mail, contacto_id, empresa_id, habilitado, creador)
  values (m, cid, emp, coalesce((p ->> 'habilitado')::boolean, true), crm_giwa.mi_mail())
  on conflict (mail) do update set habilitado = coalesce((p ->> 'habilitado')::boolean, true), contacto_id = coalesce(excluded.contacto_id, soporte_accesos.contacto_id);
  return jsonb_build_object('ok', true);
end $$;

grant execute on function crm_giwa.soporte_guardar_empresa(jsonb), crm_giwa.soporte_acceso(jsonb) to authenticated, service_role;

reset role;
