const { DynamoDBClient, GetItemCommand } = require('@aws-sdk/client-dynamodb');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { randomUUID } = require('crypto');

const { validateBet, generateGames, buildGameDto } = require('./games');
const { resolveNextConcurso } = require('./concurso');

const REGION = process.env.AWS_REGION || 'sa-east-1';
const dynamoDb = new DynamoDBClient({ region: REGION });
const sqs = new SQSClient({ region: REGION });

const DYNAMO_TABLE = process.env.DYNAMO_TABLE || 'LoteriasPredictiveData';
const SQS_QUEUE_URL = process.env.QUEUE_URL;
const RESULTS_API_URL = process.env.RESULTS_API_URL; // ex.: https://apiloterias.com.br/app/v2/resultado
const RESULTS_API_TOKEN = process.env.RESULTS_API_TOKEN;

const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "OPTIONS,POST,GET"
};

const json = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

exports.handler = async (event) => {
    console.log("Event:", JSON.stringify(event, null, 2));
    const path = event.resource || event.rawPath;
    const httpMethod = event.httpMethod || event.requestContext?.http?.method;

    if (httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        if (httpMethod === 'GET' && path === '/sugestoes') {
            return await getSugestoes();
        }

        if (httpMethod === 'POST' && path === '/jogos') {
            return await postJogos(JSON.parse(event.body || "{}"));
        }

        return json(404, { message: "Rota não encontrada" });
    } catch (error) {
        console.error("Erro inesperado:", error);
        return json(500, { message: "Erro interno no servidor." });
    }
};

async function getSugestoes() {
    const data = await dynamoDb.send(new GetItemCommand({
        TableName: DYNAMO_TABLE,
        Key: { id: { S: 'LATEST_PREDICTION' } }
    }));
    if (!data.Item) {
        return json(404, { message: "Nenhuma predição encontrada." });
    }
    return json(200, {
        timestamp: data.Item.timestamp?.S,
        suggestions: data.Item.suggestions?.M,
        stats: data.Item.stats?.M
    });
}

async function postJogos(body) {
    // 1. Valida a aposta (modalidade, dezenas por jogo, quantidade, e-mail)
    let bet;
    try {
        bet = validateBet(body);
    } catch (e) {
        return json(400, { message: e.message });
    }

    // 2. Resolve o próximo concurso da modalidade
    let lotteryNumber;
    try {
        lotteryNumber = await resolveNextConcurso({
            apiName: bet.config.apiName,
            apiUrl: RESULTS_API_URL,
            token: RESULTS_API_TOKEN,
        });
    } catch (e) {
        console.error("Falha ao resolver concurso:", e);
        return json(502, { message: "Não foi possível obter o concurso atual. Tente novamente em instantes." });
    }

    // 3. Gera os jogos (manuais opcionais + auto-geração)
    let games;
    try {
        games = generateGames(bet.config, bet.numbersPerGame, bet.gamesToGenerate, body.numbers);
    } catch (e) {
        return json(400, { message: e.message });
    }

    // 4. Monta o contrato canônico e publica na fila
    const voucher = randomUUID();
    const dto = buildGameDto({ lottery: bet.lottery, email: bet.email, lotteryNumber, voucher, games });

    await sqs.send(new SendMessageCommand({
        QueueUrl: SQS_QUEUE_URL,
        MessageBody: JSON.stringify(dto),
    }));

    return json(200, {
        message: "Jogos gerados e enviados para apuração com sucesso!",
        voucher,
        lottery: bet.lottery,
        gameType: bet.gameType,
        lotteryNumber,
        numbersPerGame: bet.numbersPerGame,
        games,
    });
}
