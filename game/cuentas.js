'use strict';
// =============================================================
//  Cuentas al finalizar la mesa: quién le paga cuánto a quién.
//  El juego NO mueve dinero: solo hace la cuenta, como la libreta
//  donde se anota quién debe. Los jugadores se arreglan entre ellos.
// =============================================================

/**
 * @param jugadores [{ id, nombre, inicial, final }]  (créditos con los que entró y con los que salió)
 * @returns { resumen: [{id, nombre, inicial, final, neto}], pagos: [{de, a, monto}] }
 *   Usa el mínimo de pagos: el que más perdió le paga primero al que más ganó.
 */
function hacerCuentas(jugadores) {
  const resumen = jugadores.map((j) => ({ ...j, neto: j.final - j.inicial }));
  const deben = resumen.filter((j) => j.neto < 0).map((j) => ({ id: j.id, falta: -j.neto })).sort((a, b) => b.falta - a.falta);
  const cobran = resumen.filter((j) => j.neto > 0).map((j) => ({ id: j.id, falta: j.neto })).sort((a, b) => b.falta - a.falta);
  const pagos = [];
  let i = 0, k = 0;
  while (i < deben.length && k < cobran.length) {
    const monto = Math.min(deben[i].falta, cobran[k].falta);
    if (monto > 0) pagos.push({ de: deben[i].id, a: cobran[k].id, monto });
    deben[i].falta -= monto;
    cobran[k].falta -= monto;
    if (deben[i].falta === 0) i++;
    if (cobran[k].falta === 0) k++;
  }
  resumen.sort((a, b) => b.neto - a.neto);
  return { resumen, pagos };
}

module.exports = { hacerCuentas };
