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
- **Diseño:** `css/estilos.css`, `js/base.js`, `js/iconos.js`, `js/dialogo.js`,
  `js/calculos.js` y `js/estados.js` se GENERAN desde el Apps Script con
  `tools/sincronizar-desde-apps-script.py` (desde una copia fresca de HEAD). No editarlos
  a mano mientras dure la transición. Lo propio de la app va en `css/app.css`, sólo
  tokens. Reglas visuales: skill `design-giwa`.
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
