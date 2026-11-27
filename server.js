'use strict';
// =============================================================
//  Servidor del juego: sirve la página y maneja las salas
//  en tiempo real con Socket.IO.
//
//  SEGURIDAD (resumen):
//   - Cada jugador tiene una LLAVE SECRETA (solo la conoce su navegador) y un
//     ID PÚBLICO (el que ven los demás). Nadie puede hacerse pasar por otro.
//   - Todo lo que llega del navegador se revisa (tipos, tamaños, valores).
//   - Límites contra abuso: acciones por segundo, mesas por persona, intentos
//     de adivinar códigos, mesas abiertas en total.
//   - Encabezados de seguridad (CSP, anti-iframe, etc.) y HTTPS cuando hay proxy.
// =============================================================
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const { Server } = require('socket.io');
const { Mano } = require('./game/conquian');
const { hacerCuentas } = require('./game/cuentas');

const PUERTO = process.env.PORT || 3000;
const PRODUCCION = process.env.NODE_ENV === 'production';
const MONEDAS_INICIALES = 200;
const MAX_JUGADORES = 4;
const MAX_SALAS = Number(process.env.MAX_SALAS) || 300;          // mesas abiertas a la vez
const LARGO_CODIGO = 5;
// Dominios extra que pueden conectarse (ej. "https://conquian.midominio.com"), separados por coma
const ORIGENES_EXTRA = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);

// ---------- Errores que sí se le pueden mostrar al jugador ----------
// (cualquier otro error se reporta como genérico, sin detalles internos)
class ErrorJuego extends Error {}
const falla = (msg) => { throw new ErrorJuego(msg); };

// ---------- Límite de velocidad (cubeta de fichas) ----------
function limitador(capacidad, porSegundo) {
  const cubetas = new Map();
  return (clave) => {
    const ahora = Date.now();
    let c = cubetas.get(clave);
    if (!c) { c = { fichas: capacidad, t: ahora }; cubetas.set(clave, c); }
    c.fichas = Math.min(capacidad, c.fichas + ((ahora - c.t) / 1000) * porSegundo);
    c.t = ahora;
    if (c.fichas < 1) return false;
    c.fichas -= 1;
    return true;
  };
}
const limiteAcciones = limitador(25, 8);          // por conexión: ráfagas de 25, 8 por segundo
const limiteCrearSala = limitador(5, 1 / 60);     // por IP: 5 mesas seguidas, luego 1 por minuto
const limiteIntentosCodigo = limitador(10, 1 / 30); // por IP: 10 códigos fallidos, luego 1 cada 30 s
const limiteFotos = limitador(5, 1 / 20);         // por conexión: cambios de selfie
const limiteConexiones = limitador(30, 1);         // por IP: conexiones nuevas
const limiteChat = limitador(6, 0.5);              // por conexión: 6 mensajes seguidos, luego 1 cada 2 s
const MAX_HISTORIAL_CHAT = 50;

const app = express();
app.disable('x-powered-by');
if (PRODUCCION) app.set('trust proxy', 1);       // Render / Railway / Cloudflare ponen HTTPS adelante

// ---------- Encabezados de seguridad ----------
app.use((req, res, next) => {
  // En producción todo va por HTTPS
  if (PRODUCCION && req.headers['x-forwarded-proto'] === 'http') {
    return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
  }
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",          // la página usa estilos en línea para acomodar cartas
    "img-src 'self' data: blob:",                 // selfies (data:) y vista previa (blob:)
    "connect-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (PRODUCCION) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

const server = http.createServer(app);

// Solo la propia página (o los dominios de ALLOWED_ORIGINS) puede conectarse al juego
function origenPermitido(req) {
  const origen = req.headers.origin;
  // Sin Origin: el navegador no lo manda en peticiones a la misma página. Si dice que viene
  // de otro sitio (sec-fetch-site), se rechaza. (Un programa fuera del navegador podría inventar
  // el Origin de todos modos; esto protege contra OTRAS PÁGINAS usando el navegador del visitante.)
  if (!origen) return !['cross-site', 'same-site'].includes(req.headers['sec-fetch-site']);
  try {
    const u = new URL(origen);
    if (u.host === req.headers.host) return true;
    if (ORIGENES_EXTRA.includes(origen)) return true;
    if (!PRODUCCION && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) return true;
  } catch { /* origen raro */ }
  return false;
}

const io = new Server(server, {
  maxHttpBufferSize: 200 * 1024,                // nada de mensajes gigantes (la selfie pesa ~10 KB)
  allowRequest: (req, cb) => {
    const ip = ipDe(req);
    if (!origenPermitido(req)) return cb('Origen no permitido', false);
    if (!limiteConexiones(ip)) return cb('Demasiadas conexiones', false);
    cb(null, true);
  },
});

function ipDe(req) {
  // detrás de un proxy de confianza, la IP real viene en x-forwarded-for
  const reenviada = PRODUCCION && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return reenviada || req.socket?.remoteAddress || 'desconocida';
}

// no-cache = el navegador puede guardar los archivos, pero SIEMPRE revisa si hay versión nueva
app.use(express.static(path.join(__dirname, 'public'), {
  dotfiles: 'deny',
  setHeaders: (res, archivo) => {
    if (/\.(html|js|css|json)$/.test(archivo)) res.setHeader('Cache-Control', 'no-cache');
  },
}));
app.get('/salud', (_req, res) => res.send('ok'));

// Escenarios: cada carpeta de public/escenarios/ con un datos.json (se leen una vez al arrancar)
function leerEscenarios() {
  const carpeta = path.join(__dirname, 'public', 'escenarios');
  const lista = [];
  for (const nombre of fs.readdirSync(carpeta)) {
    if (!/^[a-z0-9-]{1,30}$/.test(nombre)) continue;
    try {
      const datos = JSON.parse(fs.readFileSync(path.join(carpeta, nombre, 'datos.json'), 'utf8'));
      lista.push({ id: nombre, ...datos });
    } catch { /* no es un escenario */ }
  }
  return lista.sort((a, b) => (a.orden || 9) - (b.orden || 9));
}
const ESCENARIOS = leerEscenarios();
const ESCENARIOS_IDS = new Set(ESCENARIOS.map((e) => e.id));
app.get('/api/escenarios', (_req, res) => res.json(ESCENARIOS));

// Cualquier otra ruta: 404 sin detalles
app.use((_req, res) => res.status(404).send('No encontrado'));

const salas = new Map();

// Códigos de mesa con números aleatorios seguros (no Math.random)
function nuevoCodigo() {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c;
  do {
    c = Array.from({ length: LARGO_CODIGO }, () => letras[crypto.randomInt(letras.length)]).join('');
  } while (salas.has(c));
  return c;
}
const idPublico = () => 'p' + crypto.randomBytes(9).toString('base64url');

// ---------- Validación de lo que manda el navegador ----------
const limpiarNombre = (n) => String(n || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 16) || 'Jugador';
const esLlave = (k) => typeof k === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(k);
const esCartaId = (c) => typeof c === 'string' && /^(oros|copas|espadas|bastos)-(1|2|3|4|5|6|7|10|11|12)$/.test(c);
const listaCartas = (x) => {
  if (x == null) return [];
  if (!Array.isArray(x) || x.length > 9 || !x.every(esCartaId)) falla('Cartas no válidas');
  return x;
};
const destinoValido = (d) => {
  if (d == null || d === 'nueva') return d == null ? 'nueva' : d;
  const n = Number(d);
  if (!Number.isInteger(n) || n < 0 || n > 1e6) falla('Jugada no válida');
  return n;
};
const listaRecorte = (x) => {
  if (x == null) return [];
  if (!Array.isArray(x) || x.length > 9) falla('Recorte no válido');
  return x.map((d) => {
    if (!d || typeof d !== 'object' || !esCartaId(d.cartaId)) falla('Recorte no válido');
    return { jugada: destinoValido(d.jugada), cartaId: d.cartaId };
  });
};

const jugadorDe = (sala, id) => sala.jugadores.find((j) => j.id === id);
const jugadorPorLlave = (sala, llave) => sala.jugadores.find((j) => j.llave === llave);

// La selfie llega ya recortada y chiquita (jpg ~10 KB) desde el navegador
const fotoValida = (f) => typeof f === 'string' && f.length < 150000 && /^data:image\/(jpeg|webp|png);base64,[A-Za-z0-9+/=]+$/.test(f);

// Las fotos se mandan aparte (solo cuando cambian), no en cada jugada
function emitirFotos(sala) {
  const fotos = {};
  for (const j of sala.jugadores) if (j.foto) fotos[j.id] = j.foto;
  io.to(sala.codigo).emit('fotos', fotos);
}

function cobrar(sala, id) {
  const j = jugadorDe(sala, id);
  if (!j) return;
  const pago = Math.min(j.monedas, sala.apuesta);
  j.monedas -= pago;
  sala.bote += pago;
  sala.aportes[id] = (sala.aportes[id] || 0) + pago;   // para regresarlo si se cierra la mesa con bote
}

// Cerrar la mesa: si quedó bote (por empates), se le regresa a cada quien lo que puso
function finalizar(sala) {
  if (sala.mano && sala.mano.fase !== 'fin') sala.mano.anular();
  for (const [id, monto] of Object.entries(sala.aportes)) {
    const j = jugadorDe(sala, id);
    if (j) j.monedas += monto;
  }
  sala.aportes = {};
  sala.bote = 0;
  sala.propuesta = null;
  const { resumen, pagos } = hacerCuentas(sala.jugadores.map((j) => ({ id: j.id, nombre: j.nombre, inicial: j.inicial, final: j.monedas })));
  sala.final = { resumen, pagos, valorCredito: sala.valorCredito, manos: sala.numMano, cuando: Date.now() };
  // las selfies ya no hacen falta: se borran de la memoria del servidor
  for (const j of sala.jugadores) j.foto = null;
  emitirFotos(sala);
  programarBorrado(sala, 30 * 60 * 1000);
}

function procesarEventos(sala) {
  for (const e of sala.mano.eventos.splice(0)) {
    if (e.tipo === 'entra') cobrar(sala, e.id);
    if (e.tipo === 'gana') {
      const j = jugadorDe(sala, e.id);
      const monto = sala.bote;
      if (j) j.monedas += monto;
      sala.bote = 0;
      sala.aportes = {};
      sala.resultado = { tipo: 'gana', id: e.id, monto };
    }
    if (e.tipo === 'empate') { sala.resultado = { tipo: 'empate', bote: sala.bote }; sala.propuesta = null; }
    if (e.tipo === 'gana') sala.propuesta = null;
    // Regla opcional: tercia de 1 o de 12 -> se vota si se sube la apuesta
    if (e.tipo === 'figuras' && sala.reglas.subirConFiguras && !sala.propuesta && sala.mano.fase !== 'fin') {
      const quien = jugadorDe(sala, e.id)?.nombre || '¿?';
      sala.propuesta = {
        texto: `${quien} bajó tercia de ${e.num === 1 ? 'ases (1)' : 'reyes (12)'}`,
        monto: sala.apuesta,
        votos: {},
        votantes: [...sala.mano.activos],
      };
    }
  }
}

// Todos los que juegan la mano votan; si TODOS dicen que sí, cada quien pone otra apuesta al bote
function votar(sala, id, si) {
  const p = sala.propuesta;
  if (!p) falla('No hay nada que votar');
  if (!p.votantes.includes(id)) falla('No estás jugando esta mano');
  if (p.votos[id] !== undefined) falla('Ya votaste');
  p.votos[id] = si === true;
  const nombre = jugadorDe(sala, id)?.nombre || '¿?';
  if (si !== true) {
    sala.propuesta = null;
    sala.aviso = `${nombre} no quiso subir la apuesta. Se queda igual.`;
  } else if (p.votantes.every((v) => p.votos[v])) {
    for (const v of p.votantes) cobrar(sala, v);
    sala.propuesta = null;
    sala.aviso = `¡Todos aceptaron! La apuesta subió ${p.monto} por jugador.`;
  }
}

function repartir(sala) {
  const ids = sala.jugadores.map((j) => j.id);
  if (ids.length < 2) falla('Se necesitan al menos 2 jugadores');
  // Con 4 jugadores, el que espera los descartes va rotando cada mano
  const esperando = ids.length === 4 ? ids[(sala.numMano + 3) % 4] : null;
  const activos = ids.filter((i) => i !== esperando);
  const repartidor = activos[sala.numMano % activos.length];
  sala.mano = new Mano({
    asientos: ids,
    esperando,
    repartidor,
    nombre: (id) => jugadorDe(sala, id)?.nombre || '¿?',
    rng: () => crypto.randomInt(1 << 30) / (1 << 30),   // barajeo con números aleatorios seguros
  });
  sala.numMano++;
  sala.resultado = null;
  sala.propuesta = null;
  for (const id of activos) cobrar(sala, id);
}

// Lo que ve cada jugador: SOLO ids públicos y SOLO sus propias cartas
function vista(sala, id) {
  return {
    yo: id,
    sala: {
      codigo: sala.codigo,
      hostId: sala.hostId,
      apuesta: sala.apuesta,
      valorCredito: sala.valorCredito,
      final: sala.final,
      escenario: sala.escenario,
      bote: sala.bote,
      numMano: sala.numMano,
      reglas: sala.reglas,
      propuesta: sala.propuesta && { texto: sala.propuesta.texto, monto: sala.propuesta.monto, votos: sala.propuesta.votos, votantes: sala.propuesta.votantes },
      aviso: sala.aviso,
    },
    jugadores: sala.jugadores.map(({ id, nombre, monedas, inicial, conectado }) => ({ id, nombre, monedas, inicial, conectado })),
    mano: sala.mano ? sala.mano.vistaPara(id) : null,
    resultado: sala.resultado,
  };
}

function emitirEstado(sala) {
  for (const j of sala.jugadores) if (j.socketId) io.to(j.socketId).emit('estado', vista(sala, j.id));
}

function programarBorrado(sala, ms) {
  clearTimeout(sala.borrar);
  sala.borrar = setTimeout(() => salas.delete(sala.codigo), ms);
}

// Sienta al jugador: si su LLAVE ya está en la mesa, recupera su lugar; si no, entra nuevo
function sentar(socket, sala, { nombre, llave, foto, creditos }) {
  if (!esLlave(llave)) falla('Recarga la página e intenta de nuevo');
  let j = jugadorPorLlave(sala, llave);
  if (j) {
    // si ese lugar estaba abierto en otra pestaña, esa pestaña lo pierde
    if (j.socketId && j.socketId !== socket.id) io.sockets.sockets.get(j.socketId)?.leave(sala.codigo);
    j.socketId = socket.id;
    j.conectado = true;
    if (nombre) j.nombre = limpiarNombre(nombre);
    if (fotoValida(foto) && !sala.final) j.foto = foto;
  } else {
    if (sala.final) falla('Esa mesa ya se cerró');
    if (sala.jugadores.length >= MAX_JUGADORES) falla('La mesa ya está llena (4 jugadores)');
    const n = Math.round(Number(creditos));
    const inicial = Number.isFinite(n) && n >= 10 ? Math.min(n, 100000) : MONEDAS_INICIALES;
    j = { id: idPublico(), llave, nombre: limpiarNombre(nombre), monedas: inicial, inicial, socketId: socket.id, conectado: true, foto: fotoValida(foto) ? foto : null };
    sala.jugadores.push(j);
  }
  // una conexión solo puede estar en una mesa
  if (socket.data.sala && socket.data.sala !== sala.codigo) socket.leave(socket.data.sala);
  socket.data.sala = sala.codigo;
  socket.data.id = j.id;
  clearTimeout(sala.borrar);
  socket.join(sala.codigo);
  emitirFotos(sala);
  socket.emit('chatHistorial', sala.chat || []);
  return j;
}

io.on('connection', (socket) => {
  const ip = ipDe(socket.request);

  // Corre la acción; los errores del juego se le muestran al jugador, los demás se esconden
  const responder = (cb, fn) => {
    if (!limiteAcciones(socket.id)) {
      if (typeof cb === 'function') cb({ error: 'Vas muy rápido, espera un momento' });
      return;
    }
    try {
      const r = fn();
      if (typeof cb === 'function') cb(r || { ok: true });
    } catch (err) {
      if (!(err instanceof ErrorJuego) && !(err && err.constructor === Error)) console.error('Error interno:', err);
      const mensaje = err instanceof ErrorJuego || (err && err.constructor === Error) ? err.message : 'Algo salió mal, intenta de nuevo';
      if (typeof cb === 'function') cb({ error: String(mensaje).slice(0, 200) });
    }
  };
  const objeto = (d) => (d && typeof d === 'object' && !Array.isArray(d) ? d : {});

  socket.on('crearSala', (datos, cb) =>
    responder(cb, () => {
      datos = objeto(datos);
      if (!limiteCrearSala(ip)) falla('Creaste muchas mesas seguidas; espera un minuto');
      if (salas.size >= MAX_SALAS) falla('El servidor está lleno, intenta más tarde');
      const apuesta = [5, 10, 20, 50].includes(Number(datos.apuesta)) ? Number(datos.apuesta) : 10;
      const sala = {
        codigo: nuevoCodigo(),
        hostId: null,
        apuesta,
        reglas: { subirConFiguras: datos.subirConFiguras === true },
        valorCredito: 1,   // 1 crédito = $1
        aportes: {},
        final: null,
        propuesta: null,
        aviso: null,
        escenario: ESCENARIOS_IDS.has('taxis') ? 'taxis' : ESCENARIOS[0]?.id,
        bote: 0,
        numMano: 0,
        jugadores: [],
        mano: null,
        resultado: null,
        chat: [],
        creada: Date.now(),
      };
      const j = sentar(socket, sala, datos);
      sala.hostId = j.id;
      salas.set(sala.codigo, sala);
      programarBorrado(sala, 12 * 60 * 60 * 1000);   // ninguna mesa vive más de 12 horas
      emitirEstado(sala);
      return { codigo: sala.codigo };
    })
  );

  socket.on('unirse', (datos, cb) =>
    responder(cb, () => {
      datos = objeto(datos);
      const codigo = String(datos.codigo || '').trim().toUpperCase().slice(0, 10);
      const sala = salas.get(codigo);
      if (!sala) {
        // cada código equivocado cuenta: así nadie puede probar códigos al azar
        if (!limiteIntentosCodigo(ip)) falla('Demasiados intentos; espera un momento');
        falla('No existe una mesa con ese código');
      }
      sentar(socket, sala, datos);
      emitirEstado(sala);
      return { codigo: sala.codigo };
    })
  );

  socket.on('accion', (datos, cb) =>
    responder(cb, () => {
      datos = objeto(datos);
      const sala = salas.get(socket.data.sala);
      const id = socket.data.id;
      if (!sala || !jugadorDe(sala, id)) falla('No estás en una mesa');
      const esHost = sala.hostId === id;
      const m = sala.mano;
      const conMano = () => { if (!m) falla('Todavía no se reparte'); return m; };

      if (sala.final) falla('La mesa ya se cerró');
      sala.aviso = null;
      switch (datos.tipo) {
        case 'finalizar':
          if (!esHost) falla('Solo el anfitrión puede cerrar la mesa');
          finalizar(sala);
          emitirEstado(sala);
          return;
        case 'repartir':
          if (!esHost) falla('Solo el anfitrión reparte');
          if (m && m.fase !== 'fin') falla('La mano sigue en juego');
          repartir(sala);
          break;
        case 'anular':
          if (!esHost) falla('Solo el anfitrión puede anular');
          if (!m || m.fase === 'fin') falla('No hay mano en juego');
          m.anular();
          break;
        case 'cambio':
          if (!esCartaId(datos.cartaId)) falla('Carta no válida');
          conMano().elegirCambio(id, datos.cartaId);
          break;
        case 'voltear':
          conMano().voltear(id);
          break;
        case 'pasar':
          conMano().pasar(id);
          break;
        case 'usar':
          conMano().usar(id, { manoIds: listaCartas(datos.manoIds), destino: destinoValido(datos.destino), deJugadas: listaRecorte(datos.deJugadas) });
          break;
        case 'votar':
          votar(sala, id, datos.si === true);
          break;
        case 'bajar':
          conMano().bajarDeMano(id, { manoIds: listaCartas(datos.manoIds), destino: destinoValido(datos.destino), deJugadas: listaRecorte(datos.deJugadas) });
          break;
        case 'descartar': {
          if (!esCartaId(datos.cartaId)) falla('Carta no válida');
          const d = datos.destino == null ? null : destinoValido(datos.destino);
          conMano().descartar(id, datos.cartaId, d === 'nueva' ? null : d);
          break;
        }
        default:
          falla('Acción desconocida');
      }
      if (sala.mano) procesarEventos(sala);
      emitirEstado(sala);
    })
  );

  socket.on('foto', (foto) => {
    if (!limiteFotos(socket.id)) return;
    const sala = salas.get(socket.data.sala);
    const j = sala && jugadorDe(sala, socket.data.id);
    if (!j || sala.final) return;
    j.foto = fotoValida(foto) ? foto : null;
    emitirFotos(sala);
  });

  // ---------- Chat de la mesa ----------
  // Solo texto (se muestra con textContent en el navegador, nunca como HTML), máximo 200 letras,
  // con límite de velocidad. Solo lo reciben los de la mesa y se borra al borrarse la mesa.
  socket.on('chat', (texto, cb) => {
    const responderChat = (r) => { if (typeof cb === 'function') cb(r); };
    const sala = salas.get(socket.data.sala);
    const j = sala && jugadorDe(sala, socket.data.id);
    if (!j) return responderChat({ error: 'No estás en una mesa' });
    if (!limiteChat(socket.id)) return responderChat({ error: 'Espera un poquito antes de mandar otro mensaje' });
    const limpio = String(typeof texto === 'string' ? texto : '').replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!limpio) return responderChat({ error: 'Mensaje vacío' });
    const msg = { id: crypto.randomBytes(6).toString('base64url'), de: j.id, nombre: j.nombre, texto: limpio, t: Date.now() };
    sala.chat = [...(sala.chat || []), msg].slice(-MAX_HISTORIAL_CHAT);
    io.to(sala.codigo).emit('chat', msg);
    responderChat({ ok: true });
  });

  socket.on('escenario', (nombre) => {
    if (!limiteAcciones(socket.id)) return;
    const sala = salas.get(socket.data.sala);
    if (!sala || !jugadorDe(sala, socket.data.id) || !ESCENARIOS_IDS.has(nombre)) return;
    sala.escenario = nombre;
    emitirEstado(sala);
  });

  socket.on('disconnect', () => {
    const sala = salas.get(socket.data.sala);
    if (!sala) return;
    const j = jugadorDe(sala, socket.data.id);
    if (j && j.socketId === socket.id) {
      j.conectado = false;
      j.socketId = null;
      // Antes de repartir, quien se va libera su lugar (y su selfie se borra)
      if (!sala.mano && !sala.final) sala.jugadores = sala.jugadores.filter((x) => x !== j);
      if (sala.hostId === j.id && sala.jugadores.length && !sala.mano) sala.hostId = sala.jugadores[0].id;
    }
    if (sala.jugadores.every((x) => !x.conectado)) programarBorrado(sala, 30 * 60 * 1000);
    emitirEstado(sala);
    emitirFotos(sala);
  });
});

// Que un error inesperado no tumbe el servidor completo
process.on('uncaughtException', (err) => console.error('Error no controlado:', err));
process.on('unhandledRejection', (err) => console.error('Promesa rechazada:', err));

if (require.main === module) {
  server.listen(PUERTO, () => console.log(`🃏 Conquián listo en http://localhost:${PUERTO}`));
}

module.exports = { server, _prueba: { votar, procesarEventos, cobrar, finalizar, origenPermitido } };
