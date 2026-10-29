-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · Normalizar mayúsculas de nombres, apellidos y empresas · 29/10/2026
-- ──────────────────────────────────────────────────────────────────────
-- mayus(t, empresa): sólo cambia mayúsculas; no toca ortografía, acentos ni abreviaturas.
--   · Cada palabra: primera en mayúscula y el resto en minúscula («AGente» → «Agente»).
--   · Conectores en minúscula (de, del, la, las, los, el, y, e), salvo al principio.
--   · Siglas y formas societarias en mayúscula: S.R.L., S.A., S.A.S., SAS, SRL, SA, SH, IA.
--   · Empresas: una palabra de hasta 3 letras toda en mayúscula se respeta (YPF, KO, MDR);
--     un nombre de una sola palabra todo en mayúscula también (FAREWELL, marca).
--   · Palabras con números, sin tocar.
-- guardar_ficha_empresa normaliza al guardar (empresa y contactos).
-- v_mayus_simulacion: lo ya cargado, antes → después. aplicar_mayus(): sólo con el OK.
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;
set search_path = crm_giwa, public;

create or replace function crm_giwa.mayus(t text, empresa boolean default false) returns text
language plpgsql immutable as $$
declare
  w text[]; r text[] := '{}'; x text; l text; i int := 0; partes text[]; pp text[]; y text;
  una_mayus boolean;
  siglas text[] := array['s.r.l.','s.a.','s.a.s.','sas','srl','sa','sh','s.h.','ia','s.a.u.','sau','sgr','s.c.'];
  conect text[] := array['de','del','la','las','los','el','y','e'];
begin
  if t is null or trim(t) = '' then return t; end if;
  w := regexp_split_to_array(trim(regexp_replace(t, '\s+', ' ', 'g')), ' ');
  una_mayus := empresa and array_length(w, 1) = 1 and w[1] = upper(w[1]) and w[1] ~ '[A-ZÁÉÍÓÚÑ]';
  foreach x in array w loop
    i := i + 1;
    -- cada parte de una palabra compuesta («Giwa-IA») se trata sola
    partes := regexp_split_to_array(x, '-'); pp := '{}';
    foreach y in array partes loop
      l := lower(y);
      if y = '' or y ~ '[0-9]' or una_mayus then pp := pp || y;
      elsif l = any (siglas) then pp := pp || upper(y);
      elsif i > 1 and array_length(partes, 1) = 1 and l = any (conect) then pp := pp || l;
      elsif empresa and length(regexp_replace(y, '[^[:alpha:]]', '', 'g')) <= 3 and y = upper(y) and y ~ '[A-ZÁÉÍÓÚÑ]' then pp := pp || y;
      else pp := pp || (upper(left(y, 1)) || lower(substr(y, 2)));
      end if;
    end loop;
    r := r || array_to_string(pp, '-');
  end loop;
  return array_to_string(r, ' ');
end $$;

create or replace view crm_giwa.v_mayus_simulacion with (security_invoker = true) as
select * from (
  select 'Empresa' as que, e.id, 'nombre' as campo, e.nombre as antes, crm_giwa.mayus(e.nombre, true) as despues from crm_giwa.empresas e
  union all
  select 'Contacto', c.id, 'nombre', c.nombre, crm_giwa.mayus(c.nombre) from crm_giwa.contactos c
  union all
  select 'Contacto', c.id, 'apellido', c.apellido, crm_giwa.mayus(c.apellido) from crm_giwa.contactos c
) s where antes is distinct from despues;

create or replace function crm_giwa.aplicar_mayus() returns jsonb
language plpgsql as $$
declare n int := 0; k int;
begin
  if not crm_giwa.es_admin() then raise exception 'Sólo Administración.'; end if;
  update crm_giwa.empresas set nombre = crm_giwa.mayus(nombre, true) where nombre is distinct from crm_giwa.mayus(nombre, true);
  get diagnostics k = row_count; n := n + k;
  update crm_giwa.contactos set nombre = crm_giwa.mayus(nombre), apellido = crm_giwa.mayus(apellido)
   where nombre is distinct from crm_giwa.mayus(nombre) or apellido is distinct from crm_giwa.mayus(apellido);
  get diagnostics k = row_count; n := n + k;
  return jsonb_build_object('ok', true, 'filas', n);
end $$;

grant execute on function crm_giwa.mayus(text, boolean), crm_giwa.aplicar_mayus() to authenticated;
grant select on crm_giwa.v_mayus_simulacion to authenticated;

-- guardar_ficha_empresa: el nombre de la empresa pasa por mayus(…, true) y el nombre y
-- apellido de cada contacto por mayus() (alta y edición). Aplicado reemplazando esas
-- expresiones en la función vigente (ver 20261024*_ficha_empresa y el SQL de la sesión).
