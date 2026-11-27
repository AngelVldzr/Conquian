'use strict';
// Revisa que las métricas salgan bien y SIN datos personales (nombres, chat, llave).
const assert = require('assert');
const metricas = require('../game/metricas');
const { server, _prueba } = require('../server');
const { io } = require('socket.io-client');

metricas._forzar = true;
const enviados = [];
metricas._usarEnvio(async (_url, op) => { enviados.push(...JSON.parse(op.body).batch); return { ok: true }; });

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const pedir = (s, ev, d) => new Promise((r) => s.emit(ev, d, r));
const llave = () => require('crypto').randomBytes(18).toString('base64url');

server.listen(0, async () => {
  const url = `http://localhost:${server.address().port}`;
  const cliente = (auth) => { const s = io(url, { auth, extraHeaders: { origin: url } }); s.on('estado', (e) => { s.e = e; }); return s; };
  const A = 'a'.repeat(32), B = 'b'.repeat(32);
  const a = cliente({ v: A, nueva: true, regreso: 7, pantalla: 'pc' });
  const b = cliente({ v: B, nueva: true, inv: true });
  const c = cliente({ v: 'c'.repeat(32), nueva: true, nt: true });          // pidió "no rastrear"
  await espera(300);
  const { codigo } = await pedir(a, 'crearSala', { nombre: 'Isaac', llave: llave(), apuesta: 10 });
  await pedir(b, 'unirse', { codigo, nombre: 'Ana', llave: llave(), porLink: true });
  await pedir(c, 'unirse', { codigo, nombre: 'Beto', llave: llave() });
  a.emit('metrica', 'invitacion_enviada', { medio: 'compartir' });
  a.emit('metrica', 'hackeo', {});                                         // no permitido
  a.emit('chat', 'secreto123', () => {});
  await pedir(a, 'accion', { tipo: 'repartir' });
  await pedir(a, 'accion', { tipo: 'anular' });                             // mano a medias
  await pedir(a, 'accion', { tipo: 'repartir' });
  await pedir(a, 'accion', { tipo: 'finalizar' });                          // cierra con mano a medias
  // una mano que sí se termina: alguien gana
  _prueba.procesarEventos({ mano: { eventos: [{ tipo: 'gana', id: 'x' }], activos: ['x', 'y'], fase: 'fin' }, jugadores: [{ id: 'x', visitante: A, monedas: 0 }, { id: 'y', visitante: B, monedas: 0 }],
    numMano: 5, inicioMano: Date.now() - 90000, bote: 20, aportes: {}, reglas: {}, escenario: 'taxis', apuesta: 10 });
  await espera(200);
  await metricas.vaciar();

  const de = (v, ev) => enviados.filter((e) => e.distinct_id === v && e.event === ev);
  assert.strictEqual(de(A, 'visita').length, 1);
  assert.strictEqual(de(A, 'jugador_regresa')[0].properties.dia_7, true);
  assert.strictEqual(de(B, 'visita')[0].properties.por_invitacion, true);
  assert.strictEqual(de(A, 'sala_creada').length, 1);
  assert.strictEqual(de(B, 'se_unio_a_mesa')[0].properties.por_link, true);
  assert.strictEqual(de(A, 'invitacion_enviada')[0].properties.medio, 'compartir');
  assert.strictEqual(de(A, 'partida_iniciada').length, 2);
  assert.deepStrictEqual(de(A, 'partida_abandonada').map((e) => e.properties.motivo), ['anulada', 'mesa_cerrada']);
  assert.deepStrictEqual(de(A, 'partida_terminada').map((e) => [e.properties.resultado, e.properties.mano_num]), [['gano', 5]], 'la anulada no cuenta como terminada');
  assert.strictEqual(de(B, 'partida_terminada')[0].properties.resultado, 'perdio');
  assert.ok(de(A, 'partida_terminada')[0].properties.duracion_seg >= 89);
  assert.strictEqual(de(A, 'mesa_cerrada').length, 1);
  assert.ok(!enviados.some((e) => e.distinct_id === 'c'.repeat(32)), 'no rastrear se respeta');
  assert.ok(!enviados.some((e) => e.event === 'hackeo'));
  const todo = JSON.stringify(enviados);
  for (const prohibido of ['Isaac', 'Ana', 'Beto', 'secreto123', codigo]) assert.ok(!todo.includes(prohibido), `se filtró: ${prohibido}`);
  console.log(`✅ Métricas: ${enviados.length} eventos, sin nombres, chat, códigos ni llaves`);
  console.log('   ', [...new Set(enviados.map((e) => e.event))].join(', '));
  process.exit(0);
});
