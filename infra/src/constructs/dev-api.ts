import { Duration } from 'aws-cdk-lib';
import {
  AuthorizationType,
  CognitoUserPoolsAuthorizer,
  Cors,
  LambdaIntegration,
  MethodLoggingLevel,
  RestApi,
} from 'aws-cdk-lib/aws-apigateway';
import { UserPool } from 'aws-cdk-lib/aws-cognito';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { join } from 'path';

export interface DevApiProps {
  readonly userPool: UserPool;
  readonly logisticsTable: Table;
  readonly clickstreamTable: Table;
}

export class DevApi extends Construct {
  public readonly restApi: RestApi;
  public readonly productsHandler: NodejsFunction;
  public readonly healthHandler: NodejsFunction;

  constructor(scope: Construct, id: string, props: DevApiProps) {
    super(scope, id);

    this.productsHandler = this.createProductsHandler(props);
    this.healthHandler = this.createHealthHandler();
    this.grantPermissions(props);
    this.restApi = this.createRestApi(props.userPool);
  }

  private createProductsHandler(props: DevApiProps): NodejsFunction {
    return new NodejsFunction(this, 'ProductsHandler', {
      entry: join(__dirname, '../../../../packages/api-handlers/src/products/index.ts'),
      handler: 'productsHandler',
      runtime: Runtime.NODEJS_22_X,
      bundling: {
        minify: true,
        sourceMap: false,
        format: OutputFormat.CJS,
      },
      timeout: Duration.seconds(15),
      memorySize: 256,
      logRetention: RetentionDays.ONE_WEEK,
      environment: {
        LOGISTICS_TABLE: props.logisticsTable.tableName,
        CLICKSTREAM_TABLE: props.clickstreamTable.tableName,
        DEV_MODE: 'true',
      },
    });
  }

  private createHealthHandler(): NodejsFunction {
    return new NodejsFunction(this, 'HealthHandler', {
      entry: join(__dirname, '../../../../packages/api-handlers/src/health/index.ts'),
      handler: 'healthHandler',
      runtime: Runtime.NODEJS_22_X,
      bundling: {
        minify: true,
        sourceMap: false,
        format: OutputFormat.CJS,
      },
      timeout: Duration.seconds(10),
      memorySize: 128,
      logRetention: RetentionDays.ONE_WEEK,
    });
  }

  private grantPermissions(props: DevApiProps): void {
    props.logisticsTable.grantReadWriteData(this.productsHandler);
    props.clickstreamTable.grantReadWriteData(this.productsHandler);
  }

  private createRestApi(userPool: UserPool): RestApi {
    const api = new RestApi(this, 'PlatformApi', {
      restApiName: 'D2C Platform API (Dev)',
      cloudWatchRole: true,
      defaultCorsPreflightOptions: {
        allowOrigins: Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'POST', 'OPTIONS'],
      },
      deployOptions: {
        metricsEnabled: true,
        loggingLevel: MethodLoggingLevel.INFO,
        dataTraceEnabled: false,
        tracingEnabled: false,
        throttlingBurstLimit: 50,
        throttlingRateLimit: 25,
      },
    });

    const authorizer = new CognitoUserPoolsAuthorizer(this, 'ApiAuthorizer', {
      cognitoUserPools: [userPool],
    });

    const productsIntegration = new LambdaIntegration(this.productsHandler);
    const healthIntegration = new LambdaIntegration(this.healthHandler);

    const products = api.root.addResource('products');
    products.addMethod('GET', productsIntegration, {
      authorizationType: AuthorizationType.COGNITO,
      authorizer,
    });
    products.addMethod('POST', productsIntegration, {
      authorizationType: AuthorizationType.COGNITO,
      authorizer,
    });

    const health = api.root.addResource('health');
    health.addMethod('GET', healthIntegration);

    return api;
  }
}
