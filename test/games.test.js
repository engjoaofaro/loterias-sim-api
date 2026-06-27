const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  getGameConfig,
  generateGame,
  validateManualGame,
  validateBet,
  generateGames,
  buildGameDto,
} = require('../games');

// ---------- getGameConfig ----------

test('getGameConfig retorna config da Mega-Sena (6 a 20 de 01-60)', () => {
  const c = getGameConfig('mega-sena');
  assert.equal(c.gameType, 1);
  assert.equal(c.min, 1);
  assert.equal(c.max, 60);
  assert.equal(c.minPick, 6);
  assert.equal(c.maxPick, 20);
  assert.equal(c.apiName, 'megasena');
});

test('getGameConfig retorna config da Lotofácil (15 a 20 de 01-25)', () => {
  const c = getGameConfig('lotofacil');
  assert.equal(c.gameType, 2);
  assert.equal(c.min, 1);
  assert.equal(c.max, 25);
  assert.equal(c.minPick, 15);
  assert.equal(c.maxPick, 20);
  assert.equal(c.apiName, 'lotofacil');
});

test('getGameConfig retorna config da Lotomania (50 fixo de 00-99)', () => {
  const c = getGameConfig('lotomania');
  assert.equal(c.gameType, 3);
  assert.equal(c.min, 0);
  assert.equal(c.max, 99);
  assert.equal(c.minPick, 50);
  assert.equal(c.maxPick, 50);
  assert.equal(c.apiName, 'lotomania');
});

test('getGameConfig lança erro para loteria desconhecida', () => {
  assert.throws(() => getGameConfig('quina'), /loteria/i);
});

// ---------- generateGame ----------

test('generateGame gera a quantidade pedida de dezenas, únicas, ordenadas e no range', () => {
  const c = getGameConfig('mega-sena');
  for (let i = 0; i < 50; i++) {
    const g = generateGame(c, 6);
    assert.equal(g.length, 6);
    assert.equal(new Set(g).size, 6, 'sem duplicados');
    assert.deepEqual([...g].sort((a, b) => a - b), g, 'ordenado asc');
    for (const n of g) {
      assert.ok(n >= c.min && n <= c.max, `dezena ${n} fora do range`);
    }
  }
});

test('generateGame da Lotomania respeita o range 00-99 (inclui 0, exclui 100)', () => {
  const c = getGameConfig('lotomania');
  for (let i = 0; i < 30; i++) {
    const g = generateGame(c, 50);
    assert.equal(g.length, 50);
    assert.equal(new Set(g).size, 50);
    for (const n of g) {
      assert.ok(n >= 0 && n <= 99, `dezena ${n} fora de 0-99`);
    }
  }
});

// ---------- validateManualGame ----------

test('validateManualGame aceita um jogo válido', () => {
  const c = getGameConfig('mega-sena');
  assert.doesNotThrow(() => validateManualGame(c, 6, [1, 2, 3, 4, 5, 6]));
});

test('validateManualGame rejeita tamanho diferente do numbersPerGame', () => {
  const c = getGameConfig('mega-sena');
  assert.throws(() => validateManualGame(c, 6, [1, 2, 3, 4, 5]), /6 dezenas/i);
});

test('validateManualGame rejeita dezena fora do range', () => {
  const c = getGameConfig('mega-sena');
  assert.throws(() => validateManualGame(c, 6, [1, 2, 3, 4, 5, 61]), /range|intervalo|1.*60/i);
});

test('validateManualGame rejeita dezenas duplicadas', () => {
  const c = getGameConfig('mega-sena');
  assert.throws(() => validateManualGame(c, 6, [1, 2, 3, 4, 5, 5]), /duplicad/i);
});

// ---------- validateBet ----------

test('validateBet normaliza uma aposta válida', () => {
  const out = validateBet({ lottery: 'mega-sena', numbersPerGame: 6, gamesToGenerate: 3, email: 'a@b.com' });
  assert.equal(out.lottery, 'mega-sena');
  assert.equal(out.gameType, 1);
  assert.equal(out.numbersPerGame, 6);
  assert.equal(out.gamesToGenerate, 3);
  assert.equal(out.email, 'a@b.com');
});

test('validateBet aceita email ausente (null)', () => {
  const out = validateBet({ lottery: 'lotofacil', numbersPerGame: 15, gamesToGenerate: 1 });
  assert.equal(out.email, null);
});

test('validateBet rejeita numbersPerGame abaixo do mínimo da modalidade', () => {
  assert.throws(() => validateBet({ lottery: 'mega-sena', numbersPerGame: 5, gamesToGenerate: 1 }), /6.*20|mínimo/i);
});

test('validateBet rejeita numbersPerGame acima do máximo da modalidade', () => {
  assert.throws(() => validateBet({ lottery: 'lotofacil', numbersPerGame: 21, gamesToGenerate: 1 }), /15.*20|máximo/i);
});

test('validateBet exige exatamente 50 dezenas na Lotomania', () => {
  assert.throws(() => validateBet({ lottery: 'lotomania', numbersPerGame: 49, gamesToGenerate: 1 }), /50/);
  assert.doesNotThrow(() => validateBet({ lottery: 'lotomania', numbersPerGame: 50, gamesToGenerate: 1 }));
});

test('validateBet rejeita gamesToGenerate inválido', () => {
  assert.throws(() => validateBet({ lottery: 'mega-sena', numbersPerGame: 6, gamesToGenerate: 0 }), /quantidade|jogos/i);
  assert.throws(() => validateBet({ lottery: 'mega-sena', numbersPerGame: 6, gamesToGenerate: 1000 }), /quantidade|jogos|máx/i);
});

test('validateBet rejeita loteria inválida', () => {
  assert.throws(() => validateBet({ lottery: 'quina', numbersPerGame: 6, gamesToGenerate: 1 }), /loteria/i);
});

test('validateBet rejeita email mal formatado', () => {
  assert.throws(() => validateBet({ lottery: 'mega-sena', numbersPerGame: 6, gamesToGenerate: 1, email: 'invalido' }), /e-?mail/i);
});

// ---------- generateGames (auto + manual) ----------

test('generateGames gera a quantidade total pedida', () => {
  const c = getGameConfig('mega-sena');
  const games = generateGames(c, 6, 5);
  assert.equal(games.length, 5);
  for (const g of games) assert.equal(g.length, 6);
});

test('generateGames inclui os jogos manuais e completa o restante automaticamente', () => {
  const c = getGameConfig('mega-sena');
  const manual = [[1, 2, 3, 4, 5, 6]];
  const games = generateGames(c, 6, 3, manual);
  assert.equal(games.length, 3);
  assert.deepEqual(games[0], [1, 2, 3, 4, 5, 6]);
});

test('generateGames rejeita mais jogos manuais que o total', () => {
  const c = getGameConfig('mega-sena');
  const manual = [[1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12]];
  assert.throws(() => generateGames(c, 6, 1, manual), /manuai|total/i);
});

// ---------- buildGameDto ----------

test('buildGameDto monta o contrato canônico com gameType int', () => {
  const dto = buildGameDto({
    lottery: 'mega-sena',
    email: 'a@b.com',
    lotteryNumber: 2890,
    voucher: 'uuid-x',
    games: [[1, 2, 3, 4, 5, 6]],
  });
  assert.equal(dto.gameType, 1);
  assert.equal(dto.email, 'a@b.com');
  assert.equal(dto.lotteryNumber, 2890);
  assert.equal(dto.voucher, 'uuid-x');
  assert.deepEqual(dto.games, [[1, 2, 3, 4, 5, 6]]);
});
