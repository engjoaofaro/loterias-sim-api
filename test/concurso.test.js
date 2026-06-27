const { test } = require('node:test');
const assert = require('node:assert/strict');

const { resolveNextConcurso } = require('../concurso');

function fakeFetch(payload, { capture } = {}) {
  return async (url) => {
    if (capture) capture.url = url;
    return { json: async () => payload };
  };
}

test('resolveNextConcurso retorna o último concurso + 1 (numérico)', async () => {
  const next = await resolveNextConcurso({
    apiName: 'megasena', apiUrl: 'https://api.x/resultado', token: 'tk',
    fetchFn: fakeFetch({ numero_concurso: 2889 }),
  });
  assert.equal(next, 2890);
});

test('resolveNextConcurso lida com numero_concurso em string', async () => {
  const next = await resolveNextConcurso({
    apiName: 'lotofacil', apiUrl: 'https://api.x/resultado', token: 'tk',
    fetchFn: fakeFetch({ numero_concurso: '3625' }),
  });
  assert.equal(next, 3626);
});

test('resolveNextConcurso lança erro quando numero_concurso ausente', async () => {
  await assert.rejects(
    resolveNextConcurso({
      apiName: 'megasena', apiUrl: 'https://api.x/resultado', token: 'tk',
      fetchFn: fakeFetch({ erro: 'sem dados' }),
    }),
    /concurso/i,
  );
});

test('resolveNextConcurso monta a URL com loteria e token', async () => {
  const capture = {};
  await resolveNextConcurso({
    apiName: 'lotomania', apiUrl: 'https://api.x/resultado', token: 'segredo',
    fetchFn: fakeFetch({ numero_concurso: 2894 }, { capture }),
  });
  assert.match(capture.url, /loteria=lotomania/);
  assert.match(capture.url, /token=segredo/);
});
