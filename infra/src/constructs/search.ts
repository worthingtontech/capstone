import { RemovalPolicy } from 'aws-cdk-lib';
import { SecurityGroup, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import { Domain, EngineVersion } from 'aws-cdk-lib/aws-opensearchservice';
import { Construct } from 'constructs';

export interface SearchProps {
  readonly vpc: Vpc;
  readonly securityGroup: SecurityGroup;
}

export class Search extends Construct {
  public readonly domain: Domain;

  constructor(scope: Construct, id: string, props: SearchProps) {
    super(scope, id);

    this.domain = new Domain(this, 'ProductSearchDomain', {
      version: EngineVersion.OPENSEARCH_2_11,
      vpc: props.vpc,
      vpcSubnets: [{ subnetType: SubnetType.PRIVATE_WITH_EGRESS }],
      securityGroups: [props.securityGroup],
      enforceHttps: true,
      nodeToNodeEncryption: true,
      encryptionAtRest: { enabled: true },
      zoneAwareness: { enabled: true, availabilityZoneCount: 2 },
      capacity: {
        dataNodes: 2,
        dataNodeInstanceType: 't3.small.search',
      },
      ebs: {
        enabled: true,
        volumeSize: 20,
      },
      logging: {
        appLogEnabled: true,
        slowIndexLogEnabled: true,
        slowSearchLogEnabled: true,
      },
      removalPolicy: RemovalPolicy.DESTROY,
    });
  }
}
