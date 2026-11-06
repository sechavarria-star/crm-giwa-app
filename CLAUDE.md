# crm-giwa-app · CRM GIWA {IA}, fase 3

La app nueva del CRM: una sola página en GitHub Pages que lee y escribe directo en
Supabase. Reemplaza, pantalla por pantalla, al Apps Script de `crm.giwa-ia.com`.
El plan completo está en el doc «CRM GIWA · Plan Fase 3».

Idioma: español rioplatense, informal. Respuestas cortas.

## Dónde está cada cosa

- **Datos:** Supabase **Giwa_Database** (`ofhiogczijhzkuqdjwvz`), schema **`crm_giwa`**.
  Ese proyecto tiene datos de otros clientes (`ko`, `ypf`, `byd`…): nunca tocar otro schema.
- **Cambios de la base:** un archivo nuevo en `supabase/migrations/` por cada cambio.
  Todo objeto se crea como `crm_giwa_dev` (`set role crm_giwa_dev;` al principio), así
  después lo puede cambiar Vicky con su usuario `vicky_crm`.
- **La lógica de plata vive en SQL** (vistas y funciones). El navegador no calcula
  importes: muestra lo que devuelve una vista. Un número, una vista.
- **Diseño (30/10/2026):** la única versión de los estilos es la de este repo. Fuente de
  verdad: `GIWA_identidad_visual.md`. Todos los colores, tipografías y tamaños viven en
  `css/tokens.css` (único archivo con hexadecimales); los componentes C1–C16 en
  `css/componentes.css` + `js/ui.js`. `estilos.css` y `app.css` sólo leen tokens. Ya no se
  sincroniza nada desde el Apps Script.
- **Vistas:** `js/vistas/<modulo>.js` define `VISTAS['<modulo>']`; en `js/app.js` se marca
  el módulo `listo:true`. Lo que no está listo abre el CRM actual.

## Seguridad

- La clave de `js/config.js` es la **publicable**: va en el navegador a propósito. Los
  datos los protege RLS con `crm_giwa.es_equipo()` (logueado + activo en
  `crm_giwa.usuarios`). Nunca poner acá una `service_role` ni una `sb_secret_`.
- El repo es público: sin datos ni secretos.

## Regla obligatoria: cambios quirúrgicos
**Si no se pidió, no se cambia.** Tiene prioridad sobre cualquier mejora, refactorización o rediseño.
- Modificar sólo lo solicitado, con la intervención mínima. No agregar ni quitar nada por iniciativa propia.
- El CSS existente es la fuente de verdad. No cambiar componentes compartidos ni estilos globales por un pedido de una sola vista.
- No tocar funciones, tablas, cálculos ni datos ajenos al pedido. No sobrescribir valores automáticamente.
- No inventar estados, campos ni reglas. Los estados son siempre los definidos abajo.
- Antes de modificar: identificar archivos y dependencias, proponer qué cambia y qué queda intacto, y esperar el OK.
- Después: verificar el pedido, el CSS y que no haya cambios colaterales. Decir qué se probó de verdad y qué no.

## Trabajo
- **Trabajamos dos personas en este repo (Sebastián y Vicky).** Antes de tocar nada en cada
  sesión: `git pull --ff-only origin main` y leer `git log` de lo nuevo (código y
  `supabase/migrations/`), así no se pisan cambios del otro. Si hay cambios locales sin
  subir, `git pull --rebase` y resolver antes de seguir. Antes de cada `git push`, volver a
  traer lo último y revisar que no queden marcas de conflicto.
- **Comunicación con Vicky:** respuestas cortas y claras. Ante una contradicción, frenar y preguntar por sí o no.
- Probar en local (`python3 -m http.server 5173`) contra la base real antes de publicar.
- Publicar = `python3 tools/versionar.py` y `git push` a `main` (GitHub Pages). Sin versionar, el navegador sigue
  mostrando los archivos viejos. Volver atrás = revertir el commit.
- **Base:** primero probar en una transacción que se deshace; correcciones de datos, sólo con pedido explícito y
  dejando el antes y el después en `admin_auditoria`.
- **Apps Script:** queda para Drive y Gmail (`Puente.js`). `clasp push` y `clasp deploy` sólo con el OK de Vicky.
- Una pantalla vive en un solo lugar: mientras se pasa, no se cambia en el Apps Script.
- Hoy y Clientes están congeladas: sólo se tocan con pedido explícito.

## Estados de proyectos y desarrollos (29/10/2026)
- Desarrollo: Nuevo · Aprobado · En Curso · En Garantía · Finalizado · Rechazado (`estados.js`, `_canonSol`).
- El estado del proyecto SALE de sus desarrollos (`calcularEstadoDesde`, misma cascada que el Apps Script):
  1 Rechazado si todos rechazados · 2 Activo si alguno En Curso o En Garantía · 3 Finalizado si todos
  finalizados o rechazados · 4 Aprobado si hay algo ganado y nada ejecutándose · 5 Negociación si se envió
  la propuesta · 6 Prospecto. «Activo» no se elige: aparece al arrancar un desarrollo.
- Detenido NO es un estado: es una marca. El PROYECTO se detiene (`proyectos.detenido`); el DESARROLLO se
  pausa (`desarrollos.detenido`, en pantalla «Pausado»), independiente (ej. un abono que no arranca).
  Con el proyecto detenido, sus desarrollos se ven «detenido por el proyecto»; al reanudarlo cada uno vuelve
  a lo que tenía. Ninguna de las dos marcas cambia el estado calculado (no hay ciclo).
- Finalizar el proyecto cierra todos sus desarrollos (`finalizar_proyecto`). Rechazar, también (`rechazar_proyecto`).
- Seguimiento filtra por: Activo · En garantía (Activo con algo en garantía) · En mantenimiento (Activo donde lo
  único vivo es el mantenimiento) · Aprobado · Negociación · Prospecto · Detenido. Finalizado y Rechazado, en Proyectos.
- Colores: un solo mapa (`_PALETA_EST` + tokens `--e-*` en `app.css`). Ninguna pantalla pone colores a mano.

## Decisiones vigentes (06/11/2026)
Lo reemplazado y su historia están en `GIWA CODE/GIWA - CRM/HISTORIAL.md` (Drive, fuera del repo).

**General**
- Las palabras son **proyecto** y **desarrollo**; «solución» ya no se usa. En pantalla, «Rechazado» se lee «No aceptado».
- Montserrat para texto y Courier New para números. Modales y desplegables abiertos sobre `#0D122F`.
- Importes sin decimales en la app. Un solo tipo de cambio: BCRA.
- Logo del cliente: fondo blanco, `contain`, centrado. Es una excepción explícita a los fondos oscuros.
- Tablas: un clic en el título ordena A-Z y otro Z-A (`js/orden.js`). Fechas alineadas a la derecha.
- Botones `.ui-btn` a 10 px. Contorno azul GIWA en las líneas abiertas.
- Deshacer (`js/deshacer.js`): 5 minutos, sólo quien hizo la acción. Cubre Registrar pago, Arrancar, cambio de estado de un desarrollo y Aprobar.
- La clave de Gemini sólo la lee el Apps Script; el navegador no puede leerla.
- Configuración › Datos, sólo Vicky: corregir y eliminar en las tablas, con motivo y registro de cambios. El menú Datos salió del lateral.

**Tareas y Hoy**
- Una tarea puede tener varios participantes en un único registro; cualquiera de ellos la cierra para todos. Los recordatorios nacen con uno.
- Delegar a uno o varios no crea copias. Sólo el responsable finaliza o procesa.
- Menciones con `@`: las resuelve `comentar()` en la base, avisan por Telegram y aparecen en Hoy.
- Novedades en Hoy: lo cargado en Mockups y propuestas (14 días). No manda Telegram.
- Tareas rápidas: se editan en Configuración › Listas.

**Proyectos**
- Ficha: tabs Información, Análisis, Desarrollos, Económico y Documentos y Drive. A la derecha, Tareas, Otros comentarios y Novedades.
- Ficha del desarrollo: tabs horizontales Información, Cronograma (riel), Económico (cotizado, aprobado, cuotas y estado de pago) y Módulos de trabajo.
- Edición limitada. Proyecto: Sponsor, Probabilidad y Fecha probable de cierre. Desarrollo: sólo el monto. Lo demás, en Datos.
- Pausar se hace con el botón general del proyecto, que pregunta qué se pausa; en el desarrollo sólo queda Reanudar. En la lista, un proyecto detenido dice Detenido.
- Aprobar: cada desarrollo queda Aprobado, No aceptado o Nuevo (sin cambios). No existe «En espera». Un mantenimiento se carga con cuota mensual y meses.
- `desarrollos.monto_cotizado` guarda lo cotizado antes de aprobar.
- Renovar un mantenimiento: con 2 cuotas o menos por cobrar, en la fila o en el modal de facturas. Crea uno nuevo con sus alertas y finaliza el anterior con sus cobros.
- Alertas de facturación: se crean al arrancar el desarrollo, nunca al aprobar. Aparecen recién en su ventana de aviso.
- Fecha probable de cierre de negociación: obligatoria en Carga rápida y al crear desde el Cotizador. El Forecast la usa; sin ella, propuesta + 60 días.
- Mockups y propuestas: tabla `entregables`, en Documentos y Drive. Las facturas no van ahí: están en Administración.
- Análisis: sólo desarrollos aprobados, sin IDs y con fecha de venta.

**Administración**
- Nueva factura: Cliente y, por línea, Proyecto, Desarrollo, Concepto, Cuota y Monto. Aprobado sin arrancar no aparece: se factura al iniciar.
- Registrar pago es por línea. Recibo cuenta 0 y Nota de crédito resta (`signo_comprobante`).
- El PDF va a la carpeta de Drive de quien factura y el mail queda como borrador en Gmail: nunca se envía solo.

**Estado financiero**
- Análisis por Cliente: unifica las dos vistas, despliega proyectos y excluye a Giwa-IA. Sin Margen, Bonificación ni Con 12 meses.
- ¿Dónde podríamos estar?: sin detenidos; los No aceptados, al final.

**Herramientas**
- Valores de mercado: sólo el tarifario del 04/11/2026. Actualizar propone con Gemini y no guarda hasta revisar.
- Solicitudes de mejoras: pedidos y feedback, con aviso por Telegram a Administración.

**Pendientes**
- Corrección del recálculo al editar prospectos en el Cotizador (pospuesta): hasta entonces, no tocar Guardar al editar.
- Rechazar tarea (pospuesta).
- Valores cotizados de URBA y Prune (D-0032, D-0033, D-0058, D-0059): los pasa Vicky.
