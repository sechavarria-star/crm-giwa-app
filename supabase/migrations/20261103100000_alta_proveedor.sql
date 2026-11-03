-- Documentación de alta de proveedor por cliente (03/11/2026)
-- Cada empresa: el link a SU carpeta de Drive para esta documentación (la crea y comparte quien la carga)
-- y la lista de documentos que ese cliente pide, con su estado, el link al archivo y el vencimiento.
-- Mismo acceso que empresas: sólo el equipo (es_equipo). Nada se mezcla: cada fila es de una empresa.
set role crm_giwa_dev;

alter table crm_giwa.empresas add column if not exists carpeta_proveedor text;

create table if not exists crm_giwa.proveedor_docs (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  text not null references crm_giwa.empresas(id) on delete cascade,
  documento   text not null check (btrim(documento) <> ''),
  estado      text not null default 'Pendiente' check (estado in ('Pendiente', 'Entregado')),
  link        text,
  vence       date,
  nota        text,
  orden       int not null default 0,
  creado      timestamptz not null default now(),
  actualizado timestamptz not null default now(),
  actualizado_por text default (current_setting('request.jwt.claims', true)::jsonb ->> 'email')
);
create index if not exists proveedor_docs_empresa on crm_giwa.proveedor_docs(empresa_id, orden);

create or replace function crm_giwa._proveedor_docs_tocado() returns trigger language plpgsql as $$
begin
  new.actualizado := now();
  new.actualizado_por := current_setting('request.jwt.claims', true)::jsonb ->> 'email';
  return new;
end $$;
drop trigger if exists proveedor_docs_tocado on crm_giwa.proveedor_docs;
create trigger proveedor_docs_tocado before update on crm_giwa.proveedor_docs for each row execute function crm_giwa._proveedor_docs_tocado();

alter table crm_giwa.proveedor_docs enable row level security;
drop policy if exists equipo on crm_giwa.proveedor_docs;
create policy equipo on crm_giwa.proveedor_docs for all to authenticated
  using ((select crm_giwa.es_equipo())) with check ((select crm_giwa.es_equipo()));
grant select, insert, update, delete on crm_giwa.proveedor_docs to authenticated;
grant all on crm_giwa.proveedor_docs to service_role;

reset role;
