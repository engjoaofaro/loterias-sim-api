const { test } = require('node:test');
const assert = require('node:assert/strict');

const { buildConfirmationEmail } = require('../mailer');

function data(over = {}) {
  return {
    lottery: 'mega-sena',
    lotteryNumber: 2890,
    voucher: 'vch-abc',
    email: 'a@b.com',
    games: [[7, 18, 35, 42, 51, 60], [1, 2, 3, 4, 5, 6]],
    ...over,
  };
}

test('buildConfirmationEmail retorna subject/html/text', () => {
  const m = buildConfirmationEmail(data());
  assert.ok(m.subject && m.html && m.text);
});

test('assunto traz a loteria e o concurso', () => {
  const m = buildConfirmationEmail(data());
  assert.match(m.subject, /2890/);
  assert.match(m.subject.toLowerCase(), /mega/);
});

test('html contém voucher, números e menção ao resultado por e-mail', () => {
  const m = buildConfirmationEmail(data());
  assert.match(m.html, /vch-abc/);
  assert.match(m.html, /60/);
  assert.match(m.html.toLowerCase(), /resultado/);
});

test('nomes das loterias são exibidos corretamente', () => {
  assert.match(buildConfirmationEmail(data({ lottery: 'lotofacil' })).subject, /Lotofácil/);
  assert.match(buildConfirmationEmail(data({ lottery: 'lotomania' })).subject, /Lotomania/);
});

test('formata dezenas com dois dígitos (lotomania 0 -> 00)', () => {
  const m = buildConfirmationEmail(data({ lottery: 'lotomania', games: [[0, 5, 99]] }));
  assert.match(m.html, /00/);
});
