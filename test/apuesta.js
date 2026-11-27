'use strict';
// Prueba de la regla opcional: tercia de 1 o 12 -> votación para subir la apuesta
const { _prueba } = require('../server');
const { Mano } = require('../game/conquian');
const ok = (c, m) => { if (!c) throw new Error('FALLA: ' + m); };
function sala(regla) {
  const s = { apuesta: 10, bote: 30, aportes: { A: 10, B: 10, C: 10 }, reglas: { subirConFiguras: regla }, propuesta: null, aviso: null,
    jugadores: ['A', 'B', 'C'].map((id) => ({ id, nombre: id, monedas: 100 })) };
  s.mano = new Mano({ asientos: ['A', 'B', 'C'], repartidor: 'C' });
  return s;
}
let s = sala(true);
s.mano.eventos.push({ tipo: 'figuras', id: 'A', num: 12 });
_prueba.procesarEventos(s);
ok(s.propuesta && s.propuesta.votantes.length === 3, 'se abre la votación');
_prueba.votar(s, 'A', true); _prueba.votar(s, 'B', true);
ok(s.propuesta, 'falta uno');
_prueba.votar(s, 'C', true);
ok(!s.propuesta && s.bote === 60 && s.jugadores.every((j) => j.monedas === 90), 'todos aceptan: cada quien pone 10');
s = sala(true);
s.mano.eventos.push({ tipo: 'figuras', id: 'A', num: 1 });
_prueba.procesarEventos(s);
_prueba.votar(s, 'B', false);
ok(!s.propuesta && s.bote === 30, 'uno dice que no: no sube');
s = sala(false);
s.mano.eventos.push({ tipo: 'figuras', id: 'A', num: 1 });
_prueba.procesarEventos(s);
ok(!s.propuesta, 'sin la regla no hay votación');
console.log('✅ Regla de subir apuesta: bien');

// ---------- Cuentas al cerrar la mesa ----------
const { hacerCuentas } = require('../game/cuentas');
let r = hacerCuentas([
  { id: 'juan', nombre: 'Juan', inicial: 200, final: 240 },
  { id: 'pedro', nombre: 'Pedro', inicial: 200, final: 160 },
]);
ok(r.pagos.length === 1 && r.pagos[0].de === 'pedro' && r.pagos[0].a === 'juan' && r.pagos[0].monto === 40, 'Pedro le paga 40 a Juan');
r = hacerCuentas([
  { id: 'a', inicial: 200, final: 350 }, { id: 'b', inicial: 100, final: 40 },
  { id: 'c', inicial: 500, final: 430 }, { id: 'd', inicial: 200, final: 180 },
]);
const pagado = {}; for (const p of r.pagos) { pagado[p.de] = (pagado[p.de] || 0) - p.monto; pagado[p.a] = (pagado[p.a] || 0) + p.monto; }
ok(pagado.a === 150 && pagado.b === -60 && pagado.c === -70 && pagado.d === -20 && r.pagos.length <= 3, 'cuentas de 4 cuadran con el mínimo de pagos');

// Cerrar con bote pendiente (empate): se regresa lo que cada quien puso
s = sala(false);
s.jugadores = [{ id: 'A', nombre: 'A', monedas: 190, inicial: 200 }, { id: 'B', nombre: 'B', monedas: 190, inicial: 200 }];
s.bote = 20; s.aportes = { A: 10, B: 10 }; s.mano = null; s.numMano = 1; s.valorCredito = 1;
_prueba.finalizar(s);
ok(s.jugadores.every((j) => j.monedas === 200) && s.final.pagos.length === 0, 'el bote del empate se regresa y nadie debe');
console.log('✅ Cuentas al cerrar la mesa: bien');
process.exit(0);
