-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · el ORDEN de las filas y de las columnas · fase 1
-- ──────────────────────────────────────────────────────────────────────
-- En la fase 1 el Apps Script ve cada tabla como si fuera la hoja de
-- siempre (_SheetSB.js). El código ubica un registro por NÚMERO DE FILA
-- (_rowIdx → getRange(fila, col)) e indexa las columnas por POSICIÓN, así
-- que la «hoja» tiene que salir siempre en el mismo orden que la planilla:
--
--   · orden: la fila que tenía en la planilla (la carga la migración). Las
--     filas nuevas salen de una secuencia que arranca en 1.000.000, o sea
--     siempre al final, como un appendRow.
--   · mapa_hojas.posicion: la columna que ocupaba el encabezado.
-- ══════════════════════════════════════════════════════════════════════

create sequence if not exists crm_giwa.orden_seq start 1000000;
grant usage on sequence crm_giwa.orden_seq to service_role, authenticated;

do $$
declare t text;
begin
  for t in select distinct tabla from crm_giwa.mapa_hojas loop
    execute format('alter table crm_giwa.%I add column if not exists orden bigint not null
                    default nextval(''crm_giwa.orden_seq'')', t);
    execute format('create index if not exists %I on crm_giwa.%I (orden)', t || '_orden', t);
  end loop;
end $$;

alter table crm_giwa.mapa_hojas add column if not exists posicion int;

-- La posición la carga 20261020120100_crm_giwa_mapa.sql (orden de la hoja).

drop view if exists crm_giwa.v_mapa_tipos;
create view crm_giwa.v_mapa_tipos as
select m.hoja, m.encabezado, m.tabla, m.columna, m.posicion,
       c.data_type, c.udt_name, (c.is_nullable = 'NO') as obligatoria,
       (c.column_default is not null) as tiene_default
from crm_giwa.mapa_hojas m
join information_schema.columns c
  on c.table_schema = 'crm_giwa' and c.table_name = m.tabla and c.column_name = m.columna;
revoke all on crm_giwa.v_mapa_tipos from anon, authenticated;
grant select on crm_giwa.v_mapa_tipos to service_role;
