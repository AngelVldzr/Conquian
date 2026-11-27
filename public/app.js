// =============================================================
//  Cliente: dibuja la mesa desde tu punto de vista y manda
//  tus jugadas al servidor. El servidor decide si son válidas.
// =============================================================
const $ = (s) => document.querySelector(s);

// ---------- Métricas anónimas ----------
// Un id de visitante al azar (NO es tu llave ni dice quién eres) para contar visitas y si la gente regresa.
// Si el navegador tiene activado "No rastrear" / "Global Privacy Control", no se manda nada.
const sinRastreo = navigator.globalPrivacyControl === true || navigator.doNotTrack === '1';
function datosVisitante() {
  const leer = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };
  let v = leer('conquian-visitante');
  if (!v || !/^[A-Za-z0-9_-]{16,64}$/.test(v)) {
    const b = new Uint8Array(16); crypto.getRandomValues(b);
    v = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    guardar('conquian-visitante', v);
  }
  // ¿Cuántos días han pasado desde su primera visita? (solo se avisa 1 vez por día)
  const hoy = new Date().toLocaleDateString('en-CA');            // AAAA-MM-DD
  const primera = leer('conquian-primera') || hoy;
  const ultima = leer('conquian-ultima');
  guardar('conquian-primera', primera);
  guardar('conquian-ultima', hoy);
  const dias = Math.round((new Date(hoy) - new Date(primera)) / 86400000);
  return { v, regreso: ultima && ultima !== hoy && dias >= 1 ? dias : null };
}
const visitante = sinRastreo ? { v: null, regreso: null } : datosVisitante();
let primeraConexion = true;
const socket = io({
  auth: (cb) => {
    cb({
      v: visitante.v,
      nt: sinRastreo,
      nueva: primeraConexion,          // al reconectar no cuenta como visita nueva
      regreso: visitante.regreso,
      inv: new URLSearchParams(location.search).has('sala'),
      pantalla: window.matchMedia('(min-aspect-ratio: 1/1)').matches ? 'pc' : 'celular',
    });
    primeraConexion = false;
  },
});
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Tu LLAVE secreta: solo la tiene este navegador y sirve para recuperar tu lugar en la mesa.
// Nunca se le muestra a los demás (ellos ven otro id público).
function nuevaLlave() {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[x & 63]).join('');
}
let miLlave = null;
try { miLlave = localStorage.getItem('conquian-llave'); } catch { /* sin almacenamiento */ }
if (!miLlave || !/^[A-Za-z0-9_-]{16,64}$/.test(miLlave)) {
  miLlave = nuevaLlave();
  try { localStorage.setItem('conquian-llave', miLlave); localStorage.removeItem('conquian-id'); } catch { /* se usa solo esta vez */ }
}

let estado = null;
let seleccion = [];             // 1 carta elegida para dar (cambio) o para tirar
let bandeja = [];               // cartas de tu mano que pusiste en la bandeja
let deMesa = [];                // RECORTE: cartas que tomaste de tus jugadas [{jugada, cartaId}]
let contextoAntes = null;      // turno/fase de antes (para saber de dónde viene una carta)
let boteMostrado = null;        // el montón se llena cuando llegan las monedas
let ultimaBajadaVista = 0;      // para animar al rival que baja cartas
const bajandoHasta = {};        // id -> hasta cuándo se le ve bajando la mano
let conArriba = false;          // ¿la carta volteada está en tu bandeja?
let regresando = new Set();     // cartas que vuelven a tu mano (animación)
let escenarioPintado = null;
let fondoLocal = null;
let escenariosExtra = {};
let fotos = {};                 // id -> selfie (data URL)
let miFoto = localStorage.getItem('conquian-foto') || null;
let ordenMano = [];             // el orden en que TÚ acomodas tus cartas
let modoOrden = 'palo';           // lo que hará el siguiente toque del botón: 'palo' o 'jugadas'
let arrastre = null;
let suprimirClick = false;

// ---------------- Inicio ----------------
const params = new URLSearchParams(location.search);
$('#codigo').value = params.get('sala') || '';
$('#nombre').value = localStorage.getItem('conquian-nombre') || '';
pintarEscenario('cantina');
mostrarMiFoto();

// ---------------- Selfie ----------------
// Recorta la foto al centro, la achica y la vuelve un jpg ligero (~10 KB)
function procesarFoto(archivo) {
  return new Promise((ok, falla) => {
    const img = new Image();
    img.onload = () => {
      const W = 176, H = 216;
      const lienzo = document.createElement('canvas');
      lienzo.width = W; lienzo.height = H;
      const g = lienzo.getContext('2d');
      let cw, ch;
      if (img.width / img.height > W / H) { ch = img.height; cw = ch * W / H; } else { cw = img.width; ch = cw * H / W; }
      // Zoom a la cara (en una selfie la cara ocupa el centro): así encaja en la cara del jugador de la foto
      cw *= 0.62; ch *= 0.62;
      const sx = (img.width - cw) / 2;
      const sy = Math.max(0, (img.height - ch) * 0.4); // la cara suele estar arriba del centro
      g.drawImage(img, sx, sy, cw, ch, 0, 0, W, H);
      URL.revokeObjectURL(img.src);
      ok(lienzo.toDataURL('image/jpeg', 0.78));
    };
    img.onerror = () => falla(new Error('No pude leer esa imagen'));
    img.src = URL.createObjectURL(archivo);
  });
}

function mostrarMiFoto() {
  $('#vista-foto').innerHTML = miFoto ? `<img src="${miFoto}" alt="">` : '🙂';
  $('#quitar-foto').classList.toggle('oculto', !miFoto);
}

async function cambiarFoto(ev) {
  const archivo = ev.target.files[0];
  ev.target.value = '';
  if (!archivo) return;
  try {
    miFoto = await procesarFoto(archivo);
    try { localStorage.setItem('conquian-foto', miFoto); } catch { /* sin espacio */ }
    mostrarMiFoto();
    if (estado) { socket.emit('foto', miFoto); toast('¡Listo! Ya tienes tu cara en la mesa', 'ok'); }
  } catch (err) { toast(err.message); }
}
$('#foto-camara').onchange = cambiarFoto;
$('#foto-archivo').onchange = cambiarFoto;
$('#foto-juego').onchange = cambiarFoto;
$('#quitar-foto').onclick = () => { miFoto = null; localStorage.removeItem('conquian-foto'); mostrarMiFoto(); };

// Créditos: cualquier cantidad (los botones son atajos)
function leerCreditos() {
  const n = Math.round(Number($('#creditos').value));
  return Number.isFinite(n) && n >= 10 ? Math.min(n, 100000) : 200;
}
document.querySelectorAll('[data-creditos]').forEach((b) => {
  b.onclick = () => {
    $('#creditos').value = b.dataset.creditos;
    document.querySelectorAll('[data-creditos]').forEach((x) => x.classList.toggle('activo', x === b));
  };
});
$('#creditos').oninput = () => document.querySelectorAll('[data-creditos]').forEach((x) => x.classList.toggle('activo', x.dataset.creditos === $('#creditos').value));

function leerNombre() {
  const n = $('#nombre').value.trim();
  if (!n) { toast('Escribe tu nombre'); $('#nombre').focus(); return null; }
  localStorage.setItem('conquian-nombre', n);
  return n;
}

$('#btn-crear').onclick = () => {
  const nombre = leerNombre();
  if (nombre) socket.emit('crearSala', { nombre, apuesta: Number($('#apuesta').value), subirConFiguras: $('#regla-figuras').checked,
    creditos: leerCreditos(), llave: miLlave, foto: miFoto }, entrar);
};
$('#btn-unirse').onclick = () => {
  const nombre = leerNombre();
  const codigo = $('#codigo').value.trim().toUpperCase();
  if (!nombre) return;
  if (codigo.length !== 5) return toast('El código tiene 5 letras');
  socket.emit('unirse', { codigo, nombre, creditos: leerCreditos(), llave: miLlave, foto: miFoto, porLink: params.get('sala') === codigo }, entrar);
};

function entrar(r) {
  if (!r || r.error) return toast(r ? r.error : 'Sin respuesta del servidor');
  sessionStorage.setItem('conquian-sala', r.codigo);
  history.replaceState(null, '', '?sala=' + r.codigo);
  $('#inicio').classList.add('oculto');
  $('#juego').classList.remove('oculto');
}

// Si se cae el internet o recargas, vuelves a tu lugar
socket.on('connect', () => {
  const codigo = sessionStorage.getItem('conquian-sala');
  const nombre = localStorage.getItem('conquian-nombre');
  if (codigo && nombre) {
    socket.emit('unirse', { codigo, nombre, llave: miLlave, foto: miFoto }, (r) => {
      if (r && !r.error) entrar(r);
      else sessionStorage.removeItem('conquian-sala');
    });
  }
});

socket.on('estado', (e) => {
  const antes = estado?.mano;
  const avisoAntes = estado?.sala.aviso;
  const dineroAntes = estado && { bote: estado.sala.bote, monedas: Object.fromEntries(estado.jugadores.map((j) => [j.id, j.monedas])) };
  const manoAntes = estado?.sala.numMano;
  contextoAntes = antes ? { turno: antes.turno, fase: antes.fase } : null;
  estado = e;
  if (dineroAntes) setTimeout(() => animarDinero(dineroAntes), 20);
  if (manoAntes !== undefined && e.sala.numMano !== manoAntes && e.mano) setTimeout(animarReparto, 40);
  if (e.sala.aviso && e.sala.aviso !== avisoAntes) toast(e.sala.aviso, 'ok');
  // ¿Alguien acaba de bajar cartas? -> se le ve bajando la mano a la mesa
  const ub = e.mano?.ultimaBajada;
  if (ub && ub.n !== ultimaBajadaVista) {
    if (antes && ub.quien !== e.yo) setTimeout(() => animarBajada(ub.quien), 30);
    ultimaBajadaVista = ub.n;
  }
  if (antes && e.mano && antes.fase === 'descartar' && antes.turno === e.yo && !(e.mano.turno === e.yo && e.mano.fase === 'descartar') && e.mano.fase !== 'fin') {
    const pago = e.mano.arriba?.desde === e.yo ? e.mano.arriba.carta : null;
    toast(`✅ Ya pagaste${pago ? ' con el ' + nombreCarta(pago) : ''}`, 'ok');
  }
  if (e.mano && e.mano.turno === e.yo && e.mano.fase !== 'fin' && !(antes && antes.turno === e.yo)) {
    try { navigator.vibrate?.(120); } catch { /* sin vibración */ }
  }
  if (antes && e.mano && e.mano.fase === 'descartar' && e.mano.turno === e.yo && antes.fase === 'decidir' && antes.turno !== e.yo) {
    toast('¡Te echaron una carta! Te toca pagar: tira una');
  }
  const m = e.mano;
  const cambioTurno = !m || !antes || antes.fase !== m.fase || antes.turno !== m.turno;
  if (cambioTurno) {
    seleccion = [];
    // Al cambiar de fase, lo que quedó en la bandeja regresa a tu mano
    if (!(m && m.turno === e.yo && antes?.turno === e.yo)) { bandeja = []; deMesa = []; }
    conArriba = Boolean(m && m.fase === 'decidir' && m.turno === e.yo);
  }
  // ya diste tu carta del cambio: se limpia lo que tenías tocado
  if (antes && m && m.fase === 'cambio' && m.miCambio && m.miCambio !== antes.miCambio) seleccion = [];
  const enMano = (id) => m?.miMano.some((c) => c.id === id);
  seleccion = seleccion.filter(enMano);
  bandeja = bandeja.filter(enMano);
  deMesa = deMesa.filter((d) => m?.jugadas.some((j) => j.id === d.jugada && j.duenio === e.yo && j.cartas.some((c) => c.id === d.cartaId)));
  if (!(m?.fase === 'decidir' && m.turno === e.yo)) conArriba = false;
  render();
});

socket.on('fotos', (f) => { fotos = f || {}; if (estado) render(); });

function accion(tipo, datos = {}, siFalla) {
  socket.emit('accion', { tipo, ...datos }, (r) => {
    if (r && r.error) { toast(r.error); if (siFalla) siFalla(r.error); }
  });
}

// ---------------- Escenarios ----------------
cargarEscenarios().then(() => { llenarSelector(); pintarEscenario(estado?.sala.escenario || 'taxis'); if (estado) render(); });

function llenarSelector() {
  $('#sel-escenario').innerHTML = Object.values(ESCENARIOS)
    .map((x) => `<option value="${esc(x.id)}">${esc(x.nombre)}</option>`).join('');
  if (estado) $('#sel-escenario').value = estado.sala.escenario;
}
$('#sel-escenario').onchange = (ev) => socket.emit('escenario', ev.target.value);

function escenarioActual() {
  return ESCENARIOS[estado?.sala.escenario] || ESCENARIOS.taxis || Object.values(ESCENARIOS)[0];
}

function pintarEscenario() {
  const e = escenarioActual();
  if (!e || escenarioPintado === e.id) return;
  escenarioPintado = e.id;
  const base = `escenarios/${e.id}/`;
  $('#plato').src = base + 'escena.jpg';
  $('#lados').style.backgroundImage = `url(${base}lados.jpg)`;
  const foto = $('#foto');
  foto.style.setProperty('--proporcion', `${e.ancho} / ${e.alto}`);
  foto.style.setProperty('--y-mesa', pctY(e, e.yMesa) + '%');
  foto.style.setProperty('--luz-cara', e.luzCara || 'none');
  // dónde va el montón de monedas del bote (a un lado, donde no estorbe)
  const [bx, by] = e.bote || [e.ancho * 0.86, e.alto * 0.84];
  foto.style.setProperty('--bote-x', pctX(e, bx) + '%');
  foto.style.setProperty('--bote-y', pctY(e, by) + '%');
  foto.dataset.mesa = e.mesa;
}

// ---------------- Ayudantes ----------------
const jugador = (id) => estado.jugadores.find((j) => j.id === id);
const nombre = (id) => (id === estado.yo ? 'ti' : jugador(id)?.nombre || '¿?');
const nombreProp = (id) => jugador(id)?.nombre || '¿?';
const infoMano = (id) => estado.mano?.jugadores.find((j) => j.id === id);
const cartaPorId = (id) => estado.mano?.miMano.find((c) => c.id === id);
const ORDEN_PALO = { oros: 0, copas: 1, espadas: 2, bastos: 3 };
const ORDEN_NUM = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

function siguienteActivo(id) {
  const lista = estado.mano.jugadores;
  let i = lista.findIndex((j) => j.id === id);
  for (let k = 0; k < lista.length; k++) {
    i = (i + 1) % lista.length;
    if (lista[i].activo) return lista[i].id;
  }
  return id;
}

// ¿Es mi turno y puedo armar jugadas?
function puedoArmar() {
  const m = estado?.mano;
  return Boolean(m && m.turno === estado.yo && ['voltear', 'decidir', 'descartar'].includes(m.fase) && infoMano(estado.yo)?.activo);
}

// Cartas que hay en la bandeja (incluida la volteada si la metiste)
function cartaDeMesa(d) {
  return estado.mano?.jugadas.find((j) => j.id === d.jugada)?.cartas.find((c) => c.id === d.cartaId);
}
function cartasBandeja() {
  const m = estado.mano;
  const deMano = bandeja.map(cartaPorId).filter(Boolean);
  const recorte = deMesa.map(cartaDeMesa).filter(Boolean);
  return [...(conArriba && m?.arriba ? [m.arriba.carta] : []), ...deMano, ...recorte];
}
// ¿Lo que queda en tus jugadas después del recorte sigue siendo válido?
function recorteValido() {
  const porJugada = {};
  for (const d of deMesa) (porJugada[d.jugada] ||= []).push(d.cartaId);
  return Object.entries(porJugada).every(([jid, ids]) => {
    const resto = estado.mano.jugadas.find((j) => String(j.id) === jid).cartas.filter((c) => !ids.includes(c.id));
    return resto.length === 0 || tipoJugada(resto);
  });
}

// Manda lo que hay en la bandeja: jugada nueva o acomodarla en una jugada
function bajarBandeja(destino = 'nueva') {
  const cartas = cartasBandeja();
  const m = estado.mano;
  if (destino === 'nueva') {
    if (cartas.length < 3 || !tipoJugada(cartas)) return regresarAMano('Eso no es tercia ni corrida: tus cartas regresan a tu mano');
  } else {
    const jg = m.jugadas.find((j) => String(j.id) === String(destino));
    if (!jg || tipoJugada([...jg.cartas, ...cartas]) !== jg.tipo) return regresarAMano('No se acomoda ahí: tus cartas regresan a tu mano');
  }
  if (deMesa.length && !recorteValido()) return regresarAMano('Ese recorte deja una jugada tuya con menos de 3 cartas');
  const datos = { manoIds: [...bandeja], destino, deJugadas: [...deMesa] };
  const falla = () => regresarAMano();
  if (conArriba) accion('usar', datos, falla);
  else if (!bandeja.length) return regresarAMano('Para recortar sin la carta que salió necesitas poner cartas de tu mano');
  else accion('bajar', datos, falla);
}

// ECHAR: la carta que salió va a la jugada de otro y él tiene que pagar
// La carta que se puede echar: la que salió (al decidir) o la que elegiste para pagar
function cartaParaEchar() {
  const m = estado.mano;
  if (!m || m.turno !== estado.yo) return null;
  if (m.fase === 'decidir' && m.arriba && !bandeja.length && !deMesa.length) return m.arriba.carta;
  if (m.fase === 'descartar' && seleccion.length === 1) return cartaPorId(seleccion[0]);
  return null;
}
const puedoEchar = () => Boolean(cartaParaEchar());
const entra = (jg, c) => c && tipoJugada([...jg.cartas, c]) === jg.tipo;

function echarA(jugadaId) {
  const m = estado.mano;
  const c = cartaParaEchar();
  const jg = m.jugadas.find((j) => String(j.id) === String(jugadaId));
  if (!jg || !entra(jg, c)) return toast('Esa carta no entra en esa jugada');
  if (m.fase === 'descartar') accion('descartar', { cartaId: c.id, destino: jg.id });
  else accion('usar', { manoIds: [], destino: jg.id });
}

function regresarAMano(mensaje) {
  if (mensaje) toast(mensaje);
  regresando = new Set(bandeja);
  bandeja = [];
  deMesa = [];
  if (estado.mano?.fase === 'decidir') conArriba = false;
  render();
  setTimeout(() => { regresando = new Set(); }, 700);
}

// ---------------- Dibujo ----------------
function render() {
  if (!estado) return;
  const antesCartas = capturarCartas();
  pintarEscenario();
  if ($('#sel-escenario').value !== estado.sala.escenario) $('#sel-escenario').value = estado.sala.escenario;
  const host = estado.sala.hostId === estado.yo;
  $('#btn-codigo').textContent = `🔗 ${estado.sala.codigo}`;
  $('#btn-anular').classList.toggle('oculto', !(host && estado.mano && estado.mano.fase !== 'fin' && !estado.sala.final));
  $('#btn-finalizar').classList.toggle('oculto', !host || Boolean(estado.sala.final));
  renderRivales();
  renderCentro();
  renderMiMano();
  renderBandeja();
  renderAcciones();
  renderResultado();
  renderVotacion();
  renderCuentas();
  renderBote();
  renderAvisoTurno();
  volarCartas(antesCartas);
  $('#log').innerHTML = (estado.mano?.log || []).map((t) => `<li>${esc(t)}</li>`).join('');
}

// Los rivales son los jugadores de la foto; si tu amigo subió selfie, su cara va encima.
function renderRivales() {
  const e = escenarioActual();
  if (!e) return;
  const ids = estado.jugadores.map((j) => j.id);
  const i = ids.indexOf(estado.yo);
  const m = estado.mano;
  // el que espera los descartes (4º jugador) no se sienta todavía
  const otros = [...ids.slice(i + 1), ...ids.slice(0, i)].filter((id) => !(m && infoMano(id)?.esperando));
  // tu derecha = el siguiente en turno = el de la derecha de la foto
  const lugares = { 0: [], 1: ['der'], 2: ['der', 'izq'], 3: ['der', 'centro', 'izq'] }[Math.min(otros.length, 3)];
  const [J0, J1] = e.jugadores;
  const sitio = {
    izq: { ...J0, img: 0 },
    der: { ...J1, img: 1 },
    // tercer rival: un poco más atrás, entre los dos
    centro: { ...J0, img: 0, atras: true },
  };
  const html = otros.map((id, k) => {
    const lugar = lugares[k];
    const s = sitio[lugar];
    const j = jugador(id);
    const info = infoMano(id);
    const turno = m && m.turno === id && m.fase !== 'fin';
    let caja = [...s.caja];
    let cara = [...s.cara];
    let estilo = '';
    if (s.atras) {
      // se escala y se centra; el cuerpo queda detrás de los otros dos
      const esc_ = 0.8, ancho = (caja[2] - caja[0]) * esc_, alto = (caja[3] - caja[1]) * esc_;
      const x0 = e.ancho / 2 - ancho / 2, y0 = e.yMesa + 30 - alto;
      // el cuerpo va en espejo, así que la cara también se refleja
      cara = [x0 + (caja[2] - (cara[0] + cara[2])) * esc_, y0 + (cara[1] - caja[1]) * esc_, cara[2] * esc_, cara[3] * esc_];
      caja = [x0, y0, x0 + ancho, y0 + alto];
      estilo = 'filter: brightness(.82)';
    }
    const pos = (b) => `left:${pctX(e, b[0])}%;top:${pctY(e, b[1])}%;width:${pctX(e, b[2] - b[0])}%;height:${pctY(e, b[3] - b[1])}%`;
    const posCara = `left:${pctX(e, cara[0])}%;top:${pctY(e, cara[1])}%;width:${pctX(e, cara[2])}%;height:${pctY(e, cara[3])}%`;
    let badge = '';
    if (m && !info) badge = 'Entra la próxima mano';
    else if (m?.fase === 'cambio' && info?.activo) badge = info.yaCambio ? 'Ya eligió' : 'Eligiendo…';
    const centroX = pctX(e, (caja[0] + caja[2]) / 2);
    // ¿Acaba de bajar cartas? Se le ve con la mano en la mesa (si el escenario trae esa foto) o inclinándose
    // Poses de foto: 'gana' cuando ganó la mano, 'baja' cuando acaba de bajar o echar cartas
    const bajando = (bajandoHasta[id] || 0) > Date.now();
    const ganando = estado.resultado?.tipo === 'gana' && estado.resultado.id === id && m?.fase === 'fin';
    const tipoPose = ganando ? 'gana' : bajando ? 'baja' : null;
    const pose = !s.atras && tipoPose ? e.jugadores[s.img].poses?.[tipoPose] : null;
    let cuerpo, caraUsar = posCara;
    if (pose) {
      // la foto de la pose cubre de arriba hasta la mesa (así no se ve el jugador quieto detrás)
      cuerpo = `<img class="pose-fondo" src="escenarios/${e.id}/${pose.fondo}" style="height:${pctY(e, pose.altoFondo)}%" alt="">
        <img class="cuerpo" src="escenarios/${e.id}/jugador${s.img}-${tipoPose}.png" style="${pos(pose.caja)}" alt="">`;
      const c = pose.cara;
      caraUsar = `left:${pctX(e, c[0])}%;top:${pctY(e, c[1])}%;width:${pctX(e, c[2])}%;height:${pctY(e, c[3])}%`;
    } else {
      cuerpo = `<img class="cuerpo" src="escenarios/${e.id}/jugador${s.img}.png" style="${pos(caja)};${estilo}${lugar === 'centro' ? ';transform:scaleX(-1)' : ''}" alt="">`;
    }
    const susJugadas = (m?.jugadas || []).filter((jg) => jg.duenio === id);
    const globo = (globos[id]?.hasta || 0) > Date.now();
    const globoCara = pose ? pose.cara : cara;
    return `<div class="asiento ${lugar} ${turno ? 'turno' : ''} ${tipoPose ? (pose ? 'con-pose' : tipoPose === 'baja' ? 'bajando' : '') : ''}" data-id="${id}">
      ${cuerpo}
      ${fotos[id] ? `<div class="cara" style="${caraUsar}"><img src="${fotos[id]}" alt=""></div>` : ''}
      <div class="info-rival ${lugar}" style="left:${centroX}%;top:${s.atras ? pctY(e, caja[1]) + '%' : 'calc(var(--y-mesa) - 1%)'}">
        ${susJugadas.length ? `<div class="zona-jugadas">${susJugadas.map(jugadaHTML).join('')}</div>` : ''}
        <div class="placa">
          <span class="nom">${esc(j.nombre)}</span><span class="mon">${monedasHTML(j.monedas, 3)}${j.monedas}</span><span>🂠 ${info ? info.cartas : 0}</span>${info?.activo ? marcadorHTML(id, true) : ''}
          ${badge ? `<span class="badge">${badge}</span>` : ''}${!j.conectado ? '<span class="badge rojo">Sin conexión</span>' : ''}
        </div>
      </div>
      ${globo ? `<div class="burbuja" style="left:${pctX(e, globoCara[0] + globoCara[2] / 2)}%;top:${pctY(e, globoCara[1] - 6)}%"></div>` : ''}
    </div>`;
  });
  // asiento sin jugador: se queda el de la foto como "mirón"
  const vacio = otros.length === 1 ? `<div class="miron" style="left:${pctX(e, (J0.caja[0] + J0.caja[2]) / 2)}%;top:calc(var(--y-mesa) - 1%)">👀 Mirón</div>` : '';
  $('#asientos').innerHTML = vacio + html.join('');
  // el texto de los globitos se pone como texto (nunca como HTML)
  document.querySelectorAll('#asientos .asiento').forEach((a) => {
    const b = a.querySelector('.burbuja');
    if (!b) return;
    b.textContent = globos[a.dataset.id]?.texto || '';
    // que no se salga de la foto por los lados
    // (con medidas de diseño, sin la animación de entrada)
    const ancho = a.offsetWidth, izq = b.offsetLeft - b.offsetWidth / 2, der = izq + b.offsetWidth;
    const mover = Math.max(0, 4 - izq) - Math.max(0, der - (ancho - 4));
    if (mover) {
      b.style.marginLeft = mover + 'px';
      b.style.setProperty('--cola', `calc(50% - ${mover}px)`);
    }
  });
  $('#asientos').classList.toggle('con-miron', otros.length === 1);
  $('#asientos').classList.toggle('tres', otros.length >= 3);
  // el 4º jugador esperando
  const esp = m?.esperando;
  $('#esperando').innerHTML = esp ? `⏳ <b>${esc(nombreProp(esp))}</b> espera descartes: ${8 - m.faltanParaEntrar}/8` : '';
}

function renderCentro() {
  const m = estado.mano;
  if (!m) {
    const faltan = estado.jugadores.length < 2;
    $('#sobre-mesa').innerHTML = `<div class="espera-sala">
      <div>Código de la mesa</div><div class="codigo">${estado.sala.codigo}</div>
      <div>${estado.jugadores.length}/4 sentados · apuesta ${estado.sala.apuesta} por mano</div>
      ${faltan ? '<div style="opacity:.8;margin-top:6px">Mándale el link a tus amigos con el botón "invitar"</div>' : ''}
    </div>`;
    return;
  }
  const yoDecido = m.fase === 'decidir' && m.turno === estado.yo;
  const puedoVoltear = m.fase === 'voltear' && m.turno === estado.yo;
  const enBandeja = cartasBandeja();

  const colMazo = `<div class="fila">
    <div class="col"><div class="pila ${puedoVoltear ? 'brilla' : ''}" id="mazo">
      ${m.mazo > 0 ? dorsoHTML('med') : '<div class="hueco">Sin cartas</div>'}<span class="cuenta">${m.mazo}</span></div>
      <div class="etq">Mazo</div></div>
    ${m.arriba ? `<div class="col" id="zona-arriba">${yoDecido && conArriba ? '<div class="hueco">En tu bandeja</div>'
        : cartaHTML(m.arriba.carta, 'med' + (yoDecido ? ' tomable' : ''), 'id="carta-arriba"')}
      <div class="etq">${m.arriba.origen === 'mazo' ? 'Volteó' : 'Tiró'} ${esc(nombre(m.arriba.desde))}<br>Decide: <b>${esc(nombre(m.turno))}</b></div></div>` : ''}
  </div>`;

  // En la mesa solo van TUS jugadas; las de cada rival van arriba de su nombre
  const mias = m.jugadas.filter((jg) => jg.duenio === estado.yo);
  const jugadas = mias.length ? `<div class="tit-jugadas">Tus jugadas</div>${mias.map(jugadaHTML).join('')}` : '';

  const puedoTirar = m.fase === 'descartar' && m.turno === estado.yo;
  const colDesc = `<div class="fila">
    <div class="col"><div class="pila ${puedoTirar ? 'destino' : ''}" id="pila-descartes">${m.ultimoDescarte ? cartaHTML(m.ultimoDescarte, 'med') : '<div class="hueco">Descartes</div>'}<span class="cuenta">${m.descartes}</span></div>
      ${m.esperando ? `<div class="meta4">${esc(nombreProp(m.esperando))}: ${8 - m.faltanParaEntrar}/8</div>` : '<div class="etq">Descartes</div>'}</div>
  </div>`;

  $('#sobre-mesa').innerHTML = `<div class="zona-mazo">${colMazo}</div><div id="jugadas" class="${mias.length ? 'con-jugadas' : ''}">${jugadas}</div><div class="zona-desc">${colDesc}</div>`;
}

// Pistas doradas: cartas de tu mano que pueden formar o completar una jugada
function cartasSugeridas(mano) {
  const m = estado.mano;
  const s = new Set();
  if (!puedoArmar()) return s;
  const n = mano.length;
  // Dorado = cartas de tu mano que hacen jugada CON la carta que salió (y lo que ya pusiste en la bandeja)
  if (m.fase === 'decidir' && m.arriba && conArriba) {
    const ya = cartasBandeja();
    for (let i = 0; i < n; i++) {
      if (bandeja.includes(mano[i].id)) continue;
      if (ya.length >= 2 && tipoJugada([...ya, mano[i]])) s.add(mano[i].id);
      for (let k = i + 1; k < n; k++) {
        if (bandeja.includes(mano[k].id)) continue;
        if (tipoJugada([...ya, mano[i], mano[k]])) { s.add(mano[i].id); s.add(mano[k].id); }
      }
    }
  }
  return s;
}

// Al pagar: cartas de tu mano que le entran a la jugada de otro (puedes pagar echándosela)
function cartasEchables(mano) {
  const m = estado.mano;
  const s = new Set();
  if (!(m?.fase === 'descartar' && m.turno === estado.yo)) return s;
  for (const c of mano) if (m.jugadas.some((j) => j.duenio !== estado.yo && entra(j, c))) s.add(c.id);
  return s;
}

function renderMiMano() {
  const m = estado.mano;
  const mano = manoOrdenada().filter((c) => !bandeja.includes(c.id));
  const n = mano.length;
  const paso = Math.min(9, 64 / Math.max(n - 1, 1)); // ángulo entre cartas
  const tocable = Boolean(m && (m.fase === 'cambio' ? infoMano(estado.yo)?.activo : puedoArmar()));
  $('#mi-zona').classList.toggle('sin-cartas', n === 0);
  const sugeridas = cartasSugeridas(manoOrdenada());
  const echables = cartasEchables(manoOrdenada());
  const paraQuien = m?.fase === 'cambio' && m.miCambio ? nombreProp(siguienteActivo(estado.yo)) : '';
  $('#abanico').innerHTML = mano.map((c, i) => {
    const angulo = (i - (n - 1) / 2) * paso;
    const sel = seleccion.includes(c.id) || (m.fase === 'cambio' && m.miCambio === c.id && !seleccion.length);
    const style = `transform: rotate(${angulo}deg) translateY(${sel ? '-22%' : '0'}); z-index:${i}`;
    const elegida = m.fase === 'cambio' && m.miCambio === c.id;
    const clases = [sel && 'sel', elegida && 'elegida', !sel && sugeridas.has(c.id) && 'sugerida', !sel && echables.has(c.id) && 'echable-mano',
      arrastre?.activo && arrastre.id === c.id && 'en-mano', regresando.has(c.id) && 'regresa'].filter(Boolean).join(' ');
    return cartaHTML(c, clases, `style="${style}" ${tocable ? '' : 'aria-disabled="true"'} ${elegida ? `data-para="Para ${esc(paraQuien)}"` : ''}`);
  }).join('');

  const yo = jugador(estado.yo);
  const turno = m && m.turno === estado.yo && m.fase !== 'fin';
  $('#mi-placa').className = turno ? 'turno' : '';
  $('#mi-placa').innerHTML = `<div class="yo">${retratoHTML(estado.yo, fotos[estado.yo])}<div>
      <span class="nom">${esc(yo?.nombre || '')}</span>
      <span class="mon">${monedasHTML(yo?.monedas || 0, 4)} ${yo?.monedas ?? 0}</span></div></div>
    ${m && infoMano(estado.yo)?.activo ? marcadorHTML(estado.yo) + marcadorHTML(estado.yo, true) : ''}
`;
  const bo = $('#btn-ordenar');
  bo.classList.toggle('oculto', n < 2);
  bo.innerHTML = modoOrden === 'palo' ? '🃏 Ordenar<br><small>por palo</small>' : '✨ Ordenar<br><small>por jugadas</small>';
}

function renderBandeja() {
  const caja = $('#bandeja');
  const m = estado.mano;
  if (!puedoArmar()) { caja.classList.add('oculto'); return; }
  caja.classList.remove('oculto');
  const cartas = cartasBandeja();
  const tipo = cartas.length >= 3 ? tipoJugada(cartas) : null;
  let info = 'Toca cartas de tu mano (o de tus jugadas para un RECORTE)';
  const hayDestino = m.jugadas.some((j) => j.duenio === estado.yo && cartas.length && tipoJugada([...j.cartas, ...cartas]) === j.tipo);
  if (cartas.length === 1 || cartas.length === 2) info = `Faltan ${3 - cartas.length} carta${cartas.length === 2 ? '' : 's'}${hayDestino ? ' (o toca tu jugada que brilla para acomodarla)' : ''}`;
  if (cartas.length >= 3) info = tipo ? `✅ ¡Es ${tipo === 'tercia' ? 'una tercia' : 'una corrida'}!` : '❌ No es tercia ni corrida';
  if (deMesa.length) info = (recorteValido() ? '✂️ Recorte · ' : '❌ Ese recorte deja una jugada incompleta · ') + info;
  const htmlCartas = [
    conArriba && m.arriba ? cartaHTML(m.arriba.carta, 'med de-bandeja volteada', 'data-arriba="1"') : '',
    ...bandeja.map(cartaPorId).filter(Boolean).map((c) => cartaHTML(c, 'med de-bandeja')),
    ...deMesa.map((d) => [d, cartaDeMesa(d)]).filter(([, c]) => c).map(([d, c]) => cartaHTML(c, 'med de-bandeja de-mesa', `data-jugada-origen="${d.jugada}"`)),
  ].join('');
  caja.classList.toggle('lista', Boolean(tipo));
  caja.innerHTML = `<div class="bandeja-cartas">${htmlCartas || '<span class="bandeja-vacia">🃏 Bandeja de jugadas</span>'}</div>
    <div class="bandeja-pie"><span>${info}</span>
    ${cartas.length ? boton('Bajar jugada', 'bajar-bandeja', cartas.length >= 3, tipo ? 'verde chico' : 'chico') : ''}</div>`;
}

function boton(texto, tipo, activo = true, clase = '') {
  return `<button class="btn ${clase}" data-accion="${tipo}" ${activo ? '' : 'disabled'}>${texto}</button>`;
}

function renderAcciones() {
  const m = estado.mano;
  const host = estado.sala.hostId === estado.yo;
  const yoEnMano = m && infoMano(estado.yo);
  let txt = '';
  let btns = '';

  if (!m) {
    if (estado.jugadores.length < 2) txt = 'Esperando a tus amigos… comparte el código de la mesa';
    else if (host) { txt = `¡Ya son ${estado.jugadores.length}! Reparte cuando estén listos`; btns = boton('Repartir 🃏', 'repartir', true, 'oro'); }
    else txt = 'Esperando a que el anfitrión reparta';
  } else if (m.fase === 'fin') {
    txt = '';
  } else if (!yoEnMano) {
    txt = 'Entras en la siguiente mano. Mientras, mira cómo juegan 👀';
  } else if (m.esperando === estado.yo) {
    txt = `Estás esperando: entras cuando se junten 8 descartes (${8 - m.faltanParaEntrar}/8)`;
  } else if (m.fase === 'cambio') {
    const der = nombreProp(siguienteActivo(estado.yo));
    if (m.miCambio && seleccion.length === 0) {
      const c = cartaPorId(m.miCambio);
      const listos = m.jugadores.filter((j) => j.activo && j.yaCambio).length;
      const total = m.jugadores.filter((j) => j.activo).length;
      txt = `<span class="listo">✅ Ya elegiste: <b>${c ? nombreCarta(c) : 'tu carta'}</b> para ${esc(der)}</span><br>Esperando a los demás (${listos}/${total} listos). Si quieres cambiarla, toca otra.`;
      if (seleccion.length === 1) btns = boton('Dar esta otra', 'cambio', true, 'oro');
    } else {
      txt = `Toca 1 carta para darle a <b>${esc(der)}</b> (tu derecha)`;
      btns = boton('Dar carta', 'cambio', seleccion.length === 1, 'oro');
    }
  } else if (m.turno !== estado.yo) {
    const que = { voltear: 'va a voltear del mazo', decidir: 'decide si usa la carta', descartar: 'va a tirar una carta' }[m.fase];
    txt = `${esc(nombreProp(m.turno))} ${que}…`;
  } else if (m.fase === 'voltear') {
    txt = '¡Te toca! Voltea una carta del mazo.';
    btns = boton('Voltear carta', 'voltear', true, 'oro');
  } else if (m.fase === 'decidir') {
    const hayEchar = m.jugadas.some((j) => j.duenio !== estado.yo && tipoJugada([...j.cartas, m.arriba.carta]) === j.tipo);
    txt = `Salió el <b>${nombreCarta(m.arriba.carta)}</b>. Está en tu bandeja: agrégale cartas de tu mano (las doradas) o de tus jugadas para un <b>recorte</b>${hayEchar ? ', o 🎯 <b>échasela</b> a otro tocando su jugada para que él pague' : ''}. Si no, pasa.`;
    btns = boton('Pasar', 'pasar');
  } else if (m.fase === 'descartar') {
    const hayEchable = cartasEchables(m.miMano).size > 0;
    txt = `Te toca <b>pagar</b>: toca una carta y presiona <b>Tirar</b>, o arrástrala a los descartes.${hayEchable ? ' Las cartas naranjas le entran a otro: tócala y luego toca su jugada 🎯 para <b>pagar echándosela</b>.' : ''}`;
    btns = boton('Tirar carta', 'descartar', seleccion.length === 1, 'oro');
  }
  // ¿Ya traes una jugada completa en la mano? Botón para bajarla de una vez
  const lista = puedoArmar() ? jugadaEnMano() : null;
  if (lista) {
    const gana = lista.ganas;
    btns = boton(`${gana ? '🏆 Bajar y ganar' : '⬇️ Bajar mi ' + lista.tipo}: ${lista.texto}`, 'bajar-mano', true, gana ? 'oro gana' : 'verde') + btns;
    if (gana) txt = '¡Ya tienes tus 9! Baja tu jugada y ganas <b>sin pagar</b>.';
  }
  $('#instruccion').innerHTML = txt;
  $('#barra').innerHTML = btns;
}

function renderResultado() {
  const m = estado.mano;
  const r = estado.resultado;
  const caja = $('#resultado');
  if (!m || m.fase !== 'fin' || !r) { caja.classList.add('oculto'); return; }
  const host = estado.sala.hostId === estado.yo;
  let titulo = 'Empate';
  let texto = `Se acabó el mazo y nadie juntó sus 9 cartas. El bote de ${r.bote} se queda para la siguiente.`;
  if (r.tipo === 'gana') {
    titulo = r.id === estado.yo ? '¡Ganaste! 🎉' : `Ganó ${esc(nombreProp(r.id))}`;
    texto = `Se lleva el bote: ${r.monto} monedas`;
  }
  caja.innerHTML = `<h2>${titulo}</h2><div>${texto}</div>${boteHTML(r.monto || r.bote || 0)}
    ${host ? boton('Siguiente mano', 'repartir', true, 'oro') : '<div style="opacity:.8;margin-top:10px">Esperando al anfitrión…</div>'}`;
  caja.classList.remove('oculto');
}

// ---------------- Clics ----------------
document.addEventListener('click', (ev) => {
  if (suprimirClick) return;
  if (ev.target.closest('#btn-ordenar')) return ordenarConLaOtraMano();
  const btn = ev.target.closest('[data-accion]');
  if (btn && !btn.disabled) {
    const t = btn.dataset.accion;
    if (t === 'repartir') accion('repartir');
    if (t === 'voltear') accion('voltear');
    if (t === 'pasar') accion('pasar');
    if (t === 'cambio') accion('cambio', { cartaId: seleccion[0] });
    if (t === 'descartar') accion('descartar', { cartaId: seleccion[0] });
    if (t === 'bajar-bandeja') bajarBandeja('nueva');
    if (t === 'bajar-mano') {
      const j = jugadaEnMano();
      if (j) accion('bajar', { manoIds: j.ids, destino: j.destino });
    }
    return;
  }
  if (!estado?.mano) return;
  const m = estado.mano;

  if (ev.target.closest('#mazo') && m.fase === 'voltear' && m.turno === estado.yo) return accion('voltear');

  // Echar la carta que salió a la jugada de otro
  const echable = ev.target.closest('.jugada.echable');
  if (echable) return echarA(echable.dataset.jugada);

  // RECORTE: tocar una carta de TUS jugadas la pasa a la bandeja
  const deTuJugada = ev.target.closest('.jugada.recortable .carta[data-recorte]');
  if (deTuJugada && !ev.target.closest('.jugada.valida')) {
    const jid = Number(deTuJugada.closest('.jugada').dataset.jugada);
    deMesa = [...deMesa, { jugada: jid, cartaId: deTuJugada.dataset.id }];
    return render();
  }

  // Tocar una jugada tuya que brilla: acomodar ahí lo que hay en la bandeja
  const jg = ev.target.closest('.jugada.valida');
  if (jg) return bajarBandeja(jg.dataset.jugada);

  // Tocar la carta volteada: entra o sale de tu bandeja
  if (ev.target.closest('#carta-arriba') && m.fase === 'decidir' && m.turno === estado.yo) { conArriba = true; return render(); }

  // Tocar una carta de la bandeja: regresa a tu mano
  const enBandeja = ev.target.closest('#bandeja .carta');
  if (enBandeja) {
    if (enBandeja.dataset.arriba) conArriba = false;
    else if (enBandeja.dataset.jugadaOrigen) deMesa = deMesa.filter((d) => d.cartaId !== enBandeja.dataset.id);
    else bandeja = bandeja.filter((x) => x !== enBandeja.dataset.id);
    return render();
  }

  const carta = ev.target.closest('#abanico .carta');
  if (carta && carta.getAttribute('aria-disabled') !== 'true') {
    const id = carta.dataset.id;
    if (m.fase === 'cambio' || m.fase === 'descartar') seleccion = seleccion[0] === id ? [] : [id];
    else bandeja = [...bandeja, id]; // voltear o decidir: va a la bandeja
    render();
  }
});

$('#btn-finalizar').onclick = () => {
  const enJuego = estado.mano && estado.mano.fase !== 'fin';
  if (confirm(`¿Cerrar la mesa y hacer las cuentas?${enJuego ? ' La mano que va en juego se anula.' : ''} Ya no se podrá seguir jugando en esta mesa.`)) {
    $('#menu').open = false;
    accion('finalizar');
  }
};
$('#btn-anular').onclick = () => { if (confirm('¿Anular esta mano? Contará como empate.')) accion('anular'); };

$('#btn-codigo').onclick = async () => {
  const link = `${location.origin}/?sala=${estado.sala.codigo}`;
  const texto = `¡Vente a jugar Conquián! Mesa ${estado.sala.codigo}: ${link}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Conquián', text: texto, url: link });
      socket.emit('metrica', 'invitacion_enviada', { medio: 'compartir' });
    } else {
      await navigator.clipboard.writeText(texto);
      toast('Invitación copiada', 'ok');
      socket.emit('metrica', 'invitacion_enviada', { medio: 'copiar' });
    }
  } catch { /* cancelado */ }
};

let toastTimer;
function toast(texto, tipo) {
  const t = $('#toast');
  t.textContent = texto;
  t.style.background = tipo === 'ok' ? '#2a7a36' : '#c0392b';
  t.classList.add('ver');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('ver'), 2800);
}

// =============================================================
//  Tu otra mano: acomoda, arrastra y suelta cartas
// =============================================================
const ORDENES = {
  palo: (a, b) => ORDEN_PALO[a.palo] - ORDEN_PALO[b.palo] || ORDEN_NUM.indexOf(a.num) - ORDEN_NUM.indexOf(b.num),
  numero: (a, b) => ORDEN_NUM.indexOf(a.num) - ORDEN_NUM.indexOf(b.num) || ORDEN_PALO[a.palo] - ORDEN_PALO[b.palo],
};

function manoOrdenada() {
  const cartas = estado?.mano?.miMano || [];
  const ids = cartas.map((c) => c.id);
  ordenMano = ordenMano.filter((id) => ids.includes(id));
  if (!ordenMano.length) ordenMano = [...cartas].sort(ORDENES.palo).map((c) => c.id); // mano nueva: empieza ordenada
  for (const id of ids) if (!ordenMano.includes(id)) ordenMano.push(id); // las nuevas entran por la derecha
  return ordenMano.map((id) => cartas.find((c) => c.id === id));
}

// 1er toque: por palo (oros, copas, espadas, bastos; cada uno del 1 al 12)
// 2º toque: por posibles jugadas (primero las tercias/corridas completas, luego las que casi lo son)
function ordenarConLaOtraMano() {
  const cartas = [...estado.mano.miMano];
  ordenMano = (modoOrden === 'palo' ? cartas.sort(ORDENES.palo) : ordenPorJugadas(cartas)).map((c) => c.id);
  toast(modoOrden === 'palo' ? 'Ordenadas por palo' : 'Ordenadas por posibles jugadas', 'ok');
  modoOrden = modoOrden === 'palo' ? 'jugadas' : 'palo';
  renderMiMano();
}

function ordenPorJugadas(cartas) {
  let resto = [...cartas];
  const completas = [];
  // 1. jugadas completas, la más grande primero
  for (;;) {
    let mejor = null;
    const n = resto.length;
    const probar = (inicio, actual) => {
      if (actual.length >= 3 && tipoJugada(actual) && (!mejor || actual.length > mejor.length)) mejor = [...actual];
      for (let i = inicio; i < n; i++) { actual.push(resto[i]); probar(i + 1, actual); actual.pop(); }
    };
    probar(0, []);
    if (!mejor) break;
    completas.push(mejor.sort(tipoJugada(mejor) === 'corrida' ? ORDENES.palo : ORDENES.numero));
    resto = resto.filter((c) => !mejor.includes(c));
  }
  // 2. casi jugadas: dos seguidas del mismo palo, dos del mismo número, o del mismo palo con un hueco
  const casi = [];
  const pos = (c) => ORDEN_NUM.indexOf(c.num);
  for (const regla of [(a, b) => a.palo === b.palo && Math.abs(pos(a) - pos(b)) === 1, (a, b) => a.num === b.num,
    (a, b) => a.palo === b.palo && Math.abs(pos(a) - pos(b)) === 2]) {
    for (let i = 0; i < resto.length; i++) {
      for (let k = i + 1; k < resto.length; k++) {
        if (regla(resto[i], resto[k])) {
          casi.push([resto[i], resto[k]].sort(ORDENES.palo));
          resto = resto.filter((_, x) => x !== i && x !== k);
          i = -1;
          break;
        }
      }
    }
  }
  // 3. las sueltas, por palo
  return [...completas.flat(), ...casi.flat(), ...resto.sort(ORDENES.palo)];
}

// Se puede arrastrar: una carta de tu mano, o la carta volteada cuando te toca decidir
document.addEventListener('pointerdown', (ev) => {
  if (ev.button > 0 || !estado?.mano) return;
  const deMano = ev.target.closest('#abanico .carta');
  const volteada = ev.target.closest('#carta-arriba');
  const el = deMano || volteada;
  if (!el) return;
  arrastre = {
    id: el.dataset.id, desde: deMano ? 'mano' : 'arriba', x0: ev.clientX, y0: ev.clientY,
    activo: false, ancho: el.offsetWidth, origen: el.getBoundingClientRect(),
  };
});

document.addEventListener('pointermove', (ev) => {
  if (!arrastre) return;
  if (!arrastre.activo) {
    if (Math.hypot(ev.clientX - arrastre.x0, ev.clientY - arrastre.y0) < 10) return;
    const c = arrastre.desde === 'mano' ? cartaPorId(arrastre.id) : estado.mano.arriba?.carta;
    if (!c) { arrastre = null; return; }
    arrastre.activo = true;
    const clon = document.createElement('div');
    clon.innerHTML = cartaHTML(c, 'arrastrada');
    arrastre.clon = clon.firstElementChild;
    arrastre.clon.style.width = Math.max(arrastre.ancho, 56) + 'px';
    arrastre.ancho = Math.max(arrastre.ancho, 56);
    document.body.appendChild(arrastre.clon);
    document.body.classList.add('arrastrando');
    if (arrastre.desde === 'mano') document.body.classList.add('arrastra-mano');
    renderMiMano();
  }
  const { clon, ancho } = arrastre;
  clon.style.left = `${ev.clientX - ancho * 0.75}px`;
  clon.style.top = `${ev.clientY - ancho * 1.1}px`;
  marcarDestino(ev.clientX, ev.clientY);

  // Reordenar solo si la llevas por la zona de tu mano
  if (arrastre.desde !== 'mano') return;
  const zona = $('#mi-zona').getBoundingClientRect();
  if (ev.clientY < zona.top) return;
  const otras = [...document.querySelectorAll('#abanico .carta')].filter((el) => el.dataset.id !== arrastre.id);
  let idx = 0;
  for (const el of otras) {
    const r = el.getBoundingClientRect();
    if (ev.clientX > r.left + r.width / 2) idx++;
  }
  const sinEsta = ordenMano.filter((id) => id !== arrastre.id && !bandeja.includes(id));
  sinEsta.splice(idx, 0, arrastre.id);
  const nuevo = [...sinEsta, ...ordenMano.filter((id) => bandeja.includes(id))];
  if (nuevo.join() !== ordenMano.join()) { ordenMano = nuevo; renderMiMano(); }
});

// ¿Qué hay debajo del dedo? (la bandeja, una jugada o los descartes)
function destinoEn(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  if (el.closest('#bandeja')) return { tipo: 'bandeja' };
  const jg = el.closest('.jugada');
  if (jg) return { tipo: 'jugada', id: jg.dataset.jugada, el: jg };
  if (el.closest('#pila-descartes')) return { tipo: 'descartes' };
  return null;
}

function marcarDestino(x, y) {
  document.querySelectorAll('.sobre').forEach((e) => e.classList.remove('sobre'));
  const d = destinoEn(x, y);
  if (d?.tipo === 'bandeja') $('#bandeja').classList.add('sobre');
  if (d?.tipo === 'jugada') d.el.classList.add('sobre');
  if (d?.tipo === 'descartes') $('#pila-descartes').classList.add('sobre');
}

// La carta regresa volando a donde estaba
function regresarVolando(clon, origen) {
  const r = clon.getBoundingClientRect();
  const anim = clon.animate([
    { transform: 'rotate(-8deg) scale(1.06)', left: `${r.left}px`, top: `${r.top}px` },
    { transform: 'rotate(0) scale(1)', left: `${origen.left}px`, top: `${origen.top}px` },
  ], { duration: 320, easing: 'ease-in' });
  anim.onfinish = () => clon.remove();
}

function soltarEn(x, y) {
  const m = estado.mano;
  const d = destinoEn(x, y);
  const { id, desde } = arrastre;
  const miTurno = puedoArmar();

  if (desde === 'arriba') {
    if (!(m.fase === 'decidir' && m.turno === estado.yo)) return false;
    if (d?.tipo === 'bandeja') { conArriba = true; return true; }
    if (d?.tipo === 'jugada') {
      const jg = m.jugadas.find((j) => String(j.id) === d.id);
      if (jg && tipoJugada([...jg.cartas, m.arriba.carta]) === jg.tipo) { accion('usar', { manoIds: [], destino: d.id }); return true; }
      toast(jg && jg.duenio !== estado.yo ? 'Esa carta no le entra a su jugada' : 'No se acomoda ahí');
    }
    return false;
  }

  // desde tu mano
  if (d?.tipo === 'bandeja') {
    if (!miTurno) { toast('Espera tu turno para armar jugadas'); return false; }
    bandeja = [...bandeja, id];
    return true;
  }
  if (d?.tipo === 'jugada') {
    if (!miTurno) { toast('Espera tu turno'); return false; }
    const jg = m.jugadas.find((j) => String(j.id) === d.id);
    const c = cartaPorId(id);
    if (jg && jg.duenio !== estado.yo) {
      if (m.fase === 'descartar' && m.turno === estado.yo && entra(jg, c)) { accion('descartar', { cartaId: id, destino: jg.id }); return true; }
      toast(m.fase === 'descartar' ? 'Esa carta no le entra a su jugada' : 'Cartas de tu mano a jugadas de otros: solo cuando pagas');
      return false;
    }
    if (!jg || tipoJugada([...jg.cartas, c]) !== jg.tipo) { toast('Esa carta no se acomoda ahí'); return false; }
    accion('bajar', { manoIds: [id], destino: d.id });
    return true;
  }
  if (d?.tipo === 'descartes') {
    if (m.fase === 'descartar' && m.turno === estado.yo) { accion('descartar', { cartaId: id }); return true; }
    toast(m.turno === estado.yo ? 'Primero usa o pasa la carta' : 'Espera tu turno');
    return false;
  }
  return 'mano'; // la soltaste sobre tu mano: solo se reacomoda
}

function soltar(ev) {
  if (!arrastre) return;
  const fueArrastre = arrastre.activo;
  if (fueArrastre) {
    document.querySelectorAll('.sobre').forEach((e) => e.classList.remove('sobre'));
    document.body.classList.remove('arrastrando', 'arrastra-mano');
    const resultado = ev.type === 'pointerup' ? soltarEn(ev.clientX, ev.clientY) : false;
    if (resultado === false) regresarVolando(arrastre.clon, arrastre.origen);
    else arrastre.clon.remove();
    suprimirClick = true;
    setTimeout(() => { suprimirClick = false; }, 60);
  }
  arrastre = null;
  // Solo se redibuja si de verdad arrastraste. Si fue un simple toque, redibujar
  // aquí borraría la carta antes del clic y el toque se perdería.
  if (fueArrastre && estado?.mano) render();
}
document.addEventListener('pointerup', soltar);
document.addEventListener('pointercancel', soltar);

// =============================================================
//  Un rival baja cartas: se le ve con la mano en la mesa
// =============================================================
function animarBajada(quien) {
  bajandoHasta[quien] = Date.now() + 2600;
  if (estado) renderRivales();
  setTimeout(() => { if (estado) renderRivales(); }, 2700);
}

// =============================================================
//  Regla opcional: votación para subir la apuesta
// =============================================================
function renderVotacion() {
  const p = estado.sala.propuesta;
  const caja = $('#votacion');
  if (!p) { caja.classList.add('oculto'); return; }
  caja.classList.remove('oculto');
  const yaVote = p.votos[estado.yo] !== undefined;
  const puedo = p.votantes.includes(estado.yo);
  const faltan = p.votantes.filter((v) => p.votos[v] === undefined).map(nombreProp);
  caja.innerHTML = `<b>💰 ${esc(p.texto)}</b><div>¿Suben la apuesta ${p.monto} cada quien?</div>
    ${puedo && !yaVote ? `<div class="votos">${boton('Sí, subir', 'votar-si', true, 'verde chico')}${boton('No', 'votar-no', true, 'chico')}</div>`
      : `<div class="espera-votos">Esperando a: ${faltan.map(esc).join(', ') || '…'}</div>`}`;
}
document.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-accion="votar-si"], [data-accion="votar-no"]');
  if (b) accion('votar', { si: b.dataset.accion === 'votar-si' });
});

// =============================================================
//  ¿Traes una jugada completa en la mano? (la más grande que haya)
//  También: una carta que entra en tu jugada y con eso ya ganas.
// =============================================================
function jugadaEnMano() {
  const m = estado.mano;
  const mano = (m.miMano || []).filter((c) => !bandeja.includes(c.id));
  const n = mano.length;
  if (!n) return null;
  const enMesa = m.jugadas.reduce((t, j) => t + j.cartas.filter((c) => c.de === estado.yo).length, 0);
  // al pagar ya tienes 9 entre mano y mesa; antes de voltear o al decidir, 8
  const meta = 9;
  const describe = (cs) => cs.map((c) => (c.num > 7 ? { 10: 'Sota', 11: 'Caballo', 12: 'Rey' }[c.num] : c.num)).join('-') +
    (new Set(cs.map((c) => c.palo)).size === 1 ? ' de ' + cs[0].palo : '');
  let mejor = null;
  const probar = (cs) => {
    const tipo = tipoJugada(cs);
    if (tipo && (!mejor || cs.length > mejor.cartas.length)) mejor = { cartas: cs, tipo };
  };
  const combinar = (inicio, actual, k) => {
    if (actual.length === k) return probar([...actual]);
    for (let i = inicio; i < n; i++) { actual.push(mano[i]); combinar(i + 1, actual, k); actual.pop(); }
  };
  for (let k = Math.min(n, 7); k >= 3 && !mejor; k--) combinar(0, [], k);
  if (mejor) {
    const ganas = mejor.cartas.length === n && enMesa + n >= meta;
    return { ids: mejor.cartas.map((c) => c.id), tipo: mejor.tipo, texto: describe(mejor.cartas), destino: 'nueva', ganas };
  }
  // una sola carta que entra en tu jugada y con eso llegas a 9
  if (n === 1 && enMesa + 1 >= meta) {
    const j = m.jugadas.find((x) => x.duenio === estado.yo && tipoJugada([...x.cartas, mano[0]]) === x.tipo);
    if (j) return { ids: [mano[0].id], tipo: j.tipo, texto: describe([mano[0]]), destino: j.id, ganas: true };
  }
  return null;
}

// =============================================================
//  Mesa cerrada: las cuentas de quién le paga a quién
// =============================================================
const fmtPesos = (n) => (n < 0 ? '-$' : '$') + (Math.round(Math.abs(n) * 100) / 100).toLocaleString('es-MX', { minimumFractionDigits: n % 1 ? 2 : 0 });
const manosTxt = (n) => `${n} mano${n === 1 ? '' : 's'}`;

function textoCuentas(f) {
  const nom = (id) => f.resumen.find((r) => r.id === id)?.nombre || '¿?';
  const lineas = [`🃏 Conquián · mesa ${estado.sala.codigo} · ${manosTxt(f.manos)}`, ''];
  for (const r of f.resumen) lineas.push(`${r.nombre}: ${r.neto > 0 ? '+' : ''}${fmtPesos(r.neto)}`);
  lineas.push('');
  if (!f.pagos.length) lineas.push('Nadie le debe a nadie 🤝');
  for (const p of f.pagos) lineas.push(`➡️ ${nom(p.de)} le paga a ${nom(p.a)}: ${fmtPesos(p.monto)}`);
  return lineas.join('\n');
}

function renderCuentas() {
  const f = estado.sala.final;
  const caja = $('#cuentas');
  if (!f) { caja.classList.add('oculto'); return; }
  caja.classList.remove('oculto');
  $('#resultado').classList.add('oculto');
  const nom = (id) => esc(f.resumen.find((r) => r.id === id)?.nombre || '¿?');
  const filas = f.resumen.map((r) => `<tr class="${r.neto > 0 ? 'gano' : r.neto < 0 ? 'perdio' : ''}">
      <td>${esc(r.nombre)}${r.id === estado.yo ? ' (tú)' : ''}</td><td>${fmtPesos(r.inicial)}</td><td>${fmtPesos(r.final)}</td>
      <td class="neto">${r.neto > 0 ? '+' : ''}${fmtPesos(r.neto)}</td></tr>`).join('');
  const pagos = f.pagos.length
    ? f.pagos.map((p) => `<li class="${p.de === estado.yo || p.a === estado.yo ? 'mio' : ''}"><b>${nom(p.de)}</b> le paga a <b>${nom(p.a)}</b>
        <span class="monto">${fmtPesos(p.monto)}</span></li>`).join('')
    : '<li>Nadie le debe a nadie 🤝</li>';
  caja.innerHTML = `<h2>🏁 Mesa cerrada</h2>
    <div class="sub">${manosTxt(f.manos)} jugada${f.manos === 1 ? '' : 's'}</div>
    <table><thead><tr><th>Jugador</th><th>Entró</th><th>Salió</th><th>Resultado</th></tr></thead><tbody>${filas}</tbody></table>
    <h3>Quién le paga a quién</h3><ul class="pagos">${pagos}</ul>
    <p class="aviso-dinero">El juego no mueve dinero. Si acordaron pagarse, pónganse de acuerdo entre ustedes.</p>
    <div class="acciones">${boton('📋 Copiar / compartir cuentas', 'compartir-cuentas', true, 'oro')}${boton('Jugar otra mesa', 'nueva-mesa')}</div>`;
}

document.addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-accion="compartir-cuentas"], [data-accion="nueva-mesa"]');
  if (!b) return;
  if (b.dataset.accion === 'nueva-mesa') {
    sessionStorage.removeItem('conquian-sala');
    location.href = location.pathname;
    return;
  }
  const texto = textoCuentas(estado.sala.final);
  try {
    if (navigator.share) await navigator.share({ title: 'Cuentas del Conquián', text: texto });
    else { await navigator.clipboard.writeText(texto); toast('Cuentas copiadas: pégalas en WhatsApp', 'ok'); }
  } catch { /* cancelado */ }
});

// =============================================================
//  ANIMACIONES: cartas que vuelan y monedas que van y vienen
// =============================================================
const calmado = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function lugarDe(el) {
  if (el.closest('#abanico')) return 'mano';
  if (el.closest('#bandeja')) return 'bandeja';
  const j = el.closest('.jugada');
  if (j) return 'j' + j.dataset.jugada;
  if (el.closest('#pila-descartes')) return 'desc';
  if (el.id === 'carta-arriba') return 'arriba';
  return 'otro';
}

function capturarCartas() {
  const r = {};
  document.querySelectorAll('#sobre-mesa .carta[data-id], #asientos .carta[data-id], #abanico .carta[data-id], #bandeja .carta[data-id]').forEach((el) => {
    r[el.dataset.id] = { rect: el.getBoundingClientRect(), lugar: lugarDe(el) };
  });
  return r;
}

// Punto donde están las manos de un rival (de ahí salen sus cartas y su dinero)
function manosDe(id) {
  if (id === estado.yo) {
    const r = $('#mi-zona').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height * 0.55 };
  }
  const cuerpo = document.querySelector(`.asiento[data-id="${id}"] .cuerpo`);
  if (!cuerpo) {
    const r = ($('#esperando').textContent ? $('#esperando') : $('#instruccion')).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  const r = cuerpo.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height * 0.84 };
}

function rectMazo() {
  const el = document.querySelector('#mazo .carta, #mazo .hueco');
  return el ? el.getBoundingClientRect() : null;
}

// ¿De dónde salió una carta que acaba de aparecer en la mesa?
function origenCarta(id) {
  const m = estado.mano;
  if (!m) return null;
  const punto = (p) => p && { left: p.x - 15, top: p.y - 22, width: 30, height: 45 };
  if (m.arriba?.carta.id === id) {
    if (m.arriba.origen === 'mazo') return rectMazo();
    return m.arriba.desde !== estado.yo ? punto(manosDe(m.arriba.desde)) : null;
  }
  for (const j of m.jugadas) {
    const c = j.cartas.find((x) => x.id === id);
    if (!c) continue;
    const quien = c.echadaPor || j.duenio;
    return quien !== estado.yo ? punto(manosDe(quien)) : null;
  }
  if (m.ultimoDescarte?.id === id && contextoAntes?.turno && contextoAntes.turno !== estado.yo) return punto(manosDe(contextoAntes.turno));
  return null;
}

function volar(el, desde, ms = 430, retraso = 0) {
  if (calmado() || !desde) return;
  const hasta = el.getBoundingClientRect();
  if (!hasta.width) return;
  const clon = el.cloneNode(true);
  clon.removeAttribute('id');
  clon.classList.add('volando');
  Object.assign(clon.style, { left: hasta.left + 'px', top: hasta.top + 'px', width: hasta.width + 'px', height: hasta.height + 'px', transform: '' });
  document.body.appendChild(clon);
  el.style.visibility = 'hidden';
  const dx = desde.left + desde.width / 2 - (hasta.left + hasta.width / 2);
  const dy = desde.top + desde.height / 2 - (hasta.top + hasta.height / 2);
  const s = Math.max(0.3, desde.width / hasta.width);
  const anim = clon.animate([
    { transform: `translate(${dx}px, ${dy}px) scale(${s}) rotate(-8deg)` },
    { transform: `translate(${dx * 0.4}px, ${dy * 0.4 - 30}px) scale(${(s + 1.1) / 2}) rotate(-3deg)`, offset: 0.55 },
    { transform: 'none' },
  ], { duration: ms, delay: retraso, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'backwards' });
  anim.onfinish = anim.oncancel = () => { clon.remove(); el.style.visibility = ''; };
}

function volarCartas(antes) {
  document.querySelectorAll('#sobre-mesa .carta[data-id], #asientos .carta[data-id], #bandeja .carta[data-id]').forEach((el) => {
    const id = el.dataset.id;
    const lugar = lugarDe(el);
    const viejo = antes[id];
    if (viejo && viejo.lugar === lugar) return;
    volar(el, viejo ? viejo.rect : origenCarta(id));
  });
}

// Al repartir: del mazo salen cartas boca abajo hacia cada jugador
function animarReparto() {
  if (calmado() || !estado.mano) return;
  const mazo = rectMazo();
  if (!mazo) return;
  const activos = estado.mano.jugadores.filter((j) => j.activo).map((j) => j.id);
  let k = 0;
  for (let vuelta = 0; vuelta < 3; vuelta++) {
    for (const id of activos) {
      const p = manosDe(id);
      const c = document.createElement('div');
      c.className = 'carta dorso med volando';
      Object.assign(c.style, { left: mazo.left + 'px', top: mazo.top + 'px', width: mazo.width + 'px', height: mazo.height + 'px' });
      document.body.appendChild(c);
      const dx = p.x - (mazo.left + mazo.width / 2), dy = p.y - (mazo.top + mazo.height / 2);
      const a = c.animate([
        { transform: 'none', opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) rotate(${(k % 2 ? 1 : -1) * 25}deg) scale(.7)`, opacity: 1, offset: 0.85 },
        { transform: `translate(${dx}px, ${dy}px) scale(.6)`, opacity: 0 },
      ], { duration: 380, delay: k * 70, easing: 'ease-out', fill: 'backwards' });
      a.onfinish = () => c.remove();
      k++;
    }
  }
}

// ---------- El bote: montón de monedas sobre la mesa ----------
function pilaHTML(cantidad) {
  // una moneda por cada $2, en torres de hasta 12 (máximo 7 torres); las torres se llenan parejo
  const n = Math.min(84, Math.ceil(cantidad / 2));
  const nt = Math.min(7, Math.max(1, Math.ceil(n / 12)));
  const torres = Array.from({ length: nt }, (_, i) => Math.floor(n / nt) + (i < n % nt ? 1 : 0));
  // torres acomodadas como un montón (unas atrás, otras adelante)
  const pos = [[0, 0], [-30, 6], [30, 8], [-14, 20], [16, 22], [-42, 24], [44, 26]];
  return torres.map((t, i) => `<span class="torre-mesa" style="--dx:${pos[i][0]}%;--dy:${pos[i][1]}%;z-index:${pos[i][1]}">
    ${Array.from({ length: t }, (_, k) => `<i class="ficha" style="--k:${k};--r:${(((k * 37 + i * 13) % 5) - 2) * 0.12}cqw"></i>`).join('')}</span>`).join('');
}

function renderBote() {
  const caja = $('#bote-mesa');
  const b = estado.sala.bote;
  if (boteMostrado === null || b < boteMostrado) boteMostrado = b;  // si baja, se ve al momento (alguien lo recogió)
  const ver = boteMostrado;
  caja.classList.toggle('oculto', !estado.mano && !ver);
  caja.innerHTML = `<div class="montón">${pilaHTML(ver)}</div><div class="etq-bote">💰 ${b}</div>`;
}

function ficha(x, y) {
  const f = document.createElement('i');
  f.className = 'ficha volando-ficha';
  f.style.left = x + 'px';
  f.style.top = y + 'px';
  document.body.appendChild(f);
  return f;
}

function centroBote() {
  const r = $('#bote-mesa .montón').getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height * 0.6 };
}

// Monedas que vuelan de un punto a otro (con un pequeño arco)
function lanzarFichas(desde, hacia, cuantas, alTerminar) {
  if (calmado()) { if (alTerminar) alTerminar(); return; }
  let pendientes = cuantas;
  for (let i = 0; i < cuantas; i++) {
    const jx = (Math.random() - 0.5) * 26, jy = (Math.random() - 0.5) * 14;
    const f = ficha(desde.x + jx, desde.y + jy);
    const dx = hacia.x - desde.x + (Math.random() - 0.5) * 18, dy = hacia.y - desde.y + (Math.random() - 0.5) * 8;
    const a = f.animate([
      { transform: 'translate(-50%, -50%)', opacity: 0 },
      { transform: 'translate(-50%, -50%)', opacity: 1, offset: 0.08 },
      { transform: `translate(calc(-50% + ${dx * 0.5}px), calc(-50% + ${dy * 0.5 - 50}px)) rotate(180deg)`, offset: 0.5 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(360deg)`, opacity: 1 },
    ], { duration: 650, delay: i * 75, easing: 'cubic-bezier(.4,.1,.4,1)', fill: 'backwards' });
    a.onfinish = () => { f.remove(); if (--pendientes === 0 && alTerminar) alTerminar(); };
  }
}

function letrero(p, texto, clase) {
  const t = document.createElement('div');
  t.className = 'letrero-monto ' + clase;
  t.textContent = texto;
  t.style.left = p.x + 'px';
  t.style.top = p.y + 'px';
  document.body.appendChild(t);
  t.animate([{ transform: 'translate(-50%, 0)', opacity: 0 }, { transform: 'translate(-50%, -20px)', opacity: 1, offset: 0.2 }, { transform: 'translate(-50%, -60px)', opacity: 0 }],
    { duration: 1800, easing: 'ease-out' }).onfinish = () => t.remove();
}

// Compara el dinero de antes y de ahora: quién puso y quién recogió
function animarDinero(antes) {
  if (!$('#bote-mesa .montón')) return;
  const bote = centroBote();
  const pusieron = [], recogieron = [];
  for (const j of estado.jugadores) {
    const d = j.monedas - (antes.monedas[j.id] ?? j.monedas);
    if (d < 0) pusieron.push([j.id, -d]);
    if (d > 0) recogieron.push([j.id, d]);
  }
  // todos ponen su apuesta sobre la mesa
  let quedan = pusieron.length;
  pusieron.forEach(([id, monto], i) => {
    const p = manosDe(id);
    letrero(p, `-${monto}`, 'pone');
    setTimeout(() => lanzarFichas(p, bote, Math.min(6, Math.max(2, Math.ceil(monto / 5))), () => {
      if (--quedan === 0) { boteMostrado = estado.sala.bote; renderBote(); }
    }), i * 220);
  });
  if (!pusieron.length && boteMostrado !== estado.sala.bote) { boteMostrado = estado.sala.bote; renderBote(); }
  // el que gana recoge el dinero (o se regresa al cerrar la mesa)
  for (const [id, monto] of recogieron) {
    const p = manosDe(id);
    lanzarFichas(bote, p, Math.min(16, Math.max(4, Math.ceil(monto / 5))), () => letrero(p, `+${monto}`, 'gana'));
    if (estado.resultado?.tipo === 'gana' && estado.resultado.id === id) {
      document.querySelector(`.asiento[data-id="${id}"]`)?.classList.add('recoge');
    }
  }
}

// =============================================================
//  Marcador de cartas en la mesa (cuántas llevas de 9) y aviso de turno
// =============================================================
function enMesaDe(id) {
  return (estado.mano?.jugadas || []).reduce((t, j) => t + j.cartas.filter((c) => c.de === id).length, 0);
}
function marcadorHTML(id, chico = false) {
  const n = enMesaDe(id);
  if (chico) return `<span class="marcador chico" title="Cartas en la mesa">${n}/9</span>`;
  const puntos = Array.from({ length: 9 }, (_, i) => `<i class="${i < n ? 'lleno' : ''}"></i>`).join('');
  return `<div class="marcador" title="Cartas tuyas en la mesa"><span>${n}/9 en la mesa</span><div class="puntos">${puntos}</div></div>`;
}

function renderAvisoTurno() {
  let el = $('#aviso-turno');
  if (!el) { el = document.createElement('div'); el.id = 'aviso-turno'; $('#hud').prepend(el); }
  const m = estado.mano;
  let txt = '';
  if (m && !estado.sala.final) {
    const yo = infoMano(estado.yo);
    if (m.fase === 'cambio' && yo?.activo && !m.miCambio) txt = '🔁 Elige la carta para cambiar';
    else if (m.turno === estado.yo && m.fase === 'voltear') txt = '🔔 ¡Es tu turno! Voltea una carta';
    else if (m.turno === estado.yo && m.fase === 'decidir') txt = `🤔 ¡Te toca decidir! ¿Te sirve el ${nombreCarta(m.arriba.carta)}?`;
    else if (m.turno === estado.yo && m.fase === 'descartar') txt = '💸 ¡Te toca pagar una carta!';
  }
  el.textContent = txt;
  el.className = txt ? 'visible' : '';
}

// =============================================================
//  Una jugada en la mesa (tuya o de un rival)
// =============================================================
function jugadaHTML(jg) {
  const m = estado.mano;
  const enBandeja = cartasBandeja();
  const mia = jg.duenio === estado.yo;
  const tomadas = deMesa.filter((d) => d.jugada === jg.id).map((d) => d.cartaId);
  const restantes = jg.cartas.filter((c) => !tomadas.includes(c.id));
  const valida = mia && !tomadas.length && puedoArmar() && enBandeja.length > 0 && tipoJugada([...jg.cartas, ...enBandeja]) === jg.tipo;
  const echable = !mia && m && entra(jg, cartaParaEchar());
  const recortable = mia && puedoArmar();
  return `<div class="jugada ${valida ? 'valida' : ''} ${echable ? 'echable' : ''} ${mia ? 'mia' : ''} ${recortable ? 'recortable' : ''}" data-jugada="${jg.id}">
    ${echable ? '<div class="dueno">🎯 ¡Échasela!</div>' : ''}
    <div class="cartas">${restantes.map((c) => cartaHTML(c, 'mini' + (c.echadaPor ? ' ajena' : ''), recortable ? 'data-recorte="1"' : '')).join('')}</div></div>`;
}

// =============================================================
//  CHAT de la mesa (todo se muestra como texto, nunca como HTML)
// =============================================================
const globos = {};            // id -> { texto, hasta }
let mensajesChat = [];
let sinLeer = 0;
const chatAbierto = () => $('#chat').classList.contains('abierto') || window.matchMedia('(min-aspect-ratio: 1/1)').matches;

function pintarMensaje(msg) {
  const li = document.createElement('div');
  const mio = msg.de === estado?.yo;
  li.className = 'msg' + (mio ? ' yo' : '');
  const quien = document.createElement('b');
  quien.textContent = mio ? 'Tú' : msg.nombre;
  const texto = document.createElement('span');
  texto.textContent = msg.texto;
  li.append(quien, texto);
  $('#chat-mensajes').appendChild(li);
}
function pintarChat() {
  const caja = $('#chat-mensajes');
  caja.textContent = '';
  if (!mensajesChat.length) {
    const v = document.createElement('div'); v.className = 'msg sis'; v.textContent = 'Aquí pueden platicar los de la mesa';
    caja.appendChild(v);
  }
  mensajesChat.forEach(pintarMensaje);
  caja.scrollTop = caja.scrollHeight;
  actualizarSinLeer();
}
function actualizarSinLeer() {
  const b = $('#btn-chat i');
  b.textContent = sinLeer > 9 ? '9+' : String(sinLeer);
  b.classList.toggle('oculto', !sinLeer);
}

socket.on('chatHistorial', (lista) => { mensajesChat = Array.isArray(lista) ? lista : []; pintarChat(); });
socket.on('chat', (msg) => {
  if (!msg || typeof msg.texto !== 'string') return;
  mensajesChat = [...mensajesChat, msg].slice(-50);
  pintarChat();
  if (msg.de !== estado?.yo) {
    if (!chatAbierto()) { sinLeer++; actualizarSinLeer(); }
    // globito arriba de la cabeza de quien escribió (5 segundos)
    globos[msg.de] = { texto: msg.texto.length > 60 ? msg.texto.slice(0, 57) + '…' : msg.texto, hasta: Date.now() + 5000 };
    if (estado) renderRivales();
    setTimeout(() => { if (estado) renderRivales(); }, 5100);
  }
});

function mandarChat(texto) {
  texto = String(texto || '').trim();
  if (!texto) return;
  socket.emit('chat', texto.slice(0, 200), (r) => { if (r && r.error) toast(r.error); });
}
$('#chat-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  mandarChat($('#chat-texto').value);
  $('#chat-texto').value = '';
});
document.querySelectorAll('#chat-rapidas [data-frase]').forEach((b) => { b.onclick = () => mandarChat(b.dataset.frase); });
$('#btn-chat').onclick = () => {
  $('#chat').classList.add('abierto');
  $('#chat-velo').classList.remove('oculto');
  sinLeer = 0; actualizarSinLeer();
  $('#chat-mensajes').scrollTop = $('#chat-mensajes').scrollHeight;
};
const cerrarChat = () => { $('#chat').classList.remove('abierto'); $('#chat-velo').classList.add('oculto'); };
$('#chat-cerrar').onclick = cerrarChat;
$('#chat-velo').onclick = cerrarChat;
