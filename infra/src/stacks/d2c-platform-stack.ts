import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import { Port } from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { Api, Auth, Database, Frontend, Networking, Search } from '../constructs';

export class D2cPlatformStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const networking = new Networking(this, 'Networking', {
      maxAzs: 2,
    });

    this.configureSecurityGroupRules(networking);

    const database = new Database(this, 'Database', {
      vpc: networking.vpc,
      securityGroup: networking.databaseSecurityGroup,
    });

    const search = new Search(this, 'Search', {
      vpc: networking.vpc,
      securityGroup: networking.opensearchSecurityGroup,
    });

    const auth = new Auth(this, 'Auth');
    const frontend = new Frontend(this, 'Frontend');

    const api = new Api(this, 'Api', {
      vpc: networking.vpc,
      securityGroup: networking.lambdaSecurityGroup,
      userPool: auth.userPool,
      logisticsTable: database.logisticsTable,
      clickstreamTable: database.clickstreamTable,
      inventoryDb: database.inventoryDb,
      searchDomain: search.domain,
    });

    this.createOutputs(frontend, api, auth, database);
  }

  private configureSecurityGroupRules(networking: Networking): void {
    networking.databaseSecurityGroup.addIngressRule(
      networking.lambdaSecurityGroup,
      Port.tcp(5432),
      'Lambda access to inventory database',
    );

    networking.opensearchSecurityGroup.addIngressRule(
      networking.lambdaSecurityGroup,
      Port.tcp(443),
      'Lambda access to OpenSearch',
    );
  }

  private createOutputs(
    frontend: Frontend,
    api: Api,
    auth: Auth,
    database: Database,
  ): void {
    new CfnOutput(this, 'FrontendUrl', {
      value: `https://${frontend.distribution.domainName}`,
    });

    new CfnOutput(this, 'FrontendBucketName', {
      value: frontend.bucket.bucketName,
    });

    new CfnOutput(this, 'ApiUrl', {
      value: api.restApi.url,
    });

    new CfnOutput(this, 'UserPoolId', {
      value: auth.userPool.userPoolId,
    });

    new CfnOutput(this, 'UserPoolClientId', {
      value: auth.userPoolClient.userPoolClientId,
    });

    new CfnOutput(this, 'InventoryDbSecretArn', {
      value: database.inventoryDb.secret?.secretArn ?? 'NotCreated',
    });
  }
}
