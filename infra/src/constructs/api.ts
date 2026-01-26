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
import { SecurityGroup, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Domain } from 'aws-cdk-lib/aws-opensearchservice';
import { DatabaseInstance } from 'aws-cdk-lib/aws-rds';
import { CfnWebACLAssociation } from 'aws-cdk-lib/aws-wafv2';
import { Construct } from 'constructs';
import { join } from 'path';

export interface ApiProps {
  readonly vpc: Vpc;
  readonly securityGroup: SecurityGroup;
  readonly userPool: UserPool;
  readonly logisticsTable: Table;
  readonly clickstreamTable: Table;
  readonly inventoryDb: DatabaseInstance;
  readonly searchDomain: Domain;
  readonly webAclArn?: string;
}

export class Api extends Construct {
  public readonly restApi: RestApi;
  public readonly productsHandler: NodejsFunction;
  public readonly healthHandler: NodejsFunction;

  constructor(scope: Construct, id: string, props: ApiProps) {
    super(scope, id);

    this.productsHandler = this.createProductsHandler(props);
    this.healthHandler = this.createHealthHandler(props);
    this.grantPermissions(props);
    this.restApi = this.createRestApi(props.userPool);

    if (props.webAclArn) {
      new CfnWebACLAssociation(this, 'ApiWebAclAssociation', {
        resourceArn: this.restApi.deploymentStage.stageArn,
        webAclArn: props.webAclArn,
      });
    }
  }

  private createProductsHandler(props: ApiProps): NodejsFunction {
    return new NodejsFunction(this, 'ProductsHandler', {
      entry: join(__dirname, '../../../packages/api-handlers/src/products/index.ts'),
      handler: 'productsHandler',
      runtime: Runtime.NODEJS_22_X,
      bundling: {
        minify: true,
        sourceMap: false,
        format: OutputFormat.CJS,
      },
      vpc: props.vpc,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [props.securityGroup],
      timeout: Duration.seconds(15),
      memorySize: 512,
      logRetention: RetentionDays.ONE_MONTH,
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
  }

  private createHealthHandler(props: ApiProps): NodejsFunction {
    return new NodejsFunction(this, 'HealthHandler', {
      entry: join(__dirname, '../../../packages/api-handlers/src/health/index.ts'),
      handler: 'healthHandler',
      runtime: Runtime.NODEJS_22_X,
      bundling: {
        minify: true,
        sourceMap: false,
        format: OutputFormat.CJS,
      },
      vpc: props.vpc,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [props.securityGroup],
      timeout: Duration.seconds(10),
      memorySize: 128,
      logRetention: RetentionDays.ONE_MONTH,
    });
  }

  private grantPermissions(props: ApiProps): void {
    props.logisticsTable.grantReadWriteData(this.productsHandler);
    props.clickstreamTable.grantReadWriteData(this.productsHandler);
    props.inventoryDb.grantConnect(this.productsHandler);

    if (props.inventoryDb.secret) {
      props.inventoryDb.secret.grantRead(this.productsHandler);
    }

    props.searchDomain.addAccessPolicies(
      new PolicyStatement({
        actions: ['es:ESHttp*'],
        resources: [`${props.searchDomain.domainArn}/*`],
        principals: [this.productsHandler.grantPrincipal],
      }),
    );

    this.productsHandler.addToRolePolicy(
      new PolicyStatement({
        actions: ['es:ESHttp*'],
        resources: [`${props.searchDomain.domainArn}/*`],
      }),
    );
  }

  private createRestApi(userPool: UserPool): RestApi {
    const api = new RestApi(this, 'PlatformApi', {
      restApiName: 'D2C Platform API',
      cloudWatchRole: true,
      defaultCorsPreflightOptions: {
        allowOrigins: Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'POST', 'OPTIONS'],
      },
      deployOptions: {
        metricsEnabled: true,
        loggingLevel: MethodLoggingLevel.INFO,
        dataTraceEnabled: false,
        tracingEnabled: true,
        throttlingBurstLimit: 100,
        throttlingRateLimit: 50,
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
