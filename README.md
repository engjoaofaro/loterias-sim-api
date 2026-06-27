# loterias-sim-api

API HTTP (backend) do **Loterias Sim**, rodando como **AWS Lambda (Node.js)** atrás de
um **API Gateway HTTP**. É a ponte entre o frontend (`loterias-sim-web`) e o restante
do ecossistema serverless: lê as sugestões do motor estatístico e enfileira as
simulações de jogos do usuário.

> Parte do ecossistema **Loterias Sim**. Visão geral em [Arquitetura](#arquitetura-e-fluxo).

---

## Visão geral

| Item | Valor |
|------|-------|
| Runtime | Node.js (deploy atual: `nodejs18.x`) |
| Estilo | Handler Lambda "puro" (sem Express/serverless-http) |
| Handler | `index.handler` |
| Função Lambda | `loterias-sim-api` |
| API Gateway (HTTP) | `p49mq9wj2d` → `https://p49mq9wj2d.execute-api.sa-east-1.amazonaws.com` |
| Região | `sa-east-1` |
| SDK | AWS SDK v3 (`@aws-sdk/client-dynamodb`, `@aws-sdk/client-sqs`) |

---

## Rotas

### `GET /sugestoes`
Lê do DynamoDB (`LoteriasPredictiveData`) o item de chave `id = "LATEST_PREDICTION"`,
gravado pelo `loterias-ml-engine`, e devolve as sugestões/estatísticas.

- **200** → `{ "timestamp": "...", "suggestions": {...}, "stats": {...} }`
- **404** → `{ "message": "Nenhuma predição encontrada." }`

> Nota técnica: o item é devolvido **parcialmente no formato AttributeValue do
> DynamoDB** (mapas `M` aninhados não são totalmente "unmarshalled"). Considere usar
> `@aws-sdk/util-dynamodb#unmarshall` para entregar JSON limpo ao frontend.

### `POST /jogos`
Recebe o corpo JSON da simulação e o publica como mensagem na fila **SQS
`loterias-app-queue`**, que é consumida pelo `loterias-app-validator`.

- **200** → `{ "message": "Jogos enviados para simulação com sucesso!", "id": <epoch_ms> }`
- O corpo é repassado **sem validação de schema** (passthrough).

### `OPTIONS *`
Responde `200` para preflight CORS.

### Fallback
Qualquer outra rota → **404** `{ "message": "Rota não encontrada" }`.

**CORS:** `Access-Control-Allow-Origin: *`, métodos `OPTIONS,POST,GET`, header
`Content-Type`.

---

## Variáveis de ambiente

| Variável | Obrigatória | Padrão | Descrição |
|----------|:-----------:|--------|-----------|
| `DYNAMO_TABLE` | não | `LoteriasPredictiveData` | Tabela DynamoDB lida em `GET /sugestoes` |
| `QUEUE_URL` | **sim** | — | URL da fila SQS escrita em `POST /jogos` (`https://sqs.sa-east-1.amazonaws.com/585482653811/loterias-app-queue`) |

> A região (`sa-east-1`) está **fixa no código** (`index.js`). Para portar de
> ambiente/conta, externalize-a em variável de ambiente.

---

## Recursos AWS e permissões (IAM)

A role de execução (`loterias-sim-lambda-role`) precisa de:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["dynamodb:GetItem"],
      "Resource": "arn:aws:dynamodb:sa-east-1:585482653811:table/LoteriasPredictiveData" },
    { "Effect": "Allow", "Action": ["sqs:SendMessage"],
      "Resource": "arn:aws:sqs:sa-east-1:585482653811:loterias-app-queue" }
  ]
}
```

---

## Deploy

O `aws-deploy.sh` empacota e cria a função:

```bash
npm install
zip -r api-function.zip index.js package.json node_modules
aws lambda create-function \
  --function-name loterias-sim-api \
  --runtime nodejs18.x \
  --role arn:aws:iam::585482653811:role/loterias-sim-lambda-role \
  --handler index.handler \
  --zip-file fileb://api-function.zip \
  --timeout 15 --memory-size 256 --region sa-east-1 \
  --environment "Variables={DYNAMO_TABLE=LoteriasPredictiveData,QUEUE_URL=...}"
```

Para **atualizar** código já existente:

```bash
zip -r api-function.zip index.js package.json node_modules
aws lambda update-function-code --function-name loterias-sim-api \
  --zip-file fileb://api-function.zip --region sa-east-1
```

O wiring do API Gateway (rotas + permissão `lambda:InvokeFunction`) é feito pelo
script `final_deploy.sh` na raiz do diretório de repositórios.

---

## Arquitetura e fluxo

```
Frontend (Next.js)
   │  GET /sugestoes                         POST /jogos
   ▼                                            ▼
API Gateway HTTP (p49mq9wj2d) ──► loterias-sim-api (Lambda)
   │                                            │
   ▼ (leitura)                                  ▼ (escrita)
DynamoDB LoteriasPredictiveData          SQS loterias-app-queue
   ▲                                            │
   │ grava                                      ▼
loterias-ml-engine                  loterias-app-validator ─► Step Functions ─► loterias-app-core ─► SNS
```

---

## Pontos de atenção e melhorias

- ⚠️ **Mismatch de runtime:** o deploy usa `nodejs18.x`, mas o `package-lock.json`
  (AWS SDK v3 atual) pede **Node ≥ 20**. Migrar para `nodejs20.x`/`nodejs22.x`.
- ⚠️ **Sem autenticação e CORS aberto (`*`):** a API é pública. Avaliar API key,
  authorizer (Cognito/Lambda) e restringir o CORS ao domínio `loteriassim.com.br`.
- ⚠️ **Sem validação de schema** no `POST /jogos` — risco de mensagens inválidas
  poluindo a fila. Validar o corpo (ex.: `zod`/JSON Schema) antes do `SendMessage`.
- ⚠️ **Contrato divergente da web** (ver README do `loterias-sim-web`): o payload que
  chega de `POST /jogos` precisa bater com o esperado pelo `validator`.
- Erros retornam mensagem genérica `500` — bom para não vazar detalhes, mas convém
  logar `requestId` e usar logging estruturado.
- Adicionar throttling no API Gateway e DLQ na fila SQS.
- Unmarshalling completo da resposta de `GET /sugestoes`.
