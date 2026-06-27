#!/bin/bash
# Deploy da API (Lambda loterias-sim-api). Uso:
#   ./aws-deploy.sh create   -> cria a função (primeira vez)
#   ./aws-deploy.sh update   -> atualiza apenas o código (padrão)
set -euo pipefail

ACTION="${1:-update}"
FUNCTION="loterias-sim-api"
REGION="sa-east-1"
ROLE_ARN="arn:aws:iam::585482653811:role/loterias-sim-lambda-role"
QUEUE_URL="https://sqs.sa-east-1.amazonaws.com/585482653811/loterias-app-queue"
RESULTS_API_URL="https://apiloterias.com.br/app/v2/resultado"
# RESULTS_API_TOKEN deve vir do Secrets Manager/SSM em produção (ver roadmap, Fase 0.3)
RESULTS_API_TOKEN="${RESULTS_API_TOKEN:-CHANGE_ME}"

echo "1. Instalando dependências..."
npm install

echo "2. Rodando testes..."
npm test

echo "3. Empacotando a API..."
rm -f api-function.zip
zip -r api-function.zip index.js games.js concurso.js mailer.js package.json node_modules >/dev/null

SES_SENDER="${SES_SENDER:-Loterias Sim <nao-responda@loteriassim.com.br>}"
ENV_VARS="DYNAMO_TABLE=LoteriasPredictiveData,QUEUE_URL=$QUEUE_URL,RESULTS_API_URL=$RESULTS_API_URL,RESULTS_API_TOKEN=$RESULTS_API_TOKEN,SES_SENDER=$SES_SENDER"

if [ "$ACTION" = "create" ]; then
  echo "4. Criando a função Lambda ($FUNCTION)..."
  aws lambda create-function \
      --function-name "$FUNCTION" \
      --runtime nodejs20.x \
      --role "$ROLE_ARN" \
      --handler index.handler \
      --zip-file fileb://api-function.zip \
      --environment "Variables={$ENV_VARS}" \
      --timeout 15 --memory-size 256 --region "$REGION"
  echo "Criada! Configure um HTTP API no API Gateway apontando para esta Lambda."
else
  echo "4. Atualizando código da função ($FUNCTION)..."
  aws lambda update-function-code \
      --function-name "$FUNCTION" \
      --zip-file fileb://api-function.zip --region "$REGION"
  echo "5. Atualizando variáveis de ambiente..."
  aws lambda update-function-configuration \
      --function-name "$FUNCTION" \
      --environment "Variables={$ENV_VARS}" --region "$REGION"
  echo "Atualizada!"
fi
