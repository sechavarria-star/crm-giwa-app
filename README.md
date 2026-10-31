# CRM GIWA {IA} · app

El CRM interno de GIWA como una sola página: GitHub Pages + Supabase.

## Cómo está armado

```
index.html            la cáscara: acceso, barra superior, #vista
css/estilos.css       Design System (generado desde _Estilos.html del Apps Script)
css/app.css           lo propio de esta app (acceso, contenedor)
js/config.js          URL de Supabase y clave PUBLICABLE
js/sb.js              login (Supabase Auth con Google) y db() → schema crm_giwa
js/app.js             módulos, rutas (#/hoy, #/pm…), barra y arranque
js/util.js            esc() y ayudas comunes
js/base.js            set, fmt, ff, velo…
js/iconos.js          ico('nombre')
js/dialogo.js         ask / say / pedir, en vez de alert/confirm
js/vistas/*.js        una por módulo, a medida que pasan
supabase/migrations/  cada cambio de la base, en orden
css/tokens.css        colores, tipografías y tamaños (único archivo con hex)
css/componentes.css   componentes C1–C16 (los arma js/ui.js)
```

## Probar en local

```bash
python3 -m http.server 5173
```

y abrir `http://localhost:5173`. Usa la base real: lo que se guarde, se guarda.

## Publicar

`git push` a `main`. GitHub Pages publica en un par de minutos.

## Login

Supabase Auth con Google (OAuth «GIWA {IA}», compartido en Giwa_Database). Cada
dirección donde corre la app tiene que estar en Supabase → Authentication → URL
Configuration → Redirect URLs. Entra quien esté activo en `crm_giwa.usuarios`.

## Estado de la migración

| Módulo | Dónde funciona |
|---|---|
| Hoy | App nueva |
| Clientes | App nueva |
| Administración | App nueva |
| Proyectos (PM) | App nueva (falta Cotizar, Agenda y Nuevo proyecto) |
| Soporte | Módulo nuevo, en preparación (los tickets de su app) |
| Cotizador | CRM actual |
| Configuración | App nueva (Telegram, Plantilla Doc, Mantenimiento y Diagnósticos siguen en el CRM actual) |
