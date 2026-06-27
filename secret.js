'use strict';

// Lê o token da API do Secrets Manager (se SECRET_NAME setado), com fallback para a
// env var RESULTS_API_TOKEN. Migração segura: funciona antes e depois do secret existir.

const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

let _cache;

async function getApiToken(client, useCache = true) {
  if (useCache && _cache !== undefined) return _cache;

  let value;
  const name = process.env.SECRET_NAME;
  if (name) {
    try {
      const sm = client || new SecretsManagerClient({ region: process.env.AWS_REGION || 'sa-east-1' });
      const res = await sm.send(new GetSecretValueCommand({ SecretId: name }));
      value = res.SecretString;
    } catch (e) {
      value = undefined; // fallback p/ env
    }
  }
  if (value === undefined) value = process.env.RESULTS_API_TOKEN;

  if (useCache) _cache = value;
  return value;
}

module.exports = { getApiToken };
