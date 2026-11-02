-- Teléfonos listos para WhatsApp (02/11/2026)
-- Misma regla que telWa() de js/util.js: Argentina por defecto, +549 área número,
-- sin el 0 del área ni el 15. Los de otro país (empiezan con + o 00 y no son 54) no se tocan.
-- Lo usa el botón «Normalizar teléfonos» de Clientes › Contactos (con confirmación).
set role crm_giwa_dev;

create or replace function crm_giwa.normalizar_telefono(t text)
returns text language plpgsql immutable as $$
declare s text := btrim(coalesce(t, '')); d text := regexp_replace(s, '\D', '', 'g'); a int;
begin
  if d = '' then return null; end if;
  if left(s, 1) = '+' and left(d, 2) <> '54' then return null; end if;          -- otro país
  if left(d, 2) = '00' then d := substr(d, 3); if left(d, 2) <> '54' then return null; end if; end if;
  if left(d, 2) = '54' then d := substr(d, 3); end if;
  d := regexp_replace(regexp_replace(d, '^9', ''), '^0', '');
  if length(d) = 12 then
    for a in 2..4 loop
      if substr(d, a + 1, 2) = '15' then d := left(d, a) || substr(d, a + 3); exit; end if;
    end loop;
  end if;
  if length(d) = 10 and left(d, 2) = '15' then d := '11' || substr(d, 3); end if;
  if length(d) <> 10 then return null; end if;                                   -- no se entiende: no se toca
  return '+549' || d;
end $$;

create or replace function crm_giwa.normalizar_telefonos()
returns jsonb language plpgsql as $$
declare n int;
begin
  update crm_giwa.contactos c set telefono = crm_giwa.normalizar_telefono(c.telefono)
   where crm_giwa.normalizar_telefono(c.telefono) is not null
     and crm_giwa.normalizar_telefono(c.telefono) is distinct from c.telefono;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'cambiados', n);
end $$;

reset role;
