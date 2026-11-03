-- Hospital de Niños San Justo · mantenimiento D-0021 (03/11/2026, aplicado a mano con OK de Victoria)
-- Arrancó el 01/10/2026 (estaba 31/08/2026). La regla no cambia: ajuste trimestral por IPC desde la base
-- (fecha_ajuste_cuota o, si no hay, fecha_inicio) + 3 meses → primer pedido 01/01/2027, después de 3 cuotas.
-- Fin del abono: inicio + 12 cuotas = 01/10/2027. T-0052 tenía un fin roto (año 47500) de la migración.
select crm_giwa.fecha_desarrollo('D-0021', 'fecha_ini', '2026-10-01');
select crm_giwa.fecha_desarrollo('D-0021', 'fecha_fin', '2027-10-01');
update crm_giwa.tareas set vencimiento = '2027-01-01', descripcion = 'Ajuste trimestral de la cuota por IPC. Base: 2026-10-01.' where id = 'T-0074';
update crm_giwa.tareas set fin = crm_giwa.fin_contrato('D-0021') where id in ('T-0052', 'T-0074');
