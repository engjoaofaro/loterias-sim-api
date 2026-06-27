'use strict';

// Lógica pura de regras/geração de jogos das loterias.
// Portada do app original (loterias-app-v2, Java) para a sim-api.
// Sem dependências de AWS — totalmente testável.

const MAX_GAMES = 100; // teto de jogos por requisição

// Configuração por modalidade. min/max = universo de dezenas;
// minPick/maxPick = quantas dezenas por jogo. apiName = nome usado pela API de resultados.
const GAMES = {
  'mega-sena': { gameType: 1, min: 1, max: 60, minPick: 6, maxPick: 20, apiName: 'megasena' },
  lotofacil: { gameType: 2, min: 1, max: 25, minPick: 15, maxPick: 20, apiName: 'lotofacil' },
  lotomania: { gameType: 3, min: 0, max: 99, minPick: 50, maxPick: 50, apiName: 'lotomania' },
};

const LOTTERY_BY_TYPE = { 1: 'mega-sena', 2: 'lotofacil', 3: 'lotomania' };

function getGameConfig(lottery) {
  const c = GAMES[lottery];
  if (!c) {
    throw new Error(`Loteria inválida: "${lottery}". Use mega-sena, lotofacil ou lotomania.`);
  }
  return c;
}

// Gera um jogo: `numbersPerGame` dezenas únicas no range [min,max], ordenadas asc.
function generateGame(config, numbersPerGame) {
  const picks = new Set();
  const span = config.max - config.min + 1;
  while (picks.size < numbersPerGame) {
    picks.add(config.min + Math.floor(Math.random() * span));
  }
  return [...picks].sort((a, b) => a - b);
}

function validateManualGame(config, numbersPerGame, game) {
  if (!Array.isArray(game) || game.length !== numbersPerGame) {
    throw new Error(`Cada jogo deve ter ${numbersPerGame} dezenas.`);
  }
  for (const n of game) {
    if (!Number.isInteger(n) || n < config.min || n > config.max) {
      throw new Error(`Dezena ${n} fora do intervalo ${config.min}-${config.max}.`);
    }
  }
  if (new Set(game).size !== game.length) {
    throw new Error('Há dezenas duplicadas em um dos jogos.');
  }
}

function validateBet(input) {
  const { lottery } = input || {};
  const config = getGameConfig(lottery);

  const numbersPerGame = Number(input.numbersPerGame);
  if (!Number.isInteger(numbersPerGame) || numbersPerGame < config.minPick || numbersPerGame > config.maxPick) {
    if (config.minPick === config.maxPick) {
      throw new Error(`A ${lottery} exige exatamente ${config.minPick} dezenas por jogo.`);
    }
    throw new Error(`Para ${lottery} escolha de ${config.minPick} a ${config.maxPick} dezenas por jogo.`);
  }

  const gamesToGenerate = Number(input.gamesToGenerate);
  if (!Number.isInteger(gamesToGenerate) || gamesToGenerate < 1 || gamesToGenerate > MAX_GAMES) {
    throw new Error(`Quantidade de jogos deve ser entre 1 e ${MAX_GAMES}.`);
  }

  let email = input.email;
  if (email === undefined || email === null || email === '') {
    email = null;
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('E-mail inválido.');
  }

  return { lottery, gameType: config.gameType, numbersPerGame, gamesToGenerate, email, config };
}

// Gera `count` jogos. Jogos manuais (opcionais) entram primeiro e são validados;
// o restante é gerado automaticamente.
function generateGames(config, numbersPerGame, count, manualGames) {
  const manual = manualGames || [];
  if (manual.length > count) {
    throw new Error('Há mais jogos manuais do que o total de jogos solicitado.');
  }
  const games = manual.map((g) => {
    validateManualGame(config, numbersPerGame, g);
    return [...g].sort((a, b) => a - b);
  });
  while (games.length < count) {
    games.push(generateGame(config, numbersPerGame));
  }
  return games;
}

// Monta o contrato canônico (GameDto) consumido pela pipeline (validador/core).
function buildGameDto({ lottery, email, lotteryNumber, voucher, games }) {
  const config = getGameConfig(lottery);
  return {
    gameType: config.gameType,
    email: email ?? null,
    voucher,
    lotteryNumber,
    games,
  };
}

function _normLottery(l) {
  const k = String(l).replace('-', '');
  return { megasena: 'mega-sena', lotofacil: 'lotofacil', lotomania: 'lotomania' }[k] || l;
}

// Faixa de premiação para a quantidade de acertos, ou null. Aceita 'megasena' e 'mega-sena'.
function prizeTier(lottery, hits) {
  const k = String(lottery).replace('-', '');
  if (k === 'megasena') return { 6: 'Sena', 5: 'Quina', 4: 'Quadra' }[hits] || null;
  if (k === 'lotofacil') return hits >= 11 && hits <= 15 ? `${hits} acertos` : null;
  if (k === 'lotomania') return (hits === 0 || (hits >= 15 && hits <= 20)) ? `${hits} acertos` : null;
  return null;
}

// Monta a resposta de "conferir aposta" a partir do Outcome (apurada) e/ou do Game (pendente).
function shapeAposta(outcome, game) {
  if (outcome) {
    const resultados = (outcome.resultados || []).map((r) => ({
      numbers: r.numbers, hits: r.hits, premiacao: prizeTier(outcome.loteria, r.hits),
    }));
    return {
      status: 'apurada',
      voucher: outcome.voucher,
      loteria: _normLottery(outcome.loteria),
      concurso: outcome.concurso,
      dezenasSorteadas: outcome.dezenasSorteadas,
      resultados,
      maxAcertos: outcome.maxAcertos,
      premiado: resultados.some((r) => r.premiacao !== null),
    };
  }
  if (game) {
    return {
      status: 'pendente',
      voucher: game.voucher,
      loteria: LOTTERY_BY_TYPE[game.gameType] || String(game.gameType),
      concurso: game.lotteryNumber,
    };
  }
  return null;
}

module.exports = {
  MAX_GAMES,
  GAMES,
  LOTTERY_BY_TYPE,
  getGameConfig,
  generateGame,
  validateManualGame,
  validateBet,
  generateGames,
  buildGameDto,
  prizeTier,
  shapeAposta,
};
