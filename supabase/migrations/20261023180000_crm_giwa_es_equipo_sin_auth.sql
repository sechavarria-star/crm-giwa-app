-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa.es_equipo() sin depender del schema auth · 23/10/2026
-- ──────────────────────────────────────────────────────────────────────
-- Desde 20261020140000 la función es de crm_giwa_dev (para que Vicky pueda
-- cambiarla), y crm_giwa_dev NO tiene acceso al schema auth, a propósito.
-- Como es SECURITY DEFINER corre con los permisos de su dueño, así que
-- auth.jwt() fallaba con «permission denied for schema auth» y nadie podía
-- entrar a la app nueva (el Apps Script no se enteró: usa la service key).
--
-- auth.jwt() no hace más que leer request.jwt.claims; se lee directo y la
-- función deja de necesitar el schema auth.
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

create or replace function crm_giwa.es_equipo() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from crm_giwa.usuarios u
    where u.activo and u.es_giwa
      and u.mail = lower(coalesce(
            nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email', ''))
  )
$$;

reset role;
