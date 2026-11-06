# Cartero de Soporte GIWA

Apps Script chico que manda los mails de soporte (avisos de tickets, respuestas,
resueltos, reportes e invitaciones al portal) desde una cuenta real de GIWA.
Cada 1 minuto le pide a Supabase los mails de la cola (`crm_giwa.soporte_mail_cola`),
los manda y avisa cómo le fue. **No se publica como app web** y no tiene acceso a la
base: entra por la Edge Function `soporte-cartero` con una clave compartida.

## Instalarlo (una sola vez, logueado con la cuenta que va a mandar)

1. En el CRM: **Soporte › Accesos al portal › Mails › «Generar clave»** (cualquiera del equipo).
   Copiá la clave: se muestra una sola vez.
2. https://script.google.com con la cuenta que manda → **Nuevo proyecto**.
   Nombre: `cartero-soporte`.
3. Borrar el contenido de `Código.gs`, pegar el de `Cartero.gs` y guardar.
4. **Configuración del proyecto** (engranaje) → **Propiedades de la secuencia de comandos**
   → agregar `CLAVE_CARTERO` con la clave del paso 1.
5. Volver al editor, elegir **`instalarActivador`** → **Ejecutar** → aceptar los permisos
   (tildar «Enviar correo electrónico en tu nombre»). En el registro tiene que aparecer
   `Listo: el cartero revisa la cola cada 1 minuto, mandando desde …`.

En el CRM, Mails tiene que decir **Cartero activo** y la cuenta.

## Que salgan desde soporte@giwa-ia.com

- **Si soporte@ es una cuenta real del Workspace (con su propia casilla):** instalá el cartero
  logueado como soporte@ (los pasos de arriba). Después, en la cuenta donde estaba antes,
  corré `desinstalarActivador`: si quedan dos carteros, los mails salen de cualquiera de los dos.
- **Si soporte@ es un alias o un grupo:** dejá el cartero en la cuenta que lo tiene y
  1. en Gmail de esa cuenta: Configuración › Cuentas › «Enviar como» › agregar soporte@giwa-ia.com
     (si es un alias del Workspace aparece directo; si es un grupo, Google manda un código de confirmación al grupo);
  2. en el Apps Script: Propiedades › agregar `REMITENTE` = `soporte@giwa-ia.com`;
  3. pegar el `Cartero.gs` nuevo y correr `instalarActivador` (pide permiso de Gmail y revisa que el alias exista).

## Operación

- **Apagarlo**: correr `desinstalarActivador`. Los mails que se encolen esperan hasta que vuelva.
- **Cambiar el código**: pegar la versión nueva y guardar. No hay que reinstalar nada.
- **Cambiar la clave**: «Generar clave» de nuevo en el CRM y pegarla en `CLAVE_CARTERO`.
  La anterior deja de servir en el momento.
- **Si un mail queda «tomado»** y el cartero no confirma en 10 minutos, se vuelve a ofrecer;
  a los 3 intentos queda como error (se ve en el CRM, con «Reintentar»).
- Remitente: el nombre y el Reply-To salen de Configuración (`Soporte_MailNombre`,
  `Soporte_MailResponderA`). Los avisos al equipo van a `Soporte_MailEquipo`.
