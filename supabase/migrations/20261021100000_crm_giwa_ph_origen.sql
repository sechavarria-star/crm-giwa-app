-- PH_Origen · si las horas de una fila son Reales, Estimadas o Pendientes (21/10/2026)
-- Lo sembrado el 20/10 por las tandas y auditorías es ESTIMACIÓN, no horas reales.
alter table crm_giwa.proyecto_horas add column if not exists origen text;
delete from crm_giwa.mapa_hojas where hoja='ProyectoHoras' and encabezado='PH_Origen';
insert into crm_giwa.mapa_hojas (hoja, tabla, encabezado, columna, posicion) values ('ProyectoHoras','proyecto_horas','PH_Origen','origen',17);
update crm_giwa.proyecto_horas
   set origen = 'Estimado',
       nota = 'Estimación · auditoría 20/10 (no real)' || case when coalesce(nota,'') <> '' then ' · ' || nota else '' end
 where coalesce(origen,'') = '' and desarrollo_id in ('D-0003','D-0004','D-0006','D-0008','D-0009','D-0010','D-0020','D-0028','D-0030','D-0037','D-0041');
