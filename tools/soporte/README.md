# Migración de la planilla «Soporte GIWA» a crm_giwa.soporte_*

1. Bajar la planilla como .xlsx (Drive → Descargar → Microsoft Excel). No se versiona: tiene datos de clientes.
2. `python3 -m venv /tmp/v && /tmp/v/bin/pip install openpyxl`
3. `/tmp/v/bin/python -I tools/soporte/generar.py soporte.xlsx tools/soporte/leer.py > carga.sql`
4. Correr `carga.sql` entre `begin;` y `commit;`. Es idempotente (`on conflict do nothing`): sirve para el segundo pase.

Estados viejos: Nueva → Nuevo, En curso → En proceso, Resuelta → Cerrado (vacío: Cerrado si tiene fecha de resuelta).
La clasificación de la planilla queda en `clasificacion_hist`. `tarea_crm_id = «histórico»` no es una tarea: queda vacío.
Los adjuntos quedan con su `drive_id`; pasarlos a Storage es un paso aparte.
