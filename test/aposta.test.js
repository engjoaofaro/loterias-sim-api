const { test } = require('node:test');
const assert = require('node:assert/strict');

const { prizeTier, shapeAposta } = require('../games');

test('prizeTier — Mega-Sena', () => {
  assert.equal(prizeTier('megasena', 6), 'Sena');
  assert.equal(prizeTier('mega-sena', 5), 'Quina');
  assert.equal(prizeTier('megasena', 4), 'Quadra');
  assert.equal(prizeTier('megasena', 3), null);
});

test('prizeTier — Lotofácil e Lotomania', () => {
  assert.equal(prizeTier('lotofacil', 15), '15 acertos');
  assert.equal(prizeTier('lotofacil', 11), '11 acertos');
  assert.equal(prizeTier('lotofacil', 10), null);
  assert.equal(prizeTier('lotomania', 20), '20 acertos');
  assert.equal(prizeTier('lotomania', 0), '0 acertos');
  assert.equal(prizeTier('lotomania', 14), null);
});

test('shapeAposta — apurada (com premiação)', () => {
  const outcome = {
    voucher: 'v1', loteria: 'megasena', concurso: 3023,
    dezenasSorteadas: [22, 25, 30, 31, 39, 60], maxAcertos: 6,
    resultados: [{ numbers: [22, 25, 30, 31, 39, 60], hits: 6 }, { numbers: [1, 2, 3, 4, 5, 6], hits: 0 }],
  };
  const r = shapeAposta(outcome, null);
  assert.equal(r.status, 'apurada');
  assert.equal(r.loteria, 'mega-sena');
  assert.equal(r.concurso, 3023);
  assert.equal(r.premiado, true);
  assert.equal(r.resultados[0].premiacao, 'Sena');
  assert.equal(r.resultados[1].premiacao, null);
});

test('shapeAposta — apurada sem premiação', () => {
  const outcome = { voucher: 'v2', loteria: 'megasena', concurso: 3023, dezenasSorteadas: [], maxAcertos: 3,
    resultados: [{ numbers: [], hits: 3 }] };
  assert.equal(shapeAposta(outcome, null).premiado, false);
});

test('shapeAposta — pendente (só Game)', () => {
  const game = { voucher: 'v3', gameType: 2, lotteryNumber: 3721, games: [[1, 2, 3]] };
  const r = shapeAposta(null, game);
  assert.equal(r.status, 'pendente');
  assert.equal(r.loteria, 'lotofacil');
  assert.equal(r.concurso, 3721);
});

test('shapeAposta — não encontrada', () => {
  assert.equal(shapeAposta(null, null), null);
});
