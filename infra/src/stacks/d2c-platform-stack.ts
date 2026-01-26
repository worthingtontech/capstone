import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import { Port } from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { Api, Auth, Database, Frontend, Networking, Search, Vpn, Waf } from '../constructs';

export class D2cPlatformStack extends Stack {
  public readonly frontendBucketNameOutput: CfnOutput;
  public readonly frontendDistributionIdOutput: CfnOutput;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const networking = new Networking(this, 'Networking', {
      maxAzs: 2,
      natGateways: 1,
    });

    this.configureSecurityGroupRules(networking);

    const waf = new Waf(this, 'Waf');

    const database = new Database(this, 'Database', {
      vpc: networking.vpc,
      securityGroup: networking.databaseSecurityGroup,
    });

    const search = new Search(this, 'Search', {
      vpc: networking.vpc,
      securityGroup: networking.opensearchSecurityGroup,
    });

    const auth = new Auth(this, 'Auth');

    const frontend = new Frontend(this, 'Frontend', {
      webAclId: waf.cloudfrontWebAclArn,
    });

    const api = new Api(this, 'Api', {
      vpc: networking.vpc,
      securityGroup: networking.lambdaSecurityGroup,
      userPool: auth.userPool,
      logisticsTable: database.logisticsTable,
      clickstreamTable: database.clickstreamTable,
      inventoryDb: database.inventoryDb,
      searchDomain: search.domain,
      webAclArn: waf.apiWebAclArn,
    });

    new Vpn(this, 'Vpn', { vpc: networking.vpc });

    const outputs = this.createOutputs(frontend, api, auth, database);
    this.frontendBucketNameOutput = outputs.frontendBucketNameOutput;
    this.frontendDistributionIdOutput = outputs.frontendDistributionIdOutput;
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

  private createOutputs(frontend: Frontend, api: Api, auth: Auth, database: Database): {
    frontendBucketNameOutput: CfnOutput;
    frontendDistributionIdOutput: CfnOutput;
  } {
    new CfnOutput(this, 'FrontendUrl', {
      value: `https://${frontend.distribution.domainName}`,
    });

    const frontendBucketNameOutput = new CfnOutput(this, 'FrontendBucketName', {
      value: frontend.bucket.bucketName,
    });

    const frontendDistributionIdOutput = new CfnOutput(this, 'FrontendDistributionId', {
      value: frontend.distribution.distributionId,
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

    return { frontendBucketNameOutput, frontendDistributionIdOutput };
  }
}
