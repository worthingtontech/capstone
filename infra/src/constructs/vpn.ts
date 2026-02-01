import { CfnParameter } from 'aws-cdk-lib';
import {
  CfnCustomerGateway,
  CfnRoute,
  CfnVPNConnection,
  CfnVPNConnectionRoute,
  CfnVPNGateway,
  CfnVPCGatewayAttachment,
  Subnet,
  SubnetType,
  Vpc,
} from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export interface VpnProps {
  readonly vpc: Vpc;
}

export class Vpn extends Construct {
  constructor(scope: Construct, id: string, props: VpnProps) {
    super(scope, id);

    const customerGatewayIp = new CfnParameter(this, 'CustomerGatewayIp', {
      type: 'String',
      description: 'Public IP of the on-premises VPN device.',
      default: '203.0.113.1',
    });
    const customerGatewayAsn = new CfnParameter(this, 'CustomerGatewayAsn', {
      type: 'Number',
      description: 'BGP ASN for the on-premises VPN device.',
      default: 65000,
      minValue: 64512,
      maxValue: 65534,
    });
    const onPremCidr = new CfnParameter(this, 'OnPremCidr', {
      type: 'String',
      description: 'On-premises CIDR range to route through the VPN (e.g. 10.10.0.0/16).',
      default: '10.10.0.0/16',
    });

    const vpnGateway = new CfnVPNGateway(this, 'VpnGateway', {
      type: 'ipsec.1',
    });
    const vpnAttachment = new CfnVPCGatewayAttachment(this, 'VpnGatewayAttachment', {
      vpcId: props.vpc.vpcId,
      vpnGatewayId: vpnGateway.ref,
    });

    const customerGateway = new CfnCustomerGateway(this, 'CustomerGateway', {
      bgpAsn: customerGatewayAsn.valueAsNumber,
      ipAddress: customerGatewayIp.valueAsString,
      type: 'ipsec.1',
    });

    const vpnConnection = new CfnVPNConnection(this, 'VpnConnection', {
      customerGatewayId: customerGateway.ref,
      vpnGatewayId: vpnGateway.ref,
      type: 'ipsec.1',
      staticRoutesOnly: true,
    });

    new CfnVPNConnectionRoute(this, 'VpnConnectionRoute', {
      vpnConnectionId: vpnConnection.ref,
      destinationCidrBlock: onPremCidr.valueAsString,
    });

    const privateSubnets = props.vpc.selectSubnets({
      subnetType: SubnetType.PRIVATE_WITH_EGRESS,
    });

    privateSubnets.subnets.forEach((subnet, index) => {
      const routeTableId = (subnet as Subnet).routeTable.routeTableId;
      const route = new CfnRoute(this, `OnPremRoute${index}`, {
        routeTableId,
        destinationCidrBlock: onPremCidr.valueAsString,
        gatewayId: vpnGateway.ref,
      });
      route.addDependency(vpnAttachment);
    });
  }
}
