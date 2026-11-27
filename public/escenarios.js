// =============================================================
//  Escenarios de foto real: el lugar, la mesa de la foto y los
//  jugadores de la foto (a quienes se les pone la cara de tus amigos).
//  Cada escenario vive en public/escenarios/<nombre>/ (ver README).
// =============================================================
let ESCENARIOS = {};

async function cargarEscenarios() {
  try {
    const lista = await (await fetch('/api/escenarios')).json();
    ESCENARIOS = Object.fromEntries(lista.map((e) => [e.id, e]));
  } catch { ESCENARIOS = {}; }
  return ESCENARIOS;
}

// % dentro de la foto (para colocar cosas encima de ella)
const pctX = (e, x) => (100 * x) / e.ancho;
const pctY = (e, y) => (100 * y) / e.alto;

