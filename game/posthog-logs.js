'use strict';

// Solo este registrador dedicado envía líneas a PostHog; los console.* existentes permanecen locales.
const { PostHog } = require('posthog-node');

const clave = process.env.POSTHOG_KEY || '';
const host = process.env.POSTHOG_HOST || '';
const faltantes = [
  ['POSTHOG_KEY', clave],
  ['POSTHOG_HOST', host],
].filter(([, valor]) => !valor);

if (faltantes.length && process.env.NODE_ENV !== 'production') {
  for (const [variable] of faltantes) {
    console.warn(`${variable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${variable} is configured`);
  }
}

const posthog = faltantes.length ? null : new PostHog(clave, {
  host,
  logs: { serviceName: 'conquian-game-server' },
});

function info(mensaje, atributos) {
  posthog?.logger.info(mensaje, atributos);
}

async function apagar() {
  if (!posthog) return;
  try {
    await posthog.shutdown(3000);
  } catch {
    // El apagado de analítica nunca debe retrasar el apagado del juego.
  }
}

module.exports = { info, apagar };
