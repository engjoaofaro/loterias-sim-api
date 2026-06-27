# Loterias Sim API

Esta é a API central (Backend) do Loterias Sim Web.
Desenvolvida em Node.js (AWS Lambda).

## Rotas
- `GET /sugestoes`: Consulta a tabela do DynamoDB (`LoteriasPredictiveData`) onde o Motor de Machine Learning (ML Engine) deixa as predições de combinações de jogos calculadas.
- `POST /jogos`: Recebe as cartelas simuladas pelo usuário na Interface Web e empurra (Push) para a fila `loterias-app-queue` no Amazon SQS.

## Integração de Fluxo (Arquitetura)
Frontend (Next.js) --> **API Gateway (ESTA API)** --> 
1. (Leitura) DynamoDB `LoteriasPredictiveData`
2. (Escrita) SQS `loterias-app-queue` --> Fluxo Serverless Existente (Validator -> Step Functions -> Core)

## Variáveis de Ambiente
- `DYNAMO_TABLE`: Nome da tabela (Padrão: `LoteriasPredictiveData`)
- `QUEUE_URL`: URL da fila SQS atual (Obrigatório)
