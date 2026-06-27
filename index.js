const { DynamoDBClient, GetItemCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { SESv2Client } = require('@aws-sdk/client-sesv2');
const { randomUUID } = require('crypto');

const { validateBet, generateGames, buildGameDto } = require('./games');
const { resolveNextConcurso } = require('./concurso');
const { sendConfirmationEmail } = require('./mailer');
const { corsHeaders } = require('./cors');
const { getApiToken } = require('./secret');

const REGION = process.env.AWS_REGION || 'sa-east-1';
const dynamoDb = new DynamoDBClient({ region: REGION });
const sqs = new SQSClient({ region: REGION });
const ses = new SESv2Client({ region: REGION });

const DYNAMO_TABLE = process.env.DYNAMO_TABLE || 'LoteriasPredictiveData';
const SQS_QUEUE_URL = process.env.QUEUE_URL;
const RESULTS_API_URL = process.env.RESULTS_API_URL; // ex.: https://apiloterias.com.br/app/v2/resultado
const SES_SENDER = process.env.SES_SENDER || 'Loterias Sim <nao-responda@loteriassim.com.br>';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ||
    'https://loteriassim.com.br,https://www.loteriassim.com.br,http://localhost:3000').split(',');

exports.handler = async (event) => {
    console.log("Event:", JSON.stringify(event, null, 2));
    const path = event.resource || event.rawPath;
    const httpMethod = event.httpMethod || event.requestContext?.http?.method;
    const origin = event.headers?.origin || event.headers?.Origin;
    const headers = corsHeaders(origin, ALLOWED_ORIGINS);
    const json = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

    if (httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        if (httpMethod === 'GET' && path === '/sugestoes') {
            return await getSugestoes(json);
        }
        if (httpMethod === 'GET' && path === '/resultados') {
            return await getResultados(json);
        }
        if (httpMethod === 'POST' && path === '/jogos') {
            return await postJogos(JSON.parse(event.body || "{}"), json);
        }
        return json(404, { message: "Rota não encontrada" });
    } catch (error) {
        console.error("Erro inesperado:", error);
        return json(500, { message: "Erro interno no servidor." });
    }
};

async function getPrediction() {
    const data = await dynamoDb.send(new GetItemCommand({
        TableName: DYNAMO_TABLE,
        Key: { id: { S: 'LATEST_PREDICTION' } }
    }));
    return data.Item ? unmarshall(data.Item) : null;
}

async function getSugestoes(json) {
    const item = await getPrediction();
    if (!item) {
        return json(404, { message: "Nenhuma predição encontrada." });
    }
    return json(200, {
        timestamp: item.timestamp,
        suggestions: item.suggestions,
        stats: item.stats,
    });
}

async function getResultados(json) {
    const item = await getPrediction();
    if (!item || !item.latest_results) {
        return json(404, { message: "Nenhum resultado disponível." });
    }
    return json(200, {
        timestamp: item.timestamp,
        results: item.latest_results,
    });
}

async function postJogos(body, json) {
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
            token: await getApiToken(),
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

    // E-mail de confirmação (best-effort — não falha a requisição se o envio falhar)
    if (bet.email) {
        try {
            await sendConfirmationEmail(ses, SES_SENDER, bet.email, {
                lottery: bet.lottery, lotteryNumber, voucher, games,
            });
        } catch (e) {
            console.error("Falha ao enviar e-mail de confirmação:", e);
        }
    }

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
