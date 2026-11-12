-- crm_giwa · Se borran las alertas de facturación de Prune canceladas · 12/11/2026
-- Pedido de Vicky: T-0072 (D-0058) y T-0073 (D-0059) nacieron al aprobar, antes de la regla
-- «se crean al arrancar» (20261104110000), quedaron Canceladas y confunden en Hoy › Finalizadas.
-- Sin comentarios ni tickets asociados. El antes queda en admin_auditoria.
set role crm_giwa_dev;

insert into crm_giwa.admin_auditoria(quien, tabla, registro, accion, antes, despues, motivo)
select 'v.gagey@giwa-ia.com', 'tareas', t.id, 'borrar', to_jsonb(t), null,
       'Alerta de facturación cancelada (creada al aprobar, antes de la regla de crearlas al arrancar). Pedido de Vicky.'
from crm_giwa.tareas t where t.id in ('T-0072', 'T-0073') and t.estado = 'Cancelada';

delete from crm_giwa.tareas where id in ('T-0072', 'T-0073') and estado = 'Cancelada';

reset role;
