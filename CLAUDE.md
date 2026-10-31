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

## Trabajo

- Mostrar el plan y esperar confirmación antes de cambios grandes.
- Probar en local (`python3 -m http.server 5173`) contra la base real antes de publicar.
- Publicar = `python3 tools/versionar.py` y `git push` a `main` (GitHub Pages). Sin versionar, el navegador sigue
  mostrando los archivos viejos. Volver atrás = revertir el commit.
- Una pantalla vive en un solo lugar: mientras se pasa, no se cambia en el Apps Script.
- Antes de pasar una pantalla, cada número tiene que dar igual que en el Apps Script.

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
