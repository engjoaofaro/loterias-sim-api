#!/bin/bash
# Script para deploy da API na AWS (Lambda)

echo "1. Instalando dependências (Node.js)..."
npm install

echo "2. Empacotando a API..."
zip -r api-function.zip index.js package.json node_modules

echo "3. Criando a função Lambda na AWS (loterias-sim-api)..."
# Substituir ROLE_ARN por uma Role que tenha permissão para o DynamoDB e para SQS (sqs:SendMessage)
ROLE_ARN="arn:aws:iam::585482653811:role/loterias-sim-lambda-role"
QUEUE_URL="https://sqs.sa-east-1.amazonaws.com/585482653811/loterias-app-queue"

aws lambda create-function \
    --function-name loterias-sim-api \
    --runtime nodejs18.x \
    --role $ROLE_ARN \
    --handler index.handler \
    --zip-file fileb://api-function.zip \
    --environment "Variables={DYNAMO_TABLE=LoteriasPredictiveData,QUEUE_URL=$QUEUE_URL}" \
    --timeout 15 \
    --memory-size 256 \
    --region sa-east-1

echo "Deploy da Lambda concluído! Você precisará configurar um HTTP API no Amazon API Gateway apontando para esta Lambda para finalizar a exposição."
