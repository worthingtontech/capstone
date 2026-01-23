import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import {
  AuthorizationType,
  CognitoUserPoolsAuthorizer,
  Cors,
  LambdaIntegration,
  RestApi,
} from 'aws-cdk-lib/aws-apigateway';
import { UserPool } from 'aws-cdk-lib/aws-cognito';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { SecurityGroup, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Domain } from 'aws-cdk-lib/aws-opensearchservice';
import { DatabaseInstance } from 'aws-cdk-lib/aws-rds';
import { Construct } from 'constructs';

export interface ApiProps {
  readonly vpc: Vpc;
  readonly securityGroup: SecurityGroup;
  readonly userPool: UserPool;
  readonly logisticsTable: Table;
  readonly clickstreamTable: Table;
  readonly inventoryDb: DatabaseInstance;
  readonly searchDomain: Domain;
}

export class Api extends Construct {
  public readonly restApi: RestApi;
  public readonly handler: NodejsFunction;

  constructor(scope: Construct, id: string, props: ApiProps) {
    super(scope, id);

    this.handler = this.createHandler(props);
    this.grantPermissions(props);
    this.restApi = this.createRestApi(props.userPool);
  }

  private createHandler(props: ApiProps): NodejsFunction {
    const logGroup = new LogGroup(this, 'ApiHandlerLogs', {
      retention: RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const handler = new NodejsFunction(this, 'ApiHandler', {
      entry: '../packages/api-handlers/src/products/index.ts',
      handler: 'productsHandler',
      runtime: Runtime.NODEJS_20_X,
      bundling: {
        minify: true,
        sourceMap: false,
        format: OutputFormat.CJS,
      },
      vpc: props.vpc,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_ISOLATED },
      securityGroups: [props.securityGroup],
      timeout: Duration.seconds(15),
      memorySize: 128,
      logGroup,
      environment: {
        LOGISTICS_TABLE: props.logisticsTable.tableName,
        CLICKSTREAM_TABLE: props.clickstreamTable.tableName,
        INVENTORY_DB_SECRET_ARN: props.inventoryDb.secret?.secretArn ?? '',
        INVENTORY_DB_HOST: props.inventoryDb.instanceEndpoint.hostname,
        INVENTORY_DB_PORT: props.inventoryDb.instanceEndpoint.port.toString(),
        INVENTORY_DB_NAME: 'inventory',
        OPENSEARCH_ENDPOINT: props.searchDomain.domainEndpoint,
      },
    });

    return handler;
  }

  private grantPermissions(props: ApiProps): void {
    props.logisticsTable.grantReadWriteData(this.handler);
    props.clickstreamTable.grantReadWriteData(this.handler);
    props.inventoryDb.grantConnect(this.handler);

    if (props.inventoryDb.secret) {
      props.inventoryDb.secret.grantRead(this.handler);
    }

    props.searchDomain.addAccessPolicies(
      new PolicyStatement({
        actions: ['es:ESHttp*'],
        resources: [`${props.searchDomain.domainArn}/*`],
        principals: [this.handler.grantPrincipal],
      }),
    );

    this.handler.addToRolePolicy(
      new PolicyStatement({
        actions: ['es:ESHttp*'],
        resources: [`${props.searchDomain.domainArn}/*`],
      }),
    );
  }

  private createRestApi(userPool: UserPool): RestApi {
    const api = new RestApi(this, 'PlatformApi', {
      restApiName: 'D2C Platform API',
      defaultCorsPreflightOptions: {
        allowOrigins: Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'POST', 'OPTIONS'],
      },
    });

    const authorizer = new CognitoUserPoolsAuthorizer(this, 'ApiAuthorizer', {
      cognitoUserPools: [userPool],
    });

    const lambdaIntegration = new LambdaIntegration(this.handler);

    const products = api.root.addResource('products');
    products.addMethod('GET', lambdaIntegration, {
      authorizationType: AuthorizationType.COGNITO,
      authorizer,
    });
    products.addMethod('POST', lambdaIntegration, {
      authorizationType: AuthorizationType.COGNITO,
      authorizer,
    });

    const health = api.root.addResource('health');
    health.addMethod('GET', lambdaIntegration);

    return api;
  }
}
