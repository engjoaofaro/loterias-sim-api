const { test } = require('node:test');
const assert = require('node:assert/strict');

const { corsHeaders } = require('../cors');

const ALLOWED = ['https://loteriassim.com.br', 'https://www.loteriassim.com.br', 'http://localhost:3000'];

test('ecoa a origem quando permitida', () => {
  const h = corsHeaders('https://loteriassim.com.br', ALLOWED);
  assert.equal(h['Access-Control-Allow-Origin'], 'https://loteriassim.com.br');
});

test('ecoa www quando permitida', () => {
  const h = corsHeaders('https://www.loteriassim.com.br', ALLOWED);
  assert.equal(h['Access-Control-Allow-Origin'], 'https://www.loteriassim.com.br');
});

test('origem não permitida cai no domínio primário (bloqueia cross-origin)', () => {
  const h = corsHeaders('https://malicioso.com', ALLOWED);
  assert.equal(h['Access-Control-Allow-Origin'], 'https://loteriassim.com.br');
});

test('sem origem usa o domínio primário', () => {
  const h = corsHeaders(undefined, ALLOWED);
  assert.equal(h['Access-Control-Allow-Origin'], 'https://loteriassim.com.br');
});

test('inclui Vary: Origin e métodos/headers', () => {
  const h = corsHeaders('http://localhost:3000', ALLOWED);
  assert.equal(h['Vary'], 'Origin');
  assert.match(h['Access-Control-Allow-Methods'], /POST/);
  assert.equal(h['Access-Control-Allow-Headers'], 'Content-Type');
});
