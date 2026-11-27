'use strict';
// =============================================================
//  Métricas anónimas con PostHog (lado del servidor)
//
//  - Solo se activa si existe la variable POSTHOG_KEY (en tu compu no manda nada).
//  - A PostHog NUNCA se le manda: nombres, selfies, chat, la llave secreta, ni la IP.
//    Cada navegador se identifica con un "id de visitante" al azar que no dice quién eres.
//  - Los eventos se juntan y se mandan en paquetes cada 10 s (no frena el juego).
//  - Si PostHog falla o está caído, el juego sigue igual: los errores se ignoran.
// =============================================================

const CLAVE = process.env.POSTHOG_KEY || '';
const HOST = (process.env.POSTHOG_HOST || 'https://us.i.posthog.com').replace(/\/+$/, '');
const MAX_COLA = 1000;          // si PostHog no contesta, no se acumula memoria sin fin
const CADA_MS = 10_000;

let cola = [];
let reloj = null;
let enviar = (url, opciones) => fetch(url, opciones);   // se puede cambiar en las pruebas

const esVisitante = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(v);

function capturar(visitante, evento, propiedades = {}) {
  if (!CLAVE && !module.exports._forzar) return;
  if (!esVisitante(visitante)) return;
  if (cola.length >= MAX_COLA) cola.shift();
  cola.push({
    event: evento,
    distinct_id: visitante,
    timestamp: new Date().toISOString(),
    properties: {
      ...propiedades,
      $geoip_disable: true,      // no se calcula ubicación (sería la del servidor de todos modos)
      $lib: 'conquian-servidor',
    },
  });
  if (cola.length >= 50) vaciar();
  else if (!reloj) reloj = setTimeout(vaciar, CADA_MS);
}

async function vaciar() {
  clearTimeout(reloj);
  reloj = null;
  if (!cola.length) return;
  const lote = cola;
  cola = [];
  try {
    await enviar(`${HOST}/batch/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: CLAVE, batch: lote }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    console.warn('PostHog no respondió; se pierden', lote.length, 'eventos:', err.message);
  }
}

// Al apagar el servidor (Render manda SIGTERM al publicar) se manda lo pendiente
for (const senal of ['SIGTERM', 'SIGINT']) {
  process.once(senal, () => { vaciar().finally(() => process.exit(0)); });
}

module.exports = {
  activo: () => Boolean(CLAVE),
  capturar,
  vaciar,
  esVisitante,
  _forzar: false,
  _cola: () => cola,
  _usarEnvio: (fn) => { enviar = fn; },
};
