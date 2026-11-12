-- crm_giwa · Correcciones de datos pedidas por Vicky · 12/11/2026 (aplicadas en la sesión; el antes queda en admin_auditoria)
-- 1) T-0046 Ajuste IPC de Grunwaldt · Alquiler (D-0038, No aceptado): creada a mano el 14/10, antes de aceptar. Se borra.
-- 2) Prodigy · Mantenimiento Agente IA Atención Clientes: D-0005 se renovó dos veces el 12/11 (D-0098 y D-0099).
--    Queda D-0098, que tiene la factura de noviembre (C-0051) y sus alertas (T-0088, T-0089): vuelve a En Curso.
--    D-0099 (sin facturas ni alertas; las suyas, T-0090/T-0091, ya se habían borrado) se borra con su comentario N-0129.
set role crm_giwa_dev;

insert into crm_giwa.admin_auditoria(quien, tabla, registro, accion, antes, despues, motivo)
select 'v.gagey@giwa-ia.com', 'tareas', t.id, 'borrar', to_jsonb(t), null, 'Pedido de Vicky 12/11: alerta IPC de un mantenimiento No aceptado (creada antes de aceptar), confunde'
from crm_giwa.tareas t where t.id = 'T-0046' and t.estado = 'Cancelada';
delete from crm_giwa.tareas where id = 'T-0046' and estado = 'Cancelada';

update crm_giwa.desarrollos set estado_id = 'En Curso' where id = 'D-0098' and estado_id = 'Finalizado';

delete from crm_giwa.comentarios where id = 'N-0129';
delete from crm_giwa.desarrollos where id = 'D-0099'
  and not exists (select 1 from crm_giwa.cobros where desarrollo_id = 'D-0099');

reset role;
