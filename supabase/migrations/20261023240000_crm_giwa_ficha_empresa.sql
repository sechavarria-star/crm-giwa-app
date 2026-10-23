-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · la ficha de empresa en UN viaje · 23/10/2026
-- ──────────────────────────────────────────────────────────────────────
-- guardar_ficha_empresa(p) = guardarFichaEmpresa del Apps Script (CRM.gs:
-- altaEmpresa / updateEmpresa / saveRazonSocial / deleteRazonSocial /
-- altaContacto / updateContacto), con las mismas reglas y una mejora:
-- es TODO O NADA. En el Apps Script, si fallaba un contacto, la empresa y
-- las razones quedaban guardadas y el error salía en un mensaje.
--
--   p = { empresa:{ id?, razon, alias, tier, rubro, localidad, provincia,
--                   web, logo, drive_int, drive_ext, direccion },
--         razones:[{ id?, razon, cuit, condicion, direccion, mail_fact, defecto, nota }],
--         borrarRazones:[id…],
--         contactos:[{ id?, nombre, apellido, email, telefono, area, puesto }] }
--   → { ok:true, id:'EMP-027' }   ·   error con el motivo, sin guardar nada
--
-- Reglas (las del Apps Script):
--   · empresa: nombre obligatorio y único (sin mayúsculas); ID nuevo =
--     el mayor EMP-### + 1, con 3 dígitos; al editar, sólo cambia lo que
--     viene; país Argentina y tipo Cliente por defecto.
--   · razón social: sin nombre se ignora; marcar «por defecto» le saca la
--     marca a las otras de la empresa; ID nuevo RZ-###.
--   · contacto: sin nombre se ignora; ID nuevo CONT-###; queda en la empresa.
-- Los IDs se generan con un candado de la base: ni la app nueva ni el Apps
-- Script pueden dar el mismo número a la vez.
--
-- SECURITY INVOKER: corre con los permisos de quien llama; RLS manda.
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

create or replace function crm_giwa.proximo_id(prefijo text, tabla text, ancho int) returns text
language plpgsql volatile as $$
declare n int;
begin
  execute format('select coalesce(max(substring(id from %L)::int), 0) + 1 from crm_giwa.%I',
                 '^' || prefijo || '-(\d+)$', tabla) into n;
  return prefijo || '-' || lpad(n::text, greatest(ancho, length(n::text)), '0');
end $$;

create or replace function crm_giwa.guardar_ficha_empresa(p jsonb) returns jsonb
language plpgsql volatile as $$
declare
  e   jsonb := coalesce(p -> 'empresa', '{}'::jsonb);
  eid text  := nullif(trim(e ->> 'id'), '');
  nom text  := nullif(trim(e ->> 'razon'), '');
  x   jsonb;
  xid text;
  def boolean;
  v   text;                                            -- e ->> k, '' → null
begin
  perform pg_advisory_xact_lock(hashtext('crm_giwa.ids'));

  -- ── la empresa ──
  if eid is null then
    if nom is null then raise exception 'Razón social obligatoria'; end if;
    if exists (select 1 from crm_giwa.empresas where lower(trim(nombre)) = lower(nom)) then
      raise exception 'Ya existe esa empresa';
    end if;
    eid := crm_giwa.proximo_id('EMP', 'empresas', 3);
    insert into crm_giwa.empresas (id, nombre, alias, tier_id, logo, web, rubro, direccion_fiscal,
                                   localidad, provincia, pais, tipo, drive_interno, drive_externo)
    values (eid, nom, nullif(trim(e ->> 'alias'), ''), nullif(e ->> 'tier', ''), nullif(trim(e ->> 'logo'), ''),
            nullif(trim(e ->> 'web'), ''), nullif(e ->> 'rubro', ''), nullif(trim(e ->> 'direccion'), ''),
            nullif(e ->> 'localidad', ''), nullif(e ->> 'provincia', ''),
            coalesce(nullif(e ->> 'pais', ''), 'Argentina'), coalesce(nullif(e ->> 'tipo', ''), 'Cliente'),
            nullif(trim(e ->> 'drive_int'), ''), nullif(trim(e ->> 'drive_ext'), ''));
  else
    if not exists (select 1 from crm_giwa.empresas where id = eid) then
      raise exception 'No encontré la empresa %', eid;
    end if;
    if nom is not null and exists (select 1 from crm_giwa.empresas
                                    where id <> eid and lower(trim(nombre)) = lower(nom)) then
      raise exception 'Ya existe otra empresa con la razón social "%".', nom;
    end if;
    update crm_giwa.empresas set
      nombre           = coalesce(nom, nombre),
      alias            = case when e ? 'alias'     then nullif(trim(e ->> 'alias'), '')     else alias end,
      tier_id          = case when e ? 'tier'      then nullif(e ->> 'tier', '')            else tier_id end,
      logo             = case when e ? 'logo'      then nullif(trim(e ->> 'logo'), '')      else logo end,
      web              = case when e ? 'web'       then nullif(trim(e ->> 'web'), '')       else web end,
      rubro            = case when e ? 'rubro'     then nullif(e ->> 'rubro', '')           else rubro end,
      direccion_fiscal = case when e ? 'direccion' then nullif(trim(e ->> 'direccion'), '') else direccion_fiscal end,
      localidad        = case when e ? 'localidad' then nullif(e ->> 'localidad', '')       else localidad end,
      provincia        = case when e ? 'provincia' then nullif(e ->> 'provincia', '')       else provincia end,
      drive_interno    = case when e ? 'drive_int' then nullif(trim(e ->> 'drive_int'), '') else drive_interno end,
      drive_externo    = case when e ? 'drive_ext' then nullif(trim(e ->> 'drive_ext'), '') else drive_externo end
    where id = eid;
  end if;

  -- ── razones sociales que se quitaron ──
  delete from crm_giwa.razones_sociales
  where empresa_id = eid
    and id in (select jsonb_array_elements_text(coalesce(p -> 'borrarRazones', '[]'::jsonb)));

  -- ── razones sociales ──
  for x in select * from jsonb_array_elements(coalesce(p -> 'razones', '[]'::jsonb)) loop
    if nullif(trim(x ->> 'razon'), '') is null then continue; end if;
    xid := nullif(trim(x ->> 'id'), '');
    def := coalesce((x ->> 'defecto')::boolean, false);
    if def then
      update crm_giwa.razones_sociales set por_defecto = false
      where empresa_id = eid and por_defecto and id is distinct from xid;
    end if;
    if xid is null then xid := crm_giwa.proximo_id('RZ', 'razones_sociales', 3); end if;
    insert into crm_giwa.razones_sociales (id, empresa_id, nombre, cuit, condicion_fiscal, direccion,
                                           mail_facturacion, por_defecto, nota)
    values (xid, eid, trim(x ->> 'razon'), nullif(trim(x ->> 'cuit'), ''), nullif(x ->> 'condicion', ''),
            nullif(trim(x ->> 'direccion'), ''), nullif(trim(x ->> 'mail_fact'), ''), def,
            nullif(trim(x ->> 'nota'), ''))
    on conflict (id) do update set
      empresa_id = excluded.empresa_id, nombre = excluded.nombre, cuit = excluded.cuit,
      condicion_fiscal = excluded.condicion_fiscal, direccion = excluded.direccion,
      mail_facturacion = excluded.mail_facturacion, por_defecto = excluded.por_defecto, nota = excluded.nota;
  end loop;

  -- ── contactos ──
  for x in select * from jsonb_array_elements(coalesce(p -> 'contactos', '[]'::jsonb)) loop
    if nullif(trim(x ->> 'nombre'), '') is null then continue; end if;
    xid := nullif(trim(x ->> 'id'), '');
    if xid is null then
      insert into crm_giwa.contactos (id, nombre, apellido, empresa_id, email, telefono, area_trabajo, puesto)
      values (crm_giwa.proximo_id('CONT', 'contactos', 3), trim(x ->> 'nombre'), nullif(trim(x ->> 'apellido'), ''),
              eid, nullif(trim(x ->> 'email'), ''), nullif(trim(x ->> 'telefono'), ''),
              nullif(x ->> 'area', ''), nullif(x ->> 'puesto', ''));
    else
      update crm_giwa.contactos set
        nombre = trim(x ->> 'nombre'), apellido = nullif(trim(x ->> 'apellido'), ''), empresa_id = eid,
        email = nullif(trim(x ->> 'email'), ''), telefono = nullif(trim(x ->> 'telefono'), ''),
        area_trabajo = nullif(x ->> 'area', ''), puesto = nullif(x ->> 'puesto', '')
      where id = xid;
      if not found then raise exception 'No encontré el contacto %', xid; end if;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'id', eid);
end $$;

reset role;
