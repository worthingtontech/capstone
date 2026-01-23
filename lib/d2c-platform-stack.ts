import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as opensearch from 'aws-cdk-lib/aws-opensearchservice';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';

export class D2cPlatformStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const customerGatewayIp = new cdk.CfnParameter(this, 'CustomerGatewayIp', {
      type: 'String',
      description: 'Public IP of the on-premises VPN device.'
    });
    const customerGatewayAsn = new cdk.CfnParameter(this, 'CustomerGatewayAsn', {
      type: 'Number',
      description: 'BGP ASN for the on-premises VPN device.',
      default: 65000,
      minValue: 64512,
      maxValue: 65534
    });
    const onPremCidr = new cdk.CfnParameter(this, 'OnPremCidr', {
      type: 'String',
      description: 'On-premises CIDR range to route through the VPN (e.g. 10.10.0.0/16).'
    });

    const vpc = new ec2.Vpc(this, 'PlatformVpc', {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC
        },
        {
          name: 'private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
        }
      ]
    });

    vpc.addGatewayEndpoint('DynamoDbEndpoint', {
      service: ec2.GatewayVpcEndpointAwsService.DYNAMODB
    });
    vpc.addGatewayEndpoint('S3Endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3
    });
    vpc.addInterfaceEndpoint('SecretsManagerEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER
    });

    const lambdaSg = new ec2.SecurityGroup(this, 'LambdaSg', {
      vpc,
      description: 'Lambda access to backend services.',
      allowAllOutbound: true
    });
    const dbSg = new ec2.SecurityGroup(this, 'InventoryDbSg', {
      vpc,
      description: 'Inventory RDS security group.',
      allowAllOutbound: false
    });
    dbSg.addIngressRule(lambdaSg, ec2.Port.tcp(5432), 'Lambda access to inventory database.');

    const opensearchSg = new ec2.SecurityGroup(this, 'OpenSearchSg', {
      vpc,
      description: 'OpenSearch security group.',
      allowAllOutbound: false
    });
    opensearchSg.addIngressRule(lambdaSg, ec2.Port.tcp(443), 'Lambda access to OpenSearch.');

    const siteBucket = new s3.Bucket(this, 'FrontendBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    // CloudFront WAF must be deployed in us-east-1 when associating with CloudFront.
    const cloudfrontWebAcl = new wafv2.CfnWebACL(this, 'CloudFrontWebAcl', {
      scope: 'CLOUDFRONT',
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'CloudFrontWebAcl',
        sampledRequestsEnabled: true
      },
      rules: this.managedWafRules()
    });

    const oai = new cloudfront.OriginAccessIdentity(this, 'FrontendOai');
    siteBucket.grantRead(oai);

    const distribution = new cloudfront.Distribution(this, 'FrontendDistribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: new origins.S3Origin(siteBucket, { originAccessIdentity: oai }),
        compress: true,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS
      },
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5)
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5)
        }
      ],
      webAclId: cloudfrontWebAcl.attrArn
    });

    const logisticsTable = new dynamodb.Table(this, 'LogisticsPreferencesTable', {
      partitionKey: { name: 'customerId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'preferenceType', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    const clickstreamTable = new dynamodb.Table(this, 'ClickstreamTable', {
      partitionKey: { name: 'sessionId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'eventTimestamp', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true,
      timeToLiveAttribute: 'expiresAt',
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    const dbParameterGroup = new rds.ParameterGroup(this, 'InventoryDbParameters', {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_15_3 }),
      parameters: {
        'rds.force_ssl': '1'
      }
    });

    const inventoryDb = new rds.DatabaseInstance(this, 'InventoryDb', {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_15_3 }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      credentials: rds.Credentials.fromGeneratedSecret('inventory_admin'),
      databaseName: 'inventory',
      multiAz: true,
      allocatedStorage: 100,
      maxAllocatedStorage: 200,
      storageEncrypted: true,
      iamAuthentication: true,
      backupRetention: cdk.Duration.days(7),
      deletionProtection: true,
      publiclyAccessible: false,
      parameterGroup: dbParameterGroup,
      securityGroups: [dbSg],
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    const searchDomain = new opensearch.Domain(this, 'ProductSearchDomain', {
      version: opensearch.EngineVersion.OPENSEARCH_2_11,
      vpc,
      vpcSubnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
      securityGroups: [opensearchSg],
      enforceHttps: true,
      nodeToNodeEncryption: true,
      encryptionAtRest: { enabled: true },
      zoneAwareness: { enabled: true, availabilityZoneCount: 2 },
      capacity: {
        dataNodes: 2,
        dataNodeInstanceType: 't3.small.search'
      },
      ebs: {
        enabled: true,
        volumeSize: 20
      },
      logging: {
        appLogEnabled: true,
        slowIndexLogEnabled: true,
        slowSearchLogEnabled: true
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    const apiLambdaRole = new iam.Role(this, 'ApiLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com')
    });
    apiLambdaRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
    );
    apiLambdaRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole')
    );

    const apiHandler = new lambda.Function(this, 'ApiHandler', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(
        "exports.handler = async () => ({ statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) });"
      ),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSg],
      role: apiLambdaRole,
      timeout: cdk.Duration.seconds(15),
      memorySize: 512,
      logRetention: logs.RetentionDays.ONE_MONTH,
      environment: {
        LOGISTICS_TABLE: logisticsTable.tableName,
        CLICKSTREAM_TABLE: clickstreamTable.tableName,
        INVENTORY_DB_SECRET_ARN: inventoryDb.secret?.secretArn ?? '',
        INVENTORY_DB_HOST: inventoryDb.instanceEndpoint.hostname,
        INVENTORY_DB_PORT: inventoryDb.instanceEndpoint.port.toString(),
        INVENTORY_DB_NAME: 'inventory',
        OPENSEARCH_ENDPOINT: searchDomain.domainEndpoint
      }
    });

    logisticsTable.grantReadWriteData(apiHandler);
    clickstreamTable.grantReadWriteData(apiHandler);
    inventoryDb.grantConnect(apiHandler);
    if (inventoryDb.secret) {
      inventoryDb.secret.grantRead(apiHandler);
    }

    searchDomain.addAccessPolicies(
      new iam.PolicyStatement({
        actions: ['es:ESHttp*'],
        resources: [`${searchDomain.domainArn}/*`],
        principals: [apiLambdaRole]
      })
    );
    apiLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['es:ESHttp*'],
        resources: [`${searchDomain.domainArn}/*`]
      })
    );

    const userPool = new cognito.UserPool(this, 'CustomerUserPool', {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      mfa: cognito.Mfa.OPTIONAL,
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    const userPoolClient = userPool.addClient('CustomerAppClient', {
      authFlows: {
        userPassword: true,
        userSrp: true
      },
      preventUserExistenceErrors: true
    });

    const api = new apigateway.RestApi(this, 'PlatformApi', {
      restApiName: 'D2C Platform API',
      cloudWatchRole: true,
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'POST', 'OPTIONS']
      },
      deployOptions: {
        metricsEnabled: true,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: false,
        tracingEnabled: true,
        throttlingBurstLimit: 100,
        throttlingRateLimit: 50
      }
    });

    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'ApiAuthorizer', {
      cognitoUserPools: [userPool]
    });

    const products = api.root.addResource('products');
    const lambdaIntegration = new apigateway.LambdaIntegration(apiHandler);
    products.addMethod('GET', lambdaIntegration, {
      authorizationType: apigateway.AuthorizationType.COGNITO,
      authorizer
    });
    products.addMethod('POST', lambdaIntegration, {
      authorizationType: apigateway.AuthorizationType.COGNITO,
      authorizer
    });

    const health = api.root.addResource('health');
    health.addMethod('GET', lambdaIntegration);

    const apiWebAcl = new wafv2.CfnWebACL(this, 'ApiWebAcl', {
      scope: 'REGIONAL',
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'ApiWebAcl',
        sampledRequestsEnabled: true
      },
      rules: this.managedWafRules()
    });

    new wafv2.CfnWebACLAssociation(this, 'ApiWebAclAssociation', {
      resourceArn: api.deploymentStage.stageArn,
      webAclArn: apiWebAcl.attrArn
    });

    const vpnGateway = new ec2.CfnVPNGateway(this, 'VpnGateway', {
      type: 'ipsec.1'
    });
    const vpnAttachment = new ec2.CfnVPCGatewayAttachment(this, 'VpnGatewayAttachment', {
      vpcId: vpc.vpcId,
      vpnGatewayId: vpnGateway.ref
    });

    const customerGateway = new ec2.CfnCustomerGateway(this, 'CustomerGateway', {
      bgpAsn: customerGatewayAsn.valueAsNumber,
      ipAddress: customerGatewayIp.valueAsString,
      type: 'ipsec.1'
    });

    const vpnConnection = new ec2.CfnVPNConnection(this, 'VpnConnection', {
      customerGatewayId: customerGateway.ref,
      vpnGatewayId: vpnGateway.ref,
      type: 'ipsec.1',
      staticRoutesOnly: true
    });

    new ec2.CfnVPNConnectionRoute(this, 'VpnConnectionRoute', {
      vpnConnectionId: vpnConnection.ref,
      destinationCidrBlock: onPremCidr.valueAsString
    });

    const privateSubnets = vpc.selectSubnets({
      subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
    });
    privateSubnets.subnets.forEach((subnet, index) => {
      const routeTableId = (subnet as ec2.Subnet).routeTable.routeTableId;
      const route = new ec2.CfnRoute(this, `OnPremRoute${index}`, {
        routeTableId,
        destinationCidrBlock: onPremCidr.valueAsString,
        gatewayId: vpnGateway.ref
      });
      route.addDependency(vpnAttachment);
    });

    new cdk.CfnOutput(this, 'FrontendUrl', {
      value: `https://${distribution.domainName}`
    });
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url
    });
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId
    });
    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId
    });
    new cdk.CfnOutput(this, 'InventoryDbSecretArn', {
      value: inventoryDb.secret?.secretArn ?? 'NotCreated'
    });
  }

  private managedWafRules(): wafv2.CfnWebACL.RuleProperty[] {
    return [
      {
        name: 'AWSManagedRulesCommonRuleSet',
        priority: 0,
        statement: {
          managedRuleGroupStatement: {
            vendorName: 'AWS',
            name: 'AWSManagedRulesCommonRuleSet'
          }
        },
        overrideAction: { none: {} },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: 'CommonRuleSet',
          sampledRequestsEnabled: true
        }
      },
      {
        name: 'AWSManagedRulesKnownBadInputsRuleSet',
        priority: 1,
        statement: {
          managedRuleGroupStatement: {
            vendorName: 'AWS',
            name: 'AWSManagedRulesKnownBadInputsRuleSet'
          }
        },
        overrideAction: { none: {} },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: 'KnownBadInputs',
          sampledRequestsEnabled: true
        }
      },
      {
        name: 'AWSManagedRulesAmazonIpReputationList',
        priority: 2,
        statement: {
          managedRuleGroupStatement: {
            vendorName: 'AWS',
            name: 'AWSManagedRulesAmazonIpReputationList'
          }
        },
        overrideAction: { none: {} },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: 'IpReputation',
          sampledRequestsEnabled: true
        }
      },
      {
        name: 'AWSManagedRulesSQLiRuleSet',
        priority: 3,
        statement: {
          managedRuleGroupStatement: {
            vendorName: 'AWS',
            name: 'AWSManagedRulesSQLiRuleSet'
          }
        },
        overrideAction: { none: {} },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: 'SqlInjection',
          sampledRequestsEnabled: true
        }
      }
    ];
  }
}
