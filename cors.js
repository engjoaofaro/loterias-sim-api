'use strict';

// Resolve os headers CORS a partir da origem da requisição.
// Se a origem está na allowlist, ela é ecoada; caso contrário cai no domínio
// primário (allowed[0]), o que faz o navegador bloquear a resposta cross-origin.

function corsHeaders(requestOrigin, allowed) {
  const allow = allowed.includes(requestOrigin) ? requestOrigin : allowed[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
    'Vary': 'Origin',
  };
}

module.exports = { corsHeaders };
