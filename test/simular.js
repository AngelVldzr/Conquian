'use strict';
// Juega miles de manos con "bots" para comprobar que las reglas no se traban.
const { Mano, tipoJugada } = require('../game/conquian');

function combinaciones(arr, k, inicio = 0, actual = [], salida = []) {
  if (actual.length === k) { salida.push([...actual]); return salida; }
  for (let i = inicio; i < arr.length; i++) { actual.push(arr[i]); combinaciones(arr, k, i + 1, actual, salida); actual.pop(); }
  return salida;
}

function buscarJugada(m, id) {
  const mano = m.manos[id];
  const arriba = m.arriba.carta;
  for (const j of m.jugadas) {
    if (tipoJugada([...j.cartas, arriba]) !== j.tipo) continue;
    if (j.duenio === id) return { manoIds: [], destino: j.id };
    if (Math.random() < 0.5) return { manoIds: [], destino: j.id, echar: true };
  }
  for (const k of [2, 3, 4]) {
    for (const combo of combinaciones(mano, k)) {
      if (tipoJugada([arriba, ...combo])) return { manoIds: combo.map((c) => c.id), destino: 'nueva' };
    }
  }
  return null;
}

const stats = { manos: 0, ganadas: 0, empates: 0, entroCuarto: 0, echadas: 0, jugadores: { 2: 0, 3: 0, 4: 0 } };

for (let partida = 0; partida < 3000; partida++) {
  const n = 2 + (partida % 3);
  const ids = ['A', 'B', 'C', 'D'].slice(0, n);
  const m = new Mano({ asientos: ids, esperando: n === 4 ? ids[partida % 4] : null, repartidor: ids[0] });
  stats.manos++;
  stats.jugadores[n]++;

  // Revisión: siempre debe haber 40 cartas en total
  const revisar = () => {
    const total = m.mazo.length + m.descartes.length + (m.arriba ? 1 : 0) +
      Object.values(m.manos).reduce((s, x) => s + x.length, 0) +
      m.jugadas.reduce((s, j) => s + j.cartas.length, 0);
    if (total !== 40) throw new Error(`Se perdieron cartas: ${total}`);
  };

  for (const id of m.ordenActivos()) m.elegirCambio(id, m.manos[id][Math.floor(Math.random() * 8)].id);
  if (Object.values(m.manos).some((x, i) => x.length !== (m.activos.has(ids[i]) ? 8 : 0))) throw new Error('Cambio mal hecho');

  let pasos = 0;
  while (m.fase !== 'fin') {
    if (++pasos > 5000) throw new Error('La mano se trabó');
    const id = m.turno;
    // A veces el bot baja una tercia o corrida que ya trae en la mano
    if (Math.random() < 0.5) {
      const mano = m.manos[id] || [];
      const minimo = 0; // ahora se puede bajar todo: si llegas a 9 ganas sin pagar
      for (const combo of combinaciones(mano, 3)) {
        if (mano.length - 3 >= minimo && tipoJugada(combo)) { m.bajarDeMano(id, { manoIds: combo.map((c) => c.id) }); break; }
      }
      for (const c of [...(m.manos[id] || [])]) {
        const j = m.jugadas.find((x) => x.duenio === id && tipoJugada([...x.cartas, c]) === x.tipo);
        if (j && m.manos[id].length - 1 >= minimo) { m.bajarDeMano(id, { manoIds: [c.id], destino: j.id }); break; }
      }
      revisar();
      if (m.fase === 'fin') break;
    }
    if (m.fase === 'voltear') m.voltear(id);
    else if (m.fase === 'decidir') {
      const jugada = Math.random() < 0.9 ? buscarJugada(m, id) : null;
      if (jugada) { if (jugada.echar) stats.echadas++; m.usar(id, jugada); } else m.pasar(id);
    } else if (m.fase === 'descartar') {
      const mano = m.manos[id];
      m.descartar(id, mano[Math.floor(Math.random() * mano.length)].id);
    }
    revisar();
    for (const e of m.eventos.splice(0)) if (e.tipo === 'entra') stats.entroCuarto++;
  }
  if (m.ganador) {
    const contribuidas = m.jugadas.flatMap((j) => j.cartas).filter((c) => c.de === m.ganador).length;
    // (hand + mesa siempre suman 8; al ganar, con la última carta suman 9)
    if (contribuidas !== 9) throw new Error(`El ganador bajó ${contribuidas} cartas, no 9`);
    stats.ganadas++;
  } else stats.empates++;
}

// Pruebas puntuales de reglas
const c = (palo, num) => ({ id: `${palo}-${num}`, palo, num });
const ok = (cond, msg) => { if (!cond) throw new Error('FALLA: ' + msg); };
ok(tipoJugada([c('copas', 6), c('copas', 7), c('copas', 10)]) === 'corrida', '6-7-sota es corrida');
ok(tipoJugada([c('copas', 12), c('copas', 1), c('copas', 2)]) === null, 'rey-as-2 no es corrida');
ok(tipoJugada([c('oros', 3), c('copas', 3), c('bastos', 3)]) === 'tercia', 'tercia de 3');
ok(tipoJugada([c('oros', 3), c('copas', 3)]) === null, 'dos cartas no es jugada');
ok(tipoJugada([c('oros', 3), c('oros', 4), c('copas', 5)]) === null, 'palos mezclados');

// Bajar una corrida que ya traes en la mano, sin la carta volteada
{
  const m = new Mano({ asientos: ['A', 'B'], repartidor: 'B' });
  for (const id of ['A', 'B']) m.elegirCambio(id, m.manos[id][0].id);
  m.manos.A = [c('espadas', 2), c('espadas', 3), c('espadas', 4), c('oros', 7), c('copas', 1), c('bastos', 5), c('oros', 1), c('copas', 12)];
  m.bajarDeMano('A', { manoIds: ['espadas-2', 'espadas-3', 'espadas-4'] });
  ok(m.jugadas.length === 1 && m.manos.A.length === 5 && m.turno === 'A' && m.fase === 'voltear', 'bajar corrida de la mano');
  let error = '';
  try { m.bajarDeMano('A', { manoIds: ['oros-7', 'copas-1', 'bastos-5'] }); } catch (e) { error = e.message; }
  ok(error && m.manos.A.length === 5, 'jugada inválida no se baja');
  try { m.bajarDeMano('B', { manoIds: [m.manos.B[0].id] }); error = ''; } catch (e) { error = e.message; }
  ok(error === 'Solo puedes bajar en tu turno', 'no bajar fuera de turno');
}

// RECORTE: 1,1,1,1 y 2,2,2,2 abajo; sale el 3 de oros -> 1-2-3 de oros, y quedan dos tercias = 9 cartas
{
  const m = new Mano({ asientos: ['A', 'B'], repartidor: 'B' });
  for (const id of ['A', 'B']) m.elegirCambio(id, m.manos[id][0].id);
  const P = ['oros', 'copas', 'espadas', 'bastos'];
  m.manos.A = [];
  m.jugadas = [
    { id: 90, duenio: 'A', tipo: 'tercia', cartas: P.map((p) => ({ ...c(p, 1), de: 'A' })) },
    { id: 91, duenio: 'A', tipo: 'tercia', cartas: P.map((p) => ({ ...c(p, 2), de: 'A' })) },
  ];
  m.mazo.push(c('oros', 3));
  m.turno = 'A'; m.fase = 'voltear';
  m.voltear('A');
  let error = '';
  try { m.usar('A', { deJugadas: [{ jugada: 90, cartaId: 'oros-1' }, { jugada: 90, cartaId: 'copas-1' }, { jugada: 91, cartaId: 'oros-2' }] }); } catch (e) { error = e.message; }
  ok(error.includes('ya no sería válida'), 'no dejar una jugada con 2 cartas');
  m.usar('A', { deJugadas: [{ jugada: 90, cartaId: 'oros-1' }, { jugada: 91, cartaId: 'oros-2' }] });
  ok(m.ganador === 'A', 'el recorte gana con 9 cartas');
  ok(m.jugadas.length === 3 && m.jugadas.every((j) => j.cartas.length === 3), 'quedan tres jugadas de 3');
}

// ECHAR: B tiene 3-4-5 de oros; sale el 6 de oros, A se lo echa y B tiene que pagar
{
  const m = new Mano({ asientos: ['A', 'B', 'C'], repartidor: 'C' });
  for (const id of ['A', 'B', 'C']) m.elegirCambio(id, m.manos[id][0].id);
  m.jugadas = [{ id: 80, duenio: 'B', tipo: 'corrida', cartas: [3, 4, 5].map((n) => ({ ...c('oros', n), de: 'B' })) }];
  m.manos.B = m.manos.B.filter((x) => !(x.palo === 'oros' && [3, 4, 5, 6].includes(x.num))).slice(0, 5);
  m.manos.A = m.manos.A.filter((x) => !(x.palo === 'oros' && x.num === 6));
  m.manos.C = m.manos.C.filter((x) => !(x.palo === 'oros' && x.num === 6));
  m.mazo = m.mazo.filter((x) => x.id !== 'oros-6'); m.mazo.push(c('oros', 6));
  m.turno = 'A'; m.fase = 'voltear';
  m.voltear('A');
  m.usar('A', { destino: 80 });
  ok(m.fase === 'descartar' && m.turno === 'B', 'B tiene que pagar');
  ok(m.jugadas[0].cartas.length === 4, 'el 6 quedó en la corrida de B');
  const tira = m.manos.B[0].id;
  m.descartar('B', tira);
  ok(m.turno === 'C' && m.arriba.carta.id === tira, 'lo que paga B se le ofrece a su derecha (C)');
  let error = '';
  try { m.bajarDeMano('C', { manoIds: [m.manos.C[0].id], destino: 80 }); } catch (e) { error = e.message; }
  ok(error, 'no se pueden acomodar cartas de la mano en jugadas de otros');
}

// GANAR SIN PAGAR: usas la carta que salió y ya traes la corrida en la mano
{
  const m = new Mano({ asientos: ['A', 'B'], repartidor: 'B' });
  for (const id of ['A', 'B']) m.elegirCambio(id, m.manos[id][0].id);
  const P = ['oros', 'copas', 'espadas', 'bastos'];
  m.jugadas = [
    { id: 70, duenio: 'A', tipo: 'tercia', cartas: P.slice(0, 3).map((p) => ({ ...c(p, 1), de: 'A' })) },
    { id: 71, duenio: 'A', tipo: 'tercia', cartas: P.slice(0, 2).map((p) => ({ ...c(p, 2), de: 'A' })).concat({ ...c('bastos', 2), de: 'A' }) },
  ];
  m.manos.A = [c('oros', 10), c('oros', 11)];
  m.mazo = m.mazo.filter((x) => x.id !== 'oros-12'); m.mazo.push(c('oros', 12));
  m.turno = 'A'; m.fase = 'voltear';
  m.voltear('A');
  m.usar('A', { manoIds: [], destino: 'nueva', deJugadas: [] }.manoIds.length ? {} : { manoIds: ['oros-10', 'oros-11'] });
  ok(m.ganador === 'A', 'usar la carta con la corrida de la mano gana directo');
}
{
  // 6 abajo + usa una carta (7) y le quedan 10-11-12 en la mano: baja la corrida y gana sin pagar
  const m = new Mano({ asientos: ['A', 'B'], repartidor: 'B' });
  for (const id of ['A', 'B']) m.elegirCambio(id, m.manos[id][0].id);
  const P = ['oros', 'copas', 'espadas', 'bastos'];
  m.jugadas = [
    { id: 60, duenio: 'A', tipo: 'tercia', cartas: P.slice(0, 3).map((p) => ({ ...c(p, 1), de: 'A' })) },
    { id: 61, duenio: 'A', tipo: 'tercia', cartas: P.slice(0, 3).map((p) => ({ ...c(p, 2), de: 'A' })).concat({ ...c('bastos', 2), de: 'A' }) },
  ];
  m.manos.A = [c('oros', 10), c('oros', 11), c('oros', 12)];
  m.turno = 'A'; m.fase = 'descartar';
  m.bajarDeMano('A', { manoIds: ['oros-10', 'oros-11', 'oros-12'] });
  ok(m.ganador === 'A', 'bajar la corrida de la mano antes de pagar gana sin pagar');
}

// ECHARLE a quien ya tiene sus 8 en la mesa: junta 9 y GANA
{
  const m = new Mano({ asientos: ['A', 'B'], repartidor: 'B' });
  for (const id of ['A', 'B']) m.elegirCambio(id, m.manos[id][0].id);
  const P = ['oros', 'copas', 'espadas', 'bastos'];
  m.manos.B = [];
  m.jugadas = [
    { id: 40, duenio: 'B', tipo: 'corrida', cartas: [1, 2, 3].map((n) => ({ ...c('bastos', n), de: 'B' })) },
    { id: 41, duenio: 'B', tipo: 'tercia', cartas: P.slice(0, 3).map((p) => ({ ...c(p, 7), de: 'B' })) },
    { id: 42, duenio: 'B', tipo: 'tercia', cartas: P.slice(0, 2).map((p) => ({ ...c(p, 12), de: 'B' })).concat({ ...c('bastos', 12), de: 'B' }).slice(0, 2) },
  ];
  m.jugadas[2].cartas = [{ ...c('oros', 12), de: 'B' }, { ...c('copas', 12), de: 'B' }]; m.jugadas[2].tipo = 'tercia';
  m.mazo = m.mazo.filter((x) => x.id !== 'bastos-4'); m.mazo.push(c('bastos', 4));
  m.turno = 'A'; m.fase = 'voltear';
  m.voltear('A');
  m.usar('A', { destino: 40 });
  ok(m.ganador === 'B', 'le echaron la carta que le faltaba y ganó');
}
// Bajar todo al pagar sin juntar 9: ya no paga y sigue el otro (no se traba)
{
  const m = new Mano({ asientos: ['A', 'B'], repartidor: 'B' });
  for (const id of ['A', 'B']) m.elegirCambio(id, m.manos[id][0].id);
  const P = ['oros', 'copas', 'espadas', 'bastos'];
  m.jugadas = [{ id: 30, duenio: 'A', tipo: 'tercia', cartas: P.slice(0, 3).map((p) => ({ ...c(p, 1), de: 'A' })) }];
  m.manos.A = [c('oros', 10), c('oros', 11), c('oros', 12)];
  m.turno = 'A'; m.fase = 'descartar';
  m.bajarDeMano('A', { manoIds: ['oros-10', 'oros-11', 'oros-12'] });
  ok(!m.ganador && m.turno === 'B' && m.fase === 'voltear', 'no se traba: le toca al siguiente');
}

// PAGAR ECHANDO: A paga con el 6 de oros metiéndolo en la corrida 3-4-5 de oros de B; B paga
{
  const m = new Mano({ asientos: ['A', 'B', 'C'], repartidor: 'C' });
  for (const id of ['A', 'B', 'C']) m.elegirCambio(id, m.manos[id][0].id);
  for (const id of ['A', 'B', 'C']) m.manos[id] = m.manos[id].filter((x) => !(x.palo === 'oros' && [3, 4, 5, 6].includes(x.num)));
  m.jugadas = [{ id: 20, duenio: 'B', tipo: 'corrida', cartas: [3, 4, 5].map((n) => ({ ...c('oros', n), de: 'B' })) }];
  m.manos.A.push(c('oros', 6));
  m.turno = 'A'; m.fase = 'descartar';
  const antesA = m.manos.A.length;
  m.descartar('A', 'oros-6', 20);
  ok(m.manos.A.length === antesA - 1 && m.jugadas[0].cartas.length === 4 && m.turno === 'B' && m.fase === 'descartar', 'pagar echando: B ahora paga');
}

console.log('✅ Todo bien:', stats);
