const { DynamoDBClient, GetItemCommand } = require('@aws-sdk/client-dynamodb');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');

const dynamoDb = new DynamoDBClient({ region: 'sa-east-1' });
const sqs = new SQSClient({ region: 'sa-east-1' });

const DYNAMO_TABLE = process.env.DYNAMO_TABLE || 'LoteriasPredictiveData';
const SQS_QUEUE_URL = process.env.QUEUE_URL;

exports.handler = async (event) => {
    console.log("Event:", JSON.stringify(event, null, 2));
    const path = event.resource || event.rawPath;
    const httpMethod = event.httpMethod || event.requestContext?.http?.method;
    
    // Headers CORS
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "OPTIONS,POST,GET"
    };

    if (httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        if (httpMethod === 'GET' && path === '/sugestoes') {
            const params = {
                TableName: DYNAMO_TABLE,
                Key: { id: { S: 'LATEST_PREDICTION' } }
            };
            const data = await dynamoDb.send(new GetItemCommand(params));
            if (!data.Item) {
                return { statusCode: 404, headers, body: JSON.stringify({ message: "Nenhuma predição encontrada." }) };
            }
            // Parse and format DynamoDB format to plain JSON
            const unmarshalled = {
                timestamp: data.Item.timestamp?.S,
                suggestions: data.Item.suggestions?.M,
                stats: data.Item.stats?.M
            };
            return { statusCode: 200, headers, body: JSON.stringify(unmarshalled) };
        }

        if (httpMethod === 'POST' && path === '/jogos') {
            const body = JSON.parse(event.body || "{}");
            
            // Expected body shape matches loterias-app-validator expectations
            const sqsParams = {
                QueueUrl: SQS_QUEUE_URL,
                MessageBody: JSON.stringify(body)
            };
            
            await sqs.send(new SendMessageCommand(sqsParams));
            
            return { 
                statusCode: 200, 
                headers, 
                body: JSON.stringify({ message: "Jogos enviados para simulação com sucesso!", id: new Date().getTime() }) 
            };
        }

        return { statusCode: 404, headers, body: JSON.stringify({ message: "Rota não encontrada" }) };

    } catch (error) {
        console.error("Error:", error);
        return { statusCode: 500, headers, body: JSON.stringify({ message: "Erro interno no servidor." }) };
    }
};
