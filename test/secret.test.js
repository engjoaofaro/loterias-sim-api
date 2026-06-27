const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { getApiToken } = require('../secret');

function fakeSM(value, fail) {
  return { send: async () => { if (fail) throw new Error('AccessDenied'); return { SecretString: value }; } };
}

beforeEach(() => {
  delete process.env.SECRET_NAME;
  delete process.env.RESULTS_API_TOKEN;
});

test('sem SECRET_NAME usa env RESULTS_API_TOKEN', async () => {
  process.env.RESULTS_API_TOKEN = 'env-token';
  assert.equal(await getApiToken(undefined, false), 'env-token');
});

test('com SECRET_NAME lê do Secrets Manager', async () => {
  process.env.SECRET_NAME = 'loterias/apiloterias-token';
  process.env.RESULTS_API_TOKEN = 'env-token';
  assert.equal(await getApiToken(fakeSM('secret-token'), false), 'secret-token');
});

test('falha no Secrets Manager cai para env', async () => {
  process.env.SECRET_NAME = 'loterias/apiloterias-token';
  process.env.RESULTS_API_TOKEN = 'env-token';
  assert.equal(await getApiToken(fakeSM(null, true), false), 'env-token');
});
