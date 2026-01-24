import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import {
  AttributeType,
  BillingMode,
  Table,
  TableEncryption,
} from 'aws-cdk-lib/aws-dynamodb';
import {
  InstanceClass,
  InstanceSize,
  InstanceType,
  SecurityGroup,
  SubnetType,
  Vpc,
} from 'aws-cdk-lib/aws-ec2';
import {
  Credentials,
  DatabaseInstance,
  DatabaseInstanceEngine,
  ParameterGroup,
  PostgresEngineVersion,
} from 'aws-cdk-lib/aws-rds';
import { Construct } from 'constructs';

export interface DatabaseProps {
  readonly vpc: Vpc;
  readonly securityGroup: SecurityGroup;
}

export class Database extends Construct {
  public readonly logisticsTable: Table;
  public readonly clickstreamTable: Table;
  public readonly inventoryDb: DatabaseInstance;

  constructor(scope: Construct, id: string, props: DatabaseProps) {
    super(scope, id);

    this.logisticsTable = this.createLogisticsTable();
    this.clickstreamTable = this.createClickstreamTable();
    this.inventoryDb = this.createInventoryDatabase(props.vpc, props.securityGroup);
  }

  private createLogisticsTable(): Table {
    return new Table(this, 'LogisticsPreferencesTable', {
      partitionKey: { name: 'customerId', type: AttributeType.STRING },
      sortKey: { name: 'preferenceType', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      encryption: TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: false,
      removalPolicy: RemovalPolicy.DESTROY,
    });
  }

  private createClickstreamTable(): Table {
    return new Table(this, 'ClickstreamTable', {
      partitionKey: { name: 'sessionId', type: AttributeType.STRING },
      sortKey: { name: 'eventTimestamp', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      encryption: TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: false,
      timeToLiveAttribute: 'expiresAt',
      removalPolicy: RemovalPolicy.DESTROY,
    });
  }

  private createInventoryDatabase(vpc: Vpc, securityGroup: SecurityGroup): DatabaseInstance {
    const parameterGroup = new ParameterGroup(this, 'InventoryDbParameters', {
      engine: DatabaseInstanceEngine.postgres({ version: PostgresEngineVersion.VER_15_3 }),
      parameters: {
        'rds.force_ssl': '1',
      },
    });

    return new DatabaseInstance(this, 'InventoryDb', {
      engine: DatabaseInstanceEngine.postgres({ version: PostgresEngineVersion.VER_15_3 }),
      instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.MEDIUM),
      vpc,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
      credentials: Credentials.fromGeneratedSecret('inventory_admin'),
      databaseName: 'inventory',
      multiAz: true,
      allocatedStorage: 100,
      maxAllocatedStorage: 200,
      storageEncrypted: true,
      iamAuthentication: true,
      backupRetention: Duration.days(0),
      deletionProtection: false,
      publiclyAccessible: false,
      parameterGroup,
      securityGroups: [securityGroup],
      removalPolicy: RemovalPolicy.DESTROY,
    });
  }
}
