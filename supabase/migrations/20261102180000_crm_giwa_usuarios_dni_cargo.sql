-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · DNI y cargo de cada socio · 02/11/2026
-- ──────────────────────────────────────────────────────────────────────
-- Los usa Herramientas › NDA para completar los datos del Proveedor.
-- Se cargan una vez en Configuración › Usuarios (sólo Administración).
-- El repo es público: los valores NO van acá.
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;
set search_path = crm_giwa, public;

alter table crm_giwa.usuarios add column if not exists dni text;
alter table crm_giwa.usuarios add column if not exists cargo text;

create or replace function crm_giwa.guardar_usuario(p jsonb) returns jsonb
language plpgsql security definer set search_path = crm_giwa, public as $$
declare v_mail text := crm_giwa.norm_mail(p ->> 'mail'); uid text := nullif(trim(coalesce(p ->> 'id', '')), '');
begin
  if not crm_giwa.es_admin() then raise exception 'Sólo Administración puede cambiar usuarios.'; end if;
  if coalesce(trim(p ->> 'nombre'), '') = '' then raise exception 'Falta el nombre'; end if;
  if coalesce(v_mail, '') !~ '@' then raise exception 'Falta un mail válido'; end if;
  if exists (select 1 from crm_giwa.usuarios u where crm_giwa.norm_mail(u.mail) = v_mail and u.id is distinct from uid) then
    raise exception 'Ya hay un usuario con ese mail'; end if;
  if uid is null then
    -- mismo formato que los que ya están (D1, S2, V3): inicial + número
    uid := upper(left(trim(p ->> 'nombre'), 1)) || ((select count(*) from crm_giwa.usuarios) + 1);
    while exists (select 1 from crm_giwa.usuarios u where u.id = uid) loop uid := uid || 'b'; end loop;
    insert into crm_giwa.usuarios (id, nombre, mail, es_giwa, activo, orden) values (uid, trim(p ->> 'nombre'), v_mail, true, true,
      coalesce((select max(u.orden) from crm_giwa.usuarios u), 0) + 1);
  end if;
  update crm_giwa.usuarios u set
    nombre     = trim(p ->> 'nombre'),
    mail       = v_mail,
    rol        = coalesce(p ->> 'rol', u.rol),
    es_giwa    = coalesce((p ->> 'es_giwa')::boolean, u.es_giwa),
    factura    = coalesce((p ->> 'factura')::boolean, u.factura),
    telegram   = coalesce(trim(p ->> 'telegram'), u.telegram),
    calendario = coalesce(trim(p ->> 'calendario'), u.calendario),
    dni        = coalesce(trim(p ->> 'dni'), u.dni),
    cargo      = coalesce(trim(p ->> 'cargo'), u.cargo),
    activo     = coalesce((p ->> 'activo')::boolean, u.activo)
  where u.id = uid;
  return jsonb_build_object('ok', true, 'id', uid);
end $$;

grant execute on function crm_giwa.guardar_usuario(jsonb) to authenticated;
