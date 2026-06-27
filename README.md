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
| Runtime | Node.js (deploy: `nodejs20.x`) |
| Estilo | Handler Lambda "puro" + módulos de lógica pura testáveis (`games.js`, `concurso.js`) |
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
Recebe a aposta, **valida as regras da modalidade**, **gera os números**, resolve o
**próximo concurso**, cria um **voucher** e publica o `GameDto` canônico na fila **SQS
`loterias-app-queue`** (consumida pelo `loterias-app-validator`).

**Request:**
```json
{
  "lottery": "mega-sena | lotofacil | lotomania",
  "numbersPerGame": 6,            // valida min/max por modalidade
  "gamesToGenerate": 5,           // 1..100
  "email": "user@dominio.com",    // opcional (null = não recebe resultado)
  "numbers": null                  // opcional: jogos escolhidos pelo usuário [[..],..]
}
```
Regras por modalidade: **Mega-Sena** 6–20 de 01–60 · **Lotofácil** 15–20 de 01–25 ·
**Lotomania** 50 (fixo) de 00–99. Se `numbers` vier preenchido, esses jogos são
validados e o restante é completado por auto-geração até `gamesToGenerate`.

**Response 200:**
```json
{
  "message": "Jogos gerados e enviados para apuração com sucesso!",
  "voucher": "uuid-v4",
  "lottery": "mega-sena",
  "gameType": 1,
  "lotteryNumber": 2890,
  "numbersPerGame": 6,
  "games": [[7,18,35,42,51,60]]
}
```
- **400** → erro de validação (mensagem amigável em `message`).
- **502** → não foi possível resolver o concurso atual (API de resultados indisponível).

**GameDto publicado no SQS** (contrato consumido pela pipeline):
```json
{ "gameType": 1, "email": "user@dominio.com", "voucher": "uuid", "lotteryNumber": 2890, "games": [[7,18,35,42,51,60]] }
```

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
| `QUEUE_URL` | **sim** | — | URL da fila SQS escrita em `POST /jogos` |
| `RESULTS_API_URL` | **sim** | — | API de resultados p/ resolver o próximo concurso (`https://apiloterias.com.br/app/v2/resultado`) |
| `RESULTS_API_TOKEN` | **sim** | — | Token da API de resultados (mover para Secrets Manager — ver roadmap) |
| `AWS_REGION` | não | `sa-east-1` | Região dos clients AWS |

## Testes

Testes unitários (regras de geração/validação e resolução de concurso) com o runner
nativo do Node — sem dependências:

```bash
npm test    # node --test
```

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

O `aws-deploy.sh` roda os testes, empacota (`index.js`, `games.js`, `concurso.js`,
`node_modules`) e publica:

```bash
RESULTS_API_TOKEN=*** ./aws-deploy.sh create   # primeira vez (cria a função)
RESULTS_API_TOKEN=*** ./aws-deploy.sh update   # atualiza código + env vars (padrão)
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

- ✅ **Geração de jogos + contrato canônico** reintroduzidos (Fase 1 do roadmap):
  `POST /jogos` agora gera os números, resolve o concurso e cria o voucher.
- ⚠️ **Sem autenticação e CORS aberto (`*`):** a API é pública. Avaliar API key,
  authorizer (Cognito/Lambda) e restringir o CORS ao domínio `loteriassim.com.br`.
- 🔐 `RESULTS_API_TOKEN` deve sair da env var para o **Secrets Manager** (roadmap Fase 0.3).
- Erros 5xx retornam mensagem genérica — convém logar `requestId` e logging estruturado.
- Adicionar throttling no API Gateway e **DLQ** na fila SQS.
- Unmarshalling completo da resposta de `GET /sugestoes` (`@aws-sdk/util-dynamodb`).
