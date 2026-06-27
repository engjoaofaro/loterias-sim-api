'use strict';

// Resolve o próximo concurso de uma loteria consultando a API de resultados
// (mesma usada por loterias-capture-results / loterias-core): retorna o último
// concurso sorteado + 1. `fetchFn` é injetável para testes (default: global fetch).

async function resolveNextConcurso({ apiName, apiUrl, token, fetchFn }) {
  const doFetch = fetchFn || fetch;
  const url = `${apiUrl}?loteria=${encodeURIComponent(apiName)}&token=${encodeURIComponent(token)}`;
  const res = await doFetch(url);
  const data = await res.json();
  const latest = parseInt(data && data.numero_concurso, 10);
  if (!Number.isInteger(latest)) {
    throw new Error('Não foi possível determinar o número do concurso atual.');
  }
  return latest + 1;
}

module.exports = { resolveNextConcurso };
