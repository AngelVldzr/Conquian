// =============================================================
//  Baraja española dibujada en vector (SVG), estilo clásico:
//  nítida a cualquier tamaño, con número y palo claros en la esquina.
// =============================================================
const COLOR_PALO = { oros: '#b07800', copas: '#b3261e', espadas: '#1f4e8c', bastos: '#2c6e2a' };
const NOMBRE_FIG = { 10: 'Sota', 11: 'Caballo', 12: 'Rey' };

// Degradados compartidos por todas las cartas (se ponen una sola vez en la página)
(function definiciones() {
  const defs = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
    <radialGradient id="g-oro" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#fff3b0"/><stop offset=".45" stop-color="#f2c230"/><stop offset="1" stop-color="#a86d00"/></radialGradient>
    <linearGradient id="g-oro-lin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe680"/><stop offset=".5" stop-color="#e6aa1c"/><stop offset="1" stop-color="#9a6200"/></linearGradient>
    <linearGradient id="g-copa" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b8840e"/><stop offset=".35" stop-color="#ffd860"/><stop offset=".7" stop-color="#e3a91e"/><stop offset="1" stop-color="#9a6a00"/></linearGradient>
    <linearGradient id="g-hoja" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7d9fc8"/><stop offset=".45" stop-color="#e9f1fb"/><stop offset=".55" stop-color="#c9d9ee"/><stop offset="1" stop-color="#5d82b4"/></linearGradient>
    <linearGradient id="g-basto" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2f6b1f"/><stop offset=".4" stop-color="#7cc24a"/><stop offset="1" stop-color="#2b5e1c"/></linearGradient>
    <linearGradient id="g-basto-r" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8e2a12"/><stop offset=".4" stop-color="#e2683a"/><stop offset="1" stop-color="#7d230e"/></linearGradient>
    <linearGradient id="g-papel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#f1ede2"/></linearGradient>
  </defs></svg>`;
  const meter = () => document.body.insertAdjacentHTML('afterbegin', defs);
  if (document.body) meter(); else document.addEventListener('DOMContentLoaded', meter);
})();

// ---------- Símbolos de los palos (centrados en 0,0, caben en ~20x30) ----------
const SIMBOLO = {
  oros: `<circle r="10" fill="url(#g-oro)" stroke="#7a4f00" stroke-width="1"/>
    <circle r="7.2" fill="none" stroke="#8a5a00" stroke-width=".8"/>
    <g fill="#c0392b">${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<ellipse rx="1.3" ry="3" transform="rotate(${a}) translate(0 -3.3)"/>`).join('')}</g>
    <circle r="1.7" fill="#7a4f00"/>`,
  copas: `<path d="M-8.5,-11 H8.5 C9,-2 4.5,2.5 0,2.5 C-4.5,2.5 -9,-2 -8.5,-11Z" fill="url(#g-copa)" stroke="#7a5200" stroke-width=".9"/>
    <path d="M-8.4,-9 H8.4" stroke="#c0392b" stroke-width="2.2"/>
    <path d="M-1.6,2.5 L-1.2,7 L1.2,7 L1.6,2.5Z" fill="#d79a16" stroke="#7a5200" stroke-width=".6"/>
    <ellipse cy="4.6" rx="2.6" ry="1.4" fill="#c0392b"/>
    <path d="M-6.5,11.5 C-5,8 5,8 6.5,11.5Z" fill="url(#g-copa)" stroke="#7a5200" stroke-width=".8"/>`,
  espadas: `<path d="M0,-15 L2.3,-11 L2.3,5 L-2.3,5 L-2.3,-11Z" fill="url(#g-hoja)" stroke="#27466e" stroke-width=".8"/>
    <path d="M0,-12 V4" stroke="#27466e" stroke-width=".5" opacity=".6"/>
    <path d="M-7.5,5 C-6,4 6,4 7.5,5 C6,7.5 -6,7.5 -7.5,5Z" fill="url(#g-oro-lin)" stroke="#7a4f00" stroke-width=".7"/>
    <rect x="-1.5" y="7" width="3" height="5.5" rx="1" fill="#8a3b1a" stroke="#4a1e0c" stroke-width=".5"/>
    <circle cy="14" r="2" fill="url(#g-oro)" stroke="#7a4f00" stroke-width=".5"/>`,
  bastos: `<path d="M-2.6,14 L-4.2,-6 C-5,-14 5,-14 4.2,-6 L2.6,14 C1.5,15.5 -1.5,15.5 -2.6,14Z" fill="url(#g-basto)" stroke="#1d4012" stroke-width=".9"/>
    <path d="M-4.4,-8 C-5,-14 5,-14 4.4,-8 C2,-6.5 -2,-6.5 -4.4,-8Z" fill="url(#g-basto-r)"/>
    <g fill="#1d4012"><path d="M-3.9,-1 l-2.4,-1.2 l2.2,2.6Z"/><path d="M3.6,4 l2.4,-1 l-2.2,2.8Z"/><path d="M-3.2,9 l-2.2,-.6 l2,2.2Z"/></g>
    <g fill="#e2683a" opacity=".8"><circle cx="-1" cy="2" r="1"/><circle cx="1.2" cy="-3" r=".9"/></g>`,
};
const simbolo = (palo, x, y, s, rot = 0) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">${SIMBOLO[palo]}</g>`;

// Acomodo de los símbolos (como la baraja clásica): [x, y, giro]
const ACOMODO = {
  oros: {
    1: [[50, 75, 0]], 2: [[50, 44, 0], [50, 106, 0]], 3: [[50, 36, 0], [50, 75, 0], [50, 114, 0]],
    4: [[34, 46, 0], [66, 46, 0], [34, 104, 0], [66, 104, 0]],
    5: [[34, 42, 0], [66, 42, 0], [50, 75, 0], [34, 108, 0], [66, 108, 0]],
    6: [[36, 42, 0], [64, 42, 0], [36, 75, 0], [64, 75, 0], [36, 108, 0], [64, 108, 0]],
    7: [[36, 42, 0], [64, 42, 0], [50, 59, 0], [36, 76, 0], [64, 76, 0], [36, 108, 0], [64, 108, 0]],
  },
  espadas: {
    1: [[50, 75, 0]], 2: [[42, 75, -20], [58, 75, 20]], 3: [[38, 75, -20], [50, 75, 0], [62, 75, 20]],
    4: [[33, 46, -18], [67, 46, 18], [33, 104, 18], [67, 104, -18]],
    5: [[33, 44, -18], [67, 44, 18], [50, 75, 90], [33, 106, 18], [67, 106, -18]],
    6: [[30, 44, -12], [50, 44, 0], [70, 44, 12], [30, 106, 12], [50, 106, 0], [70, 106, -12]],
    7: [[30, 40, -12], [50, 40, 0], [70, 40, 12], [50, 75, 90], [30, 110, 12], [50, 110, 0], [70, 110, -12]],
  },
};
ACOMODO.copas = ACOMODO.oros;
ACOMODO.bastos = ACOMODO.espadas;

// Marco con "la pinta" (cortes que dicen el palo, como en la baraja real)
function marco(palo) {
  const cortes = { oros: [], copas: [50], espadas: [44, 56], bastos: [38, 50, 62] }[palo];
  let s = `<rect x="6" y="6" width="88" height="138" rx="4" fill="none" stroke="#2b4f86" stroke-width=".9"/>`;
  for (const cx of cortes) s += `<rect x="${cx - 3.5}" y="4" width="7" height="4" fill="#fff"/><rect x="${cx - 3.5}" y="142" width="7" height="4" fill="#fff"/>`;
  return s;
}

// ---------- Figuras: sota, caballo y rey ----------
const ROPA_FIG = {
  oros: ['#c0392b', '#2b5fa5', '#e6b422'], copas: ['#2b5fa5', '#c0392b', '#e6b422'],
  espadas: ['#c0392b', '#3a7a3a', '#2b5fa5'], bastos: ['#2b5fa5', '#c0392b', '#3a7a3a'],
};

function persona(c, { x = 50, y = 0, conCorona = false, sombrero = false, capa = false, piernas = true } = {}) {
  const [r1, r2, r3] = ROPA_FIG[c.palo];
  const piel = '#f3caa5';
  return `<g transform="translate(${x - 50} ${y})">
    ${capa ? `<path d="M34,52 C26,80 24,108 26,128 L74,128 C76,108 74,80 66,52Z" fill="${r2}" stroke="#1d1d1d" stroke-width=".6"/>
      <path d="M34,52 C30,80 30,108 32,128" stroke="#e6b422" stroke-width="1.6" fill="none"/>` : ''}
    ${piernas ? `<rect x="42" y="98" width="6.5" height="28" fill="${r3}" stroke="#1d1d1d" stroke-width=".5"/><rect x="51.5" y="98" width="6.5" height="28" fill="${r1}" stroke="#1d1d1d" stroke-width=".5"/>
      <path d="M40,126 h10 v3 h-12Z M50,126 h10 l2,3 h-12Z" fill="#3a2414"/>` : ''}
    <path d="M38,50 C36,62 36,80 38,100 L62,100 C64,80 64,62 62,50 C56,46 44,46 38,50Z" fill="${r1}" stroke="#1d1d1d" stroke-width=".6"/>
    <path d="M38,74 H62 M50,50 V100" stroke="${r3}" stroke-width="2.2"/>
    <path d="M38,98 H62" stroke="#e6b422" stroke-width="2"/>
    <path d="M40,50 C44,56 56,56 60,50 L58,47 C54,51 46,51 42,47Z" fill="#fff" stroke="#1d1d1d" stroke-width=".4"/>
    <rect x="46.5" y="40" width="7" height="8" fill="${piel}"/>
    <ellipse cx="50" cy="33" rx="8.5" ry="10" fill="${piel}" stroke="#7a4a2a" stroke-width=".5"/>
    <path d="M41.5,32 C41,20 59,20 58.5,32 C56,26 44,26 41.5,32Z" fill="#c9862e"/>
    <path d="M41.5,30 C40,40 42,46 44,48 M58.5,30 C60,40 58,46 56,48" stroke="#c9862e" stroke-width="2.4" fill="none"/>
    <circle cx="46.8" cy="33" r=".9" fill="#2a1a10"/><circle cx="53.2" cy="33" r=".9" fill="#2a1a10"/>
    <path d="M47.5,38.5 Q50,39.8 52.5,38.5" stroke="#9a3b2e" stroke-width=".8" fill="none"/>
    ${conCorona ? `<path d="M40,26 C40,30 60,30 60,26" fill="none"/>
      <path d="M41,26 L42,16 L46,22 L50,14 L54,22 L58,16 L59,26Z" fill="url(#g-oro-lin)" stroke="#7a4f00" stroke-width=".6"/>
      <circle cx="50" cy="19.5" r="1.3" fill="#c0392b"/>
      <path d="M41.5,36 C42,48 58,48 58.5,36 C56,44 44,44 41.5,36Z" fill="#e8e1d2"/>` : ''}
    ${sombrero ? `<path d="M37,26 C40,17 60,17 63,26 C56,23 44,23 37,26Z" fill="${r2}" stroke="#1d1d1d" stroke-width=".5"/>
      <path d="M58,20 C64,12 70,14 72,10" stroke="#e8e1d2" stroke-width="2.2" fill="none" stroke-linecap="round"/>` : ''}
  </g>`;
}

function figura(c) {
  const [r1, r2] = ROPA_FIG[c.palo];
  if (c.num === 10) {
    // Sota: paje de pie, con el símbolo en la mano
    return `${persona(c, { y: 10, sombrero: true })}
      <path d="M62,64 C68,66 70,70 70,74" stroke="${r1}" stroke-width="5" fill="none" stroke-linecap="round"/>
      ${c.palo === 'espadas' || c.palo === 'bastos'
        ? simbolo(c.palo, 70, 64, 1.55, c.palo === 'espadas' ? 0 : 8)
        : simbolo(c.palo, 71, 70, 1.05)}`;
  }
  if (c.num === 11) {
    // Caballo: jinete sobre su caballo
    return `
      <path d="M18,104 C16,92 22,84 32,82 L66,80 C72,72 74,62 82,58 C86,58 88,62 86,66 C84,74 80,80 78,88 C80,96 80,104 78,110
        L74,128 L69,128 L71,110 C64,112 52,112 42,110 L38,128 L33,128 L34,110 C26,110 22,108 18,104Z" fill="#f2efe8" stroke="#1d1d1d" stroke-width=".7"/>
      <path d="M78,60 C82,54 88,54 88,58" fill="#f2efe8" stroke="#1d1d1d" stroke-width=".6"/>
      <circle cx="82.5" cy="62" r=".9" fill="#1d1d1d"/>
      <path d="M66,80 C70,74 72,68 76,64" stroke="#c9862e" stroke-width="3" fill="none"/>
      <path d="M16,100 C10,104 10,114 14,118" stroke="#c9862e" stroke-width="3.5" fill="none" stroke-linecap="round"/>
      <path d="M32,84 C40,94 60,94 68,82 L64,100 C54,104 42,104 36,100Z" fill="${r2}" stroke="#1d1d1d" stroke-width=".5"/>
      <path d="M36,100 C44,104 56,104 64,100" stroke="#e6b422" stroke-width="1.6" fill="none"/>
      <g transform="translate(-6 -2) scale(.92)">${persona(c, { x: 56, y: 6, sombrero: true, piernas: false })}</g>
      <path d="M47,90 L45,108" stroke="${r1}" stroke-width="5" stroke-linecap="round"/>
      ${c.palo === 'espadas' || c.palo === 'bastos'
        ? simbolo(c.palo, 66, 38, 1.4, c.palo === 'espadas' ? 10 : 18)
        : simbolo(c.palo, 68, 50, 1)}`;
  }
  // Rey: con corona, capa y barba
  return `${persona(c, { y: 10, conCorona: true, capa: true })}
    <path d="M62,64 C68,64 70,68 70,72" stroke="${r1}" stroke-width="5" fill="none" stroke-linecap="round"/>
    ${c.palo === 'espadas' || c.palo === 'bastos'
      ? simbolo(c.palo, 71, 60, 1.55, c.palo === 'espadas' ? 0 : 8)
      : simbolo(c.palo, 71, 70, 1.05)}`;
}

function cartaSVG(c) {
  const col = COLOR_PALO[c.palo];
  let centro;
  if (c.num >= 10) centro = figura(c);
  else if (c.num === 1) {
    centro = simbolo(c.palo, 50, 75, c.palo === 'oros' || c.palo === 'copas' ? 3.1 : 3.4, c.palo === 'bastos' ? 16 : 0);
  } else {
    const redondo = c.palo === 'oros' || c.palo === 'copas';
    const escala = redondo ? (c.num >= 6 ? 1.12 : 1.3) : (c.num <= 3 ? 2.1 : 1.35);
    centro = ACOMODO[c.palo][c.num].map(([x, y, rot]) => simbolo(c.palo, x, y, escala, rot)).join('');
  }
  // índice en las esquinas: número grande + palo
  const esquina = `<rect x="7.5" y="7.5" width="${c.num >= 10 ? 22 : 18}" height="33" rx="3" fill="#fff"/>
    <text x="${c.num >= 10 ? 18.5 : 16.5}" y="24" font-size="18" font-weight="700" text-anchor="middle" fill="${col}" font-family="Georgia,'Times New Roman',serif" ${c.num >= 10 ? 'letter-spacing="-1.2"' : ''}>${c.num}</text>
    ${simbolo(c.palo, c.num >= 10 ? 18.5 : 16.5, 33, 0.45)}`;
  return `<svg viewBox="0 0 100 150" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x=".5" y=".5" width="99" height="149" rx="7" fill="url(#g-papel)" stroke="#c9c2b0" stroke-width="1"/>
    ${marco(c.palo)}${centro}${esquina}<g transform="rotate(180 50 75)">${esquina}</g></svg>`;
}

function nombreCarta(c) {
  const n = { 1: 'As', ...NOMBRE_FIG }[c.num] || c.num;
  return `${n} de ${c.palo}`;
}

// Las cartas son fotos de la baraja clásica (public/baraja/<palo>-<número>.jpg)
function cartaHTML(c, clase = '', attrs = '') {
  return `<div class="carta ${clase}" data-id="${c.id}" title="${nombreCarta(c)}" ${attrs}><img src="baraja/${c.id}.jpg" alt="${nombreCarta(c)}" draggable="false"></div>`;
}


const dorsoHTML = (clase = '') => `<div class="carta dorso ${clase}"></div>`;

// Mini retrato redondo (para tu placa)
function retratoHTML(id, foto) {
  if (foto) return `<img class="retrato" src="${foto}" alt="">`;
  return `<span class="retrato sin-foto">🙂</span>`;
}

// ---------- Monedas ----------
function monedasHTML(cantidad, max = 6) {
  const n = Math.max(cantidad > 0 ? 1 : 0, Math.min(max, Math.ceil(cantidad / 25)));
  return `<span class="torre">${'<i class="moneda"></i>'.repeat(n)}</span>`;
}

function boteHTML(cantidad) {
  const total = Math.min(30, Math.ceil(cantidad / 5));
  const torres = [];
  for (let i = 0; i < total; i += 6) torres.push(`<span class="torre">${'<i class="moneda"></i>'.repeat(Math.min(6, total - i))}</span>`);
  return `<div class="monedas-bote">${torres.join('')}</div>`;
}

// Misma regla que el servidor, para iluminar las jugadas posibles
const NUMS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];
function tipoJugada(cartas) {
  if (cartas.length < 3) return null;
  if (new Set(cartas.map((c) => c.id)).size !== cartas.length) return null;
  if (cartas.every((c) => c.num === cartas[0].num)) {
    return cartas.length <= 4 && new Set(cartas.map((c) => c.palo)).size === cartas.length ? 'tercia' : null;
  }
  if (cartas.every((c) => c.palo === cartas[0].palo)) {
    const p = cartas.map((c) => NUMS.indexOf(c.num)).sort((a, b) => a - b);
    for (let i = 1; i < p.length; i++) if (p[i] !== p[i - 1] + 1) return null;
    return 'corrida';
  }
  return null;
}

// Precarga para que no parpadeen al repartir
(function precargar() {
  for (const p of ['oros', 'copas', 'espadas', 'bastos']) for (const n of NUMS) { const i = new Image(); i.src = `baraja/${p}-${n}.jpg`; }
})();
