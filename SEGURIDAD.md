# Seguridad del Conquián

Resumen de la revisión de seguridad y de cómo mantener la app segura.

## Protecciones activas

- **Llave secreta por jugador.** Tu navegador guarda una llave que nunca se le manda a nadie más. Los demás solo ven un id público, así que nadie puede hacerse pasar por ti.
- **Códigos de mesa de 5 letras** generados con números aleatorios seguros, y límite de intentos fallidos por persona.
- **Todo lo que llega del navegador se revisa:** tipo de dato, tamaño y que sean cartas o jugadas válidas. Los errores internos no se le muestran al jugador.
- **Límites contra abuso:**
  - acciones por segundo;
  - mesas creadas por persona;
  - mesas abiertas en total (`MAX_SALAS`, 300 por defecto);
  - conexiones por persona;
  - tamaño de mensajes.
- **Solo tu página puede conectarse al servidor.** Para agregar un dominio propio, usa la variable `ALLOWED_ORIGINS` (por ejemplo `https://conquian.midominio.com`).
- **Encabezados de seguridad:** CSP, anti-iframe (clickjacking), nosniff, sin referer, y HSTS en producción.
- **HTTPS obligatorio en producción:** con `NODE_ENV=production`, lo que llegue por http se redirige a https.
- **Privacidad:**
  - Las selfies y los nombres solo viven en la memoria del servidor; no hay base de datos.
  - Solo los ve la gente de tu mesa.
  - Se borran al cerrar la mesa, cuando un jugador sale antes de repartir, o cuando la mesa se borra: a los 30 minutos sin nadie conectado, o a las 12 horas como máximo.
- **Chat:** cada mensaje se limpia (máximo 200 caracteres, sin caracteres invisibles), hay un límite de mensajes seguidos por persona, y en pantalla se muestran siempre como texto, nunca como código (aunque alguien escriba `<script>`, sale tal cual). Solo lo ven los de la mesa, se guardan los últimos 50 y se borran junto con la mesa.
- **Métricas (PostHog):** las manda el servidor, no el navegador (no hay scripts de terceros en la página ni cookies). Solo llevan un id de visitante al azar y datos del juego (cuántos jugadores, duración, quién ganó como "ganó/perdió"). Nunca nombres, selfies, chat, códigos de mesa, llaves ni IP. Se respeta "No rastrear" / Global Privacy Control. La llave de PostHog va en una variable de entorno, nunca en el código.
- **El barajeo usa números aleatorios seguros** del sistema, que no se pueden predecir.
- **Dinero:** el juego no procesa ni guarda dinero real; solo calcula las cuentas. La pantalla de inicio avisa que es para mayores de 18 años.

## Para mantenerla segura

1. Corre `npm audit` cada mes y `npm update` cuando haya parches.
2. Publícala siempre con `NODE_ENV=production`; ya viene en `render.yaml`.
3. No subas a GitHub archivos `.env`, contraseñas ni llaves (ya están en `.gitignore`).
4. Si agregas un chat o algo donde la gente escriba, muéstralo siempre con `esc()` o `textContent`, nunca con HTML directo.
5. Antes de agregar funciones que guarden datos (base de datos, cuentas de usuario), revisa qué datos personales guardas, cuánto tiempo y quién los puede ver.
6. Si algún día manejas dinero real dentro de la app, consulta a un abogado: las apuestas con dinero están reguladas en México (Ley Federal de Juegos y Sorteos).
