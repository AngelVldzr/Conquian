'use strict';
// =============================================================
//  Lógica del Conquián (baraja española de 40 cartas)
//  El servidor es el "crupier": solo aquí se baraja, se reparte
//  y se valida cada jugada. Los navegadores solo ven su mano.
// =============================================================

const PALOS = ['oros', 'copas', 'espadas', 'bastos'];
const NUMEROS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12]; // sin 8 ni 9
const CARTAS_POR_JUGADOR = 8;
const DESCARTES_PARA_ENTRAR = 8;

// Posición en la escalera: el 7 queda pegado a la sota (10)
const pos = (n) => NUMEROS.indexOf(n);

function crearBaraja() {
  const baraja = [];
  for (const palo of PALOS) for (const num of NUMEROS) baraja.push({ id: `${palo}-${num}`, palo, num });
  return baraja;
}

function barajar(cartas, rng = Math.random) {
  for (let i = cartas.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cartas[i], cartas[j]] = [cartas[j], cartas[i]];
  }
  return cartas;
}

// Devuelve 'tercia' (3-4 del mismo número), 'corrida' (3+ seguidas del mismo palo) o null
function tipoJugada(cartas) {
  if (cartas.length < 3) return null;
  if (new Set(cartas.map((c) => c.id)).size !== cartas.length) return null;
  if (cartas.every((c) => c.num === cartas[0].num)) {
    return cartas.length <= 4 && new Set(cartas.map((c) => c.palo)).size === cartas.length ? 'tercia' : null;
  }
  if (cartas.every((c) => c.palo === cartas[0].palo)) {
    const p = cartas.map((c) => pos(c.num)).sort((a, b) => a - b);
    for (let i = 1; i < p.length; i++) if (p[i] !== p[i - 1] + 1) return null;
    return 'corrida';
  }
  return null;
}

function ordenar(cartas, tipo) {
  const copia = [...cartas];
  if (tipo === 'corrida') return copia.sort((a, b) => pos(a.num) - pos(b.num));
  return copia.sort((a, b) => PALOS.indexOf(a.palo) - PALOS.indexOf(b.palo));
}

function nombreCarta(c) {
  const n = { 1: 'As', 10: 'Sota', 11: 'Caballo', 12: 'Rey' }[c.num] || c.num;
  return `${n} de ${c.palo}`;
}

class Mano {
  /**
   * @param asientos   ids de los jugadores en orden de la mesa (2 a 4)
   * @param esperando  id del 4º jugador que espera los descartes (o null)
   * @param repartidor id de quien reparte (empieza el de su derecha)
   * @param nombre     función id -> nombre, solo para el historial
   */
  constructor({ asientos, esperando = null, repartidor, nombre = (id) => id, rng = Math.random }) {
    this.asientos = [...asientos];
    this.esperando = esperando;
    this.activos = new Set(this.asientos.filter((id) => id !== esperando));
    if (this.activos.size < 2 || this.activos.size > 3) throw new Error('Se juega con 2 o 3 jugadores en la mesa');
    this.nombre = nombre;
    this.mazo = barajar(crearBaraja(), rng);
    this.manos = {};
    for (const id of this.asientos) this.manos[id] = [];
    for (let i = 0; i < CARTAS_POR_JUGADOR; i++) for (const id of this.ordenActivos()) this.manos[id].push(this.mazo.pop());
    this.descartes = [];
    this.jugadas = [];
    this.proximaJugada = 1;
    this.cambios = {};
    this.repartidor = this.activos.has(repartidor) ? repartidor : this.ordenActivos()[0];
    this.fase = 'cambio'; // cambio -> voltear -> decidir -> (descartar) -> ... -> fin
    this.turno = null;
    this.arriba = null; // carta boca arriba que se está ofreciendo
    this.ganador = null;
    this.eventos = []; // el servidor los lee para cobrar/pagar monedas
    this.log = [];
    this.registrar('Se repartieron 8 cartas. Cada quien pasa una carta a su derecha.');
  }

  // ---------- utilidades ----------
  ordenActivos() { return this.asientos.filter((id) => this.activos.has(id)); }

  siguiente(id) {
    const n = this.asientos.length;
    let i = this.asientos.indexOf(id);
    for (let k = 0; k < n; k++) {
      i = (i + 1) % n;
      if (this.activos.has(this.asientos[i])) return this.asientos[i];
    }
    return id;
  }

  registrar(texto) {
    this.log.push(texto);
    if (this.log.length > 40) this.log.shift();
  }

  exigir(condicion, mensaje) { if (!condicion) throw new Error(mensaje); }

  exigirTurno(id, fase) {
    this.exigir(this.fase === fase, 'Ahora no puedes hacer eso');
    this.exigir(this.turno === id, 'No es tu turno');
  }

  sacarDeMano(id, cartaId) {
    const mano = this.manos[id] || [];
    const i = mano.findIndex((c) => c.id === cartaId);
    this.exigir(i >= 0, 'Esa carta no está en tu mano');
    return mano.splice(i, 1)[0];
  }

  pasarTurnoA(id) {
    if (this.mazo.length === 0) {
      this.fase = 'fin';
      this.turno = null;
      this.registrar('Se acabó el mazo: empate. Se vuelve a repartir.');
      this.eventos.push({ tipo: 'empate' });
      return;
    }
    this.fase = 'voltear';
    this.turno = id;
  }

  // ---------- 1. Cambio inicial: 1 carta al jugador de la derecha ----------
  elegirCambio(id, cartaId) {
    this.exigir(this.fase === 'cambio', 'El cambio ya se hizo');
    this.exigir(this.activos.has(id), 'No estás jugando esta mano');
    this.exigir(this.manos[id].some((c) => c.id === cartaId), 'Esa carta no está en tu mano');
    this.cambios[id] = cartaId;
    if (this.ordenActivos().every((j) => this.cambios[j])) {
      const dadas = {};
      for (const j of this.ordenActivos()) dadas[j] = this.sacarDeMano(j, this.cambios[j]);
      for (const j of this.ordenActivos()) this.manos[this.siguiente(j)].push(dadas[j]);
      this.cambios = {};
      this.registrar('Todos pasaron su carta. ¡A jugar!');
      this.pasarTurnoA(this.siguiente(this.repartidor));
    }
  }

  // ---------- 2. Voltear la carta de arriba del mazo ----------
  voltear(id) {
    this.exigirTurno(id, 'voltear');
    const carta = this.mazo.pop();
    this.arriba = { carta, desde: id, origen: 'mazo', ofrecidos: 1 };
    this.fase = 'decidir';
    this.turno = id;
    this.registrar(`${this.nombre(id)} volteó el ${nombreCarta(carta)}.`);
  }

  // ---------- 3a. No usar la carta: se ofrece al siguiente ----------
  pasar(id) {
    this.exigirTurno(id, 'decidir');
    const n = this.activos.size;
    // la carta del mazo la ven todos; la que alguien tira la ven todos menos quien la tiró
    const limite = this.arriba.origen === 'mazo' ? n : n - 1;
    if (this.arriba.ofrecidos >= limite) {
      const { carta, desde } = this.arriba;
      this.descartes.push(carta);
      this.arriba = null;
      this.registrar(`Nadie usó el ${nombreCarta(carta)}; se fue a descartes.`);
      this.revisarCuartoJugador();
      this.pasarTurnoA(this.siguiente(desde));
    } else {
      this.turno = this.siguiente(id);
      this.arriba.ofrecidos++;
    }
  }

  // ---------- Ayudantes para armar jugadas ----------
  // Cartas de tu mano (no se sacan todavía)
  tomarDeMano(id, manoIds) {
    this.exigir(new Set(manoIds).size === manoIds.length, 'Cartas repetidas');
    const mano = this.manos[id];
    return manoIds.map((cid) => {
      const c = mano.find((x) => x.id === cid);
      this.exigir(c, 'Esa carta no está en tu mano');
      return c;
    });
  }

  // RECORTE: cartas que tomas de TUS jugadas de la mesa para armar otra.
  // Lo que quede en cada jugada tiene que seguir siendo tercia o corrida (o quedar vacía).
  planearRecorte(id, deJugadas = []) {
    const porJugada = new Map();
    for (const { jugada, cartaId } of deJugadas) {
      const j = this.jugadas.find((x) => x.id === Number(jugada));
      this.exigir(j, 'Esa jugada no existe');
      this.exigir(j.duenio === id, 'Solo puedes recortar de tus propias jugadas');
      const c = j.cartas.find((x) => x.id === cartaId);
      this.exigir(c, 'Esa carta no está en esa jugada');
      if (!porJugada.has(j)) porJugada.set(j, []);
      this.exigir(!porJugada.get(j).includes(c), 'Cartas repetidas');
      porJugada.get(j).push(c);
    }
    for (const [j, quitar] of porJugada) {
      const resto = j.cartas.filter((c) => !quitar.includes(c));
      this.exigir(resto.length === 0 || tipoJugada(resto), `Si quitas esas cartas, tu ${j.tipo} ya no sería válida`);
    }
    return porJugada;
  }

  aplicarRecorte(porJugada) {
    for (const [j, quitar] of porJugada) {
      j.cartas = j.cartas.filter((c) => !quitar.includes(c));
      if (j.cartas.length) { j.tipo = tipoJugada(j.cartas); j.cartas = ordenar(j.cartas, j.tipo); }
    }
    this.jugadas = this.jugadas.filter((j) => j.cartas.length);
  }

  // Pone cartas en una jugada nueva o en una de TUS jugadas
  colocar(id, cartas, destino, recorte) {
    const tomadas = [...recorte.values()].flat();
    const todas = [...cartas, ...tomadas];
    let texto;
    if (destino === 'nueva' || destino == null) {
      const tipo = tipoJugada(todas);
      this.exigir(tipo, 'Esas cartas no forman tercia ni corrida');
      this.aplicarRecorte(recorte);
      this.jugadas.push({ id: this.proximaJugada++, duenio: id, tipo, cartas: ordenar(todas, tipo) });
      texto = tomadas.length ? `hizo un RECORTE y armó una ${tipo}` : `bajó una ${tipo}`;
      this.revisarFiguras(id, todas, tipo);
    } else {
      const jugada = this.jugadas.find((j) => j.id === Number(destino));
      this.exigir(jugada, 'Esa jugada no existe');
      this.exigir(jugada.duenio === id, 'En las jugadas de otros solo puedes ECHAR la carta que salió');
      this.exigir(!recorte.has(jugada), 'No puedes recortar de la misma jugada');
      const juntas = [...jugada.cartas, ...todas];
      const tipo = tipoJugada(juntas);
      this.exigir(tipo && tipo === jugada.tipo, 'Esa carta no se acomoda en esa jugada');
      this.aplicarRecorte(recorte);
      jugada.cartas = ordenar(juntas, tipo);
      texto = `acomodó ${todas.length === 1 ? 'el ' + nombreCarta(todas[0]) : todas.length + ' cartas'} en su ${tipo}`;
    }
    this.ultimaBajada = { quien: id, n: (this.ultimaBajada?.n || 0) + 1 };
    return texto;
  }

  // Tercia (o cuarta) de 1 o de 12: con la regla opcional se puede subir la apuesta
  revisarFiguras(id, cartas, tipo) {
    if (tipo === 'tercia' && (cartas[0].num === 1 || cartas[0].num === 12)) this.eventos.push({ tipo: 'figuras', id, num: cartas[0].num });
  }

  // ---------- 3b. Usar la carta que salió ----------
  //  destino 'nueva' o una de TUS jugadas  -> la usas tú (luego pagas: tiras una)
  //  destino = jugada de OTRO jugador       -> se la ECHAS: él tiene que pagar
  usar(id, { manoIds = [], destino = 'nueva', deJugadas = [] } = {}) {
    this.exigirTurno(id, 'decidir');
    const arriba = this.arriba.carta;
    const dest = destino !== 'nueva' && destino != null ? this.jugadas.find((j) => j.id === Number(destino)) : null;
    if (dest && dest.duenio !== id) return this.echar(id, dest, manoIds, deJugadas);

    const deMano = this.tomarDeMano(id, manoIds);
    const recorte = this.planearRecorte(id, deJugadas);
    const nuevas = [arriba, ...deMano].map((c) => ({ ...c, de: id }));
    const texto = this.colocar(id, nuevas, destino, recorte);
    this.registrar(`${this.nombre(id)} ${texto} con el ${nombreCarta(arriba)}.`);
    for (const c of deMano) this.sacarDeMano(id, c.id);
    this.arriba = null;

    if (this.manos[id].length === 0) {
      // todas tus cartas en la mesa + la que salió = 9
      this.fase = 'fin';
      this.turno = null;
      this.ganador = id;
      this.registrar(`¡${this.nombre(id)} juntó sus 9 cartas y ganó!`);
      this.eventos.push({ tipo: 'gana', id });
      return;
    }
    this.fase = 'descartar';
    this.turno = id;
  }

  // ---------- 3c. ECHAR: meterle la carta a la jugada de otro para complicarle ----------
  // La carta queda en su jugada (cuenta como suya) y él tiene que PAGAR: tirar una de su mano.
  // Lo que él tire se le ofrece primero al jugador de SU derecha, aunque ya haya pasado.
  echar(id, jugada, manoIds = [], deJugadas = []) {
    this.exigir(!manoIds.length && !deJugadas.length, 'Para echar solo se usa la carta que salió');
    const victima = jugada.duenio;
    this.exigir(this.activos.has(victima), 'Ese jugador no está jugando esta mano');
    const arriba = this.arriba.carta;
    const juntas = [...jugada.cartas, { ...arriba, de: victima, echadaPor: id }];
    const tipo = tipoJugada(juntas);
    this.exigir(tipo && tipo === jugada.tipo, 'Esa carta no entra en esa jugada');
    jugada.cartas = ordenar(juntas, tipo);
    this.arriba = null;
    this.ultimaBajada = { quien: id, n: (this.ultimaBajada?.n || 0) + 1 };
    this.eventos.push({ tipo: 'echo', id, victima });
    // Si ya tenía todo en la mesa, con esa carta junta sus 9: ¡le salió bien y gana!
    if (this.manos[victima].length === 0) {
      this.registrar(`${this.nombre(id)} le echó el ${nombreCarta(arriba)} a ${this.nombre(victima)}… ¡y con esa juntó sus 9!`);
      this.revisarGanador(victima);
      if (this.fase === 'fin') return;
    }
    this.registrar(`${this.nombre(id)} le ECHÓ el ${nombreCarta(arriba)} a ${this.nombre(victima)}: ¡le toca pagar!`);
    this.fase = 'descartar';
    this.turno = victima;
  }

  // ---------- 3d. Bajar jugadas con cartas de tu mano (y recorte) ----------
  // En tu turno (antes de voltear, al decidir o antes de tirar). No cambia el turno.
  bajarDeMano(id, { manoIds = [], destino = 'nueva', deJugadas = [] } = {}) {
    this.exigir(['voltear', 'decidir', 'descartar'].includes(this.fase) && this.turno === id, 'Solo puedes bajar en tu turno');
    this.exigir(manoIds.length > 0, 'Elige cartas de tu mano');
    const deMano = this.tomarDeMano(id, manoIds);
    // Si bajas TODAS tus cartas antes de pagar, ya juntaste tus 9: ganas sin pagar
    const recorte = this.planearRecorte(id, deJugadas);
    const texto = this.colocar(id, deMano.map((c) => ({ ...c, de: id })), destino, recorte);
    this.registrar(`${this.nombre(id)} ${texto} de su mano.`);
    for (const c of deMano) this.sacarDeMano(id, c.id);
    this.revisarGanador(id);
    // Bajó todo al pagar pero aún no junta 9: ya no tiene qué tirar, sigue el de su derecha
    // (ahora espera la carta que le falte: la suya o una que le echen)
    if (this.fase === 'descartar' && this.manos[id].length === 0) {
      this.registrar(`${this.nombre(id)} bajó todas sus cartas; le falta una para juntar 9.`);
      this.arriba = null;
      this.pasarTurnoA(this.siguiente(id));
    }
  }

  // Cartas tuyas en la mesa (las que bajaste + las que te echaron)
  cartasEnMesa(id) {
    return this.jugadas.reduce((n, j) => n + j.cartas.filter((c) => c.de === id).length, 0);
  }

  revisarGanador(id) {
    if (this.manos[id].length === 0 && this.cartasEnMesa(id) >= 9) {
      this.fase = 'fin';
      this.turno = null;
      this.arriba = null;
      this.ganador = id;
      this.registrar(`¡${this.nombre(id)} juntó sus 9 cartas y ganó!`);
      this.eventos.push({ tipo: 'gana', id });
    }
  }

  // ---------- 4. Después de usar una carta, tiras una de tu mano ----------
  // Pagar: tiras una carta. Si esa carta le entra a la jugada de OTRO, puedes pagar
  // echándosela (destino = su jugada): queda en su jugada y ahora él tiene que pagar.
  descartar(id, cartaId, destino = null) {
    this.exigirTurno(id, 'descartar');
    if (destino != null) return this.pagarEchando(id, cartaId, destino);
    const carta = this.sacarDeMano(id, cartaId);
    this.arriba = { carta, desde: id, origen: 'descarte', ofrecidos: 1 };
    this.fase = 'decidir';
    this.turno = this.siguiente(id);
    this.registrar(`${this.nombre(id)} tiró el ${nombreCarta(carta)}.`);
  }

  pagarEchando(id, cartaId, destino) {
    const jugada = this.jugadas.find((j) => j.id === Number(destino));
    this.exigir(jugada, 'Esa jugada no existe');
    this.exigir(jugada.duenio !== id, 'Para pagar echando, la carta va en la jugada de otro');
    const victima = jugada.duenio;
    this.exigir(this.activos.has(victima), 'Ese jugador no está jugando esta mano');
    const carta = (this.manos[id] || []).find((c) => c.id === cartaId);
    this.exigir(carta, 'Esa carta no está en tu mano');
    const juntas = [...jugada.cartas, { ...carta, de: victima, echadaPor: id }];
    const tipo = tipoJugada(juntas);
    this.exigir(tipo && tipo === jugada.tipo, 'Esa carta no le entra a su jugada');
    this.sacarDeMano(id, cartaId);
    jugada.cartas = ordenar(juntas, tipo);
    this.ultimaBajada = { quien: id, n: (this.ultimaBajada?.n || 0) + 1 };
    this.eventos.push({ tipo: 'echo', id, victima });
    if (this.manos[victima].length === 0) {
      this.registrar(`${this.nombre(id)} pagó echándole el ${nombreCarta(carta)} a ${this.nombre(victima)}… ¡y con esa juntó sus 9!`);
      this.revisarGanador(victima);
      if (this.fase === 'fin') return;
    }
    this.registrar(`${this.nombre(id)} pagó ECHÁNDOLE el ${nombreCarta(carta)} a ${this.nombre(victima)}: ¡ahora él paga!`);
    this.fase = 'descartar';
    this.turno = victima;
  }

  // ---------- Regla especial: el 4º jugador entra con 8 descartes ----------
  revisarCuartoJugador() {
    if (!this.esperando || this.descartes.length < DESCARTES_PARA_ENTRAR) return;
    const id = this.esperando;
    this.manos[id] = this.descartes.splice(0, DESCARTES_PARA_ENTRAR);
    this.activos.add(id);
    this.esperando = null;
    this.registrar(`¡${this.nombre(id)} juntó 8 descartes y entra a jugar!`);
    this.eventos.push({ tipo: 'entra', id });
  }

  anular() {
    this.fase = 'fin';
    this.turno = null;
    this.arriba = null;
    this.registrar('El anfitrión anuló la mano.');
    this.eventos.push({ tipo: 'empate' });
  }

  // Lo que ve cada jugador: su mano completa, de los demás solo cuántas tienen
  vistaPara(id) {
    return {
      fase: this.fase,
      turno: this.turno,
      repartidor: this.repartidor,
      esperando: this.esperando,
      ganador: this.ganador,
      miMano: this.manos[id] || [],
      miCambio: this.cambios[id] || null,
      jugadores: this.asientos.map((j) => ({
        id: j,
        cartas: (this.manos[j] || []).length,
        activo: this.activos.has(j),
        esperando: j === this.esperando,
        yaCambio: Boolean(this.cambios[j]),
      })),
      jugadas: this.jugadas,
      arriba: this.arriba ? { carta: this.arriba.carta, desde: this.arriba.desde, origen: this.arriba.origen } : null,
      mazo: this.mazo.length,
      descartes: this.descartes.length,
      ultimoDescarte: this.descartes[this.descartes.length - 1] || null,
      faltanParaEntrar: this.esperando ? Math.max(0, DESCARTES_PARA_ENTRAR - this.descartes.length) : null,
      log: this.log.slice(-8),
      ultimaBajada: this.ultimaBajada || null,
    };
  }
}

module.exports = { Mano, tipoJugada, crearBaraja, barajar, nombreCarta, PALOS, NUMEROS };
