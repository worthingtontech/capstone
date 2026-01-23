import { APIGatewayProxyResult } from 'aws-lambda';

export async function healthHandler(): Promise<APIGatewayProxyResult> {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }),
  };
}
