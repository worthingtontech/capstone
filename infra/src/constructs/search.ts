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

    const isolatedSubnets = props.vpc.selectSubnets({
      subnetType: SubnetType.PRIVATE_ISOLATED,
    });

    this.domain = new Domain(this, 'ProductSearchDomain', {
      version: EngineVersion.OPENSEARCH_2_11,
      vpc: props.vpc,
      vpcSubnets: [{ subnets: [isolatedSubnets.subnets[0]] }],
      securityGroups: [props.securityGroup],
      enforceHttps: true,
      nodeToNodeEncryption: true,
      encryptionAtRest: { enabled: true },
      zoneAwareness: { enabled: false },
      capacity: {
        dataNodes: 1,
        dataNodeInstanceType: 't3.small.search',
      },
      ebs: {
        enabled: true,
        volumeSize: 10,
      },
      removalPolicy: RemovalPolicy.DESTROY,
    });
  }
}
