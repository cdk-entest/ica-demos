import {
  aws_ec2,
  aws_iam,
  CfnOutput,
  cloudformation_include,
  Fn,
  Stack,
  StackProps,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import { v4 as uuidv4 } from "uuid";
import * as fs from "fs";

// ========================== Simulated OnPrem ===========================
export class SimulatedOnPremFromWorkShop extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    const template = new cloudformation_include.CfnInclude(
      this,
      "SimulatedOnPrem",
      {
        templateFile: "./lib/simulated-on-prem.yaml",
      }
    );
  }
}

// ========================== Simulated OnPrem ==========================
export interface SimulatedOnPremProps {
  readonly prefix?: string;
  readonly cidr?: string;
  readonly cidrMask?: number;
}

export class SimulatedOnPrem extends Construct {
  public readonly eip: aws_ec2.CfnEIP;
  public readonly vpc: aws_ec2.Vpc;

  constructor(scope: Construct, id: string, props: SimulatedOnPremProps) {
    super(scope, id);

    // elastic ip
    this.eip = new aws_ec2.CfnEIP(this, "onPremEip");
    const allocationId = Fn.getAtt(this.eip.logicalId, "AllocationId");

    // create a vpc with public subnet
    this.vpc = new aws_ec2.Vpc(this, props.prefix!.concat("-VPC").toString(), {
      cidr: props.cidr,
      maxAzs: 1,
      subnetConfiguration: [
        {
          cidrMask: props.cidrMask,
          name: props.prefix!.concat("-VPC | Public"),
          subnetType: aws_ec2.SubnetType.PUBLIC,
        },
      ],
    });

    // role for ec2
    const role = new aws_iam.Role(this, "RoleForEc2OpenSwan", {
      roleName: "RoleForEc2OpenSwan",
      assumedBy: new aws_iam.ServicePrincipal("ec2.amazonaws.com"),
    });

    // security group for ec2
    const sg = new aws_ec2.SecurityGroup(this, "SecurityGroupForEc2OpenSwan", {
      securityGroupName: "SecurityGroupForEc2OpenSwan",
      vpc: this.vpc,
    });

    sg.addIngressRule(aws_ec2.Peer.anyIpv4(), aws_ec2.Port.udp(53));

    sg.addIngressRule(aws_ec2.Peer.anyIpv4(), aws_ec2.Port.tcp(22));

    // ec2 openswan as customer router
    const ec2 = new aws_ec2.Instance(this, "Ec2OpenSwan", {
      instanceName: "Ec2OpenSwan",
      instanceType: aws_ec2.InstanceType.of(
        aws_ec2.InstanceClass.T2,
        aws_ec2.InstanceSize.MEDIUM
      ),
      machineImage: new aws_ec2.AmazonLinuxImage({
        cpuType: aws_ec2.AmazonLinuxCpuType.X86_64,
        generation: aws_ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      vpc: this.vpc,
      vpcSubnets: {
        subnetType: aws_ec2.SubnetType.PUBLIC,
      },
      role: role,
      securityGroup: sg,
    });

    // ec2 add user data
    ec2.addUserData(fs.readFileSync("./lib/user-data.sh", "utf8"));

    // output
    new CfnOutput(this, "eipAllocationId", {
      description: "EIP allocation ID",
      exportName: "eipAllocationId",
      value: allocationId.toString(),
    });
  }
}

// ========================== VPC with EC2 ==========================
export interface VpcWithEc2Props {
  readonly prefix?: string;
  readonly cidr?: string;
  readonly cidrMask?: number;
  readonly transitGateway?: aws_ec2.CfnTransitGateway;
  readonly ec2Role?: aws_iam.IRole;
}

export class VpcWithEc2 extends Construct {
  public readonly vpc: aws_ec2.Vpc;
  public readonly securityGroup: aws_ec2.SecurityGroup;
  public readonly subnetIds: string[] = [];

  constructor(scope: Construct, id: string, props: VpcWithEc2Props = {}) {
    super(scope, id);

    // vpc with isolated subnet
    this.vpc = new aws_ec2.Vpc(this, props.prefix!.concat("-VPC").toString(), {
      vpcName: props.prefix!.concat("-VPC"),
      cidr: props.cidr,
      maxAzs: 1,
      subnetConfiguration: [
        {
          cidrMask: props.cidrMask,
          name: props.prefix!.concat("-VPC | ISOLATED"),
          subnetType: aws_ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    // populate subnets ids
    this.vpc.isolatedSubnets.forEach((subnet) =>
      this.subnetIds.push(subnet.subnetId)
    );

    // security group for ec2
    this.securityGroup = new aws_ec2.SecurityGroup(
      this,
      props.prefix!.concat("-SG").toString(),
      {
        vpc: this.vpc,
        description: "Allow ICMP ping and HTTPS",
      }
    );

    // allow inbound ICMP ping
    this.securityGroup.addIngressRule(
      aws_ec2.Peer.anyIpv4(),
      aws_ec2.Port.allIcmp(),
      "Allow ICMP"
    );

    // vpc endpoints ssm (3 needed)
    new aws_ec2.InterfaceVpcEndpoint(
      this,
      props.prefix!.concat("-SSM").toString(),
      {
        service: aws_ec2.InterfaceVpcEndpointAwsService.SSM,
        vpc: this.vpc,
        privateDnsEnabled: true,
        subnets: this.vpc.selectSubnets({
          subnetType: aws_ec2.SubnetType.PRIVATE_ISOLATED,
        }),
      }
    );

    new aws_ec2.InterfaceVpcEndpoint(
      this,
      props.prefix!.concat("-SSM-MESSAGES").toString(),
      {
        service: aws_ec2.InterfaceVpcEndpointAwsService.SSM_MESSAGES,
        vpc: this.vpc,
        privateDnsEnabled: true,
        subnets: this.vpc.selectSubnets({
          subnetType: aws_ec2.SubnetType.PRIVATE_ISOLATED,
        }),
      }
    );

    new aws_ec2.InterfaceVpcEndpoint(
      this,
      props.prefix!.concat("-EC2-MESSAGES").toString(),
      {
        service: aws_ec2.InterfaceVpcEndpointAwsService.EC2_MESSAGES,
        vpc: this.vpc,
        privateDnsEnabled: true,
        subnets: this.vpc.selectSubnets({
          subnetType: aws_ec2.SubnetType.PRIVATE_ISOLATED,
        }),
      }
    );

    // create ec2
    const ec2 = new aws_ec2.Instance(
      this,
      props.prefix!.concat("-Instance").toString(),
      {
        instanceType: aws_ec2.InstanceType.of(
          aws_ec2.InstanceClass.T2,
          aws_ec2.InstanceSize.MICRO
        ),
        role: props.ec2Role,
        securityGroup: this.securityGroup,
        vpc: this.vpc,
        machineImage: new aws_ec2.AmazonLinuxImage({
          cpuType: aws_ec2.AmazonLinuxCpuType.X86_64,
          generation: aws_ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
        }),
      }
    );

    ec2.node.addDependency(this.vpc);

    // output vpcid
    new CfnOutput(this, props.prefix!.concat("-VPCId").toString(), {
      description: "VPCId for the evironemt",
      exportName: props.prefix!.concat("VPCId").toString(),
      value: this.vpc.vpcId,
    });
  }
}

// ========================== Transit Gateway ==========================
interface GatewayProps extends StackProps {
  prefix?: string;
  amazonSideAsn?: number;
  onPremIpAddress?: string;
  customerSideAsn?: number;
}

export class Gateway extends Stack {
  public readonly cfnTransitGateway: aws_ec2.CfnTransitGateway;
  public readonly cfnCustomerGateway: aws_ec2.CfnCustomerGateway;
  public readonly cfnVPNConnection: aws_ec2.CfnVPNConnection;

  constructor(scope: Construct, id: string, props: GatewayProps) {
    super(scope, id, props);

    // create an TGW
    this.cfnTransitGateway = new aws_ec2.CfnTransitGateway(
      this,
      props.prefix!.concat("-TGW").toString(),
      {
        amazonSideAsn: props.amazonSideAsn,
        description: "TGW for hybrid networking",
        autoAcceptSharedAttachments: "enable",
        defaultRouteTableAssociation: "enable",
        defaultRouteTablePropagation: "enable",
        dnsSupport: "enable",
        vpnEcmpSupport: "enable",
        multicastSupport: "enable",
        tags: [
          {
            key: "Name",
            value: props.prefix!.concat("-TGW").toString(),
          },
        ],
      }
    );

    // create a customer gateway
    this.cfnCustomerGateway = new aws_ec2.CfnCustomerGateway(
      this,
      props.prefix!.concat("-CGW").toString(),
      {
        bgpAsn: props.customerSideAsn!,
        ipAddress: props.onPremIpAddress!,
        type: "ipsec.1",
        tags: [
          {
            key: "Name",
            value: props.prefix!.concat("-CGW").toString(),
          },
        ],
      }
    );

    // create the site-to-site VPN connection
    this.cfnVPNConnection = new aws_ec2.CfnVPNConnection(
      this,
      props.prefix!.concat("-VPN").toString(),
      {
        transitGatewayId: this.cfnTransitGateway.ref,
        customerGatewayId: this.cfnCustomerGateway.ref,
        staticRoutesOnly: false,
        type: "ipsec.1",
        tags: [
          {
            key: "Name",
            value: props.prefix!.concat("-VPN").toString(),
          },
        ],
      }
    );

    // outputs
    new CfnOutput(this, "transitGatewayId", {
      description: "Transit Gateway ID",
      exportName: "TransitGatewayId",
      value: this.cfnTransitGateway.ref,
    });

    new CfnOutput(this, "customerGatewayId", {
      description: "Customer Gateway ID",
      exportName: "CustomerGatewayId",
      value: this.cfnCustomerGateway.ref,
    });

    new CfnOutput(this, "vpnConnectionId", {
      description: "VPN Connection ID",
      exportName: "VPNConnectionId",
      value: this.cfnVPNConnection.ref,
    });
  }
}

// ========================== VPC Subnet Routing ==========================
export interface SubnetRoutingProps {
  readonly prefix?: string;
  readonly vpc?: aws_ec2.IVpc;
  readonly transitGateway?: aws_ec2.CfnTransitGateway;
}

export class SubnetRouting extends Construct {
  constructor(scope: Construct, id: string, props: SubnetRoutingProps = {}) {
    super(scope, id);

    // add routing to vpc subnets
    for (var subnet of props.vpc!.isolatedSubnets) {
      var route = new aws_ec2.CfnRoute(
        this,
        props.prefix!.concat(uuidv4()).concat("-tgw-route").toString(),
        {
          destinationCidrBlock: "0.0.0.0/0",
          routeTableId: subnet.routeTable.routeTableId,
          transitGatewayId: props.transitGateway!.ref,
        }
      );
      route.addDependsOn(props.transitGateway!);
    }
  }
}

// ========================== TGW routes & attachment ==========================
interface TgwRouteAttachmentProps extends StackProps {
  prefix: string;
  transitGateway: aws_ec2.CfnTransitGateway;
  developmentVpc: aws_ec2.Vpc;
  productionVpc: aws_ec2.Vpc;
}

export class TgwRouteAttachment extends Stack {
  public readonly cfnTransitGatewayRouteTable: aws_ec2.CfnTransitGatewayRouteTable;

  constructor(scope: Construct, id: string, props: TgwRouteAttachmentProps) {
    super(scope, id, props);

    // tgw route table
    this.cfnTransitGatewayRouteTable = new aws_ec2.CfnTransitGatewayRouteTable(
      this,
      props.prefix!.concat("-RouteTable").toString(),
      {
        transitGatewayId: props.transitGateway.ref,
        tags: [
          {
            key: "Name",
            value: props.prefix!.concat("-RouteTable").toString(),
          },
        ],
      }
    );

    // create development tgw-development-vpc-attachment
    const tgwDevVpcAttachment = new aws_ec2.CfnTransitGatewayAttachment(
      this,
      props.prefix!.concat("dev-vpc-tgw-attachment").toString(),
      {
        transitGatewayId: props.transitGateway.ref,
        vpcId: props.developmentVpc.vpcId,
        subnetIds: props.developmentVpc.isolatedSubnets.map(
          (subnet) => subnet.subnetId
        ),
        tags: [
          {
            key: "Name",
            value: props.prefix!.concat("dev-vpc-tgw-attachment").toString(),
          },
        ],
      }
    );

    // create development tgw-production-vpc-attachment
    const tgwProdVpcAttachment = new aws_ec2.CfnTransitGatewayAttachment(
      this,
      props.prefix!.concat("prod-vpc-tgw-attachment").toString(),
      {
        transitGatewayId: props.transitGateway.ref,
        vpcId: props.productionVpc.vpcId,
        subnetIds: props.productionVpc.isolatedSubnets.map(
          (subnet) => subnet.subnetId
        ),
        tags: [
          {
            key: "Name",
            value: props.prefix!.concat("prod-vpc-tgw-attachment").toString(),
          },
        ],
      }
    );

    // development-vpc-attachment and tgw-table association
    const tgwDevVpcAttRoutTableAssociation =
      new aws_ec2.CfnTransitGatewayRouteTableAssociation(
        this,
        "dev-vpc-attachment-tgw-route-table-association",
        {
          transitGatewayRouteTableId: this.cfnTransitGatewayRouteTable.ref,
          transitGatewayAttachmentId: tgwDevVpcAttachment.ref,
        }
      );

    // production-vpc-attachment and tgw-table association
    const tgwProdVpcAttRoutTableAssociation =
      new aws_ec2.CfnTransitGatewayRouteTableAssociation(
        this,
        "prod-vpc-attachment-tgw-route-table-association",
        {
          transitGatewayRouteTableId: this.cfnTransitGatewayRouteTable.ref,
          transitGatewayAttachmentId: tgwProdVpcAttachment.ref,
        }
      );

    // dev-vpc-attachment tgw-propogation
    new aws_ec2.CfnTransitGatewayRouteTablePropagation(
      this,
      "dev-vpc-attachment-tgw-route-table-propogation",
      {
        transitGatewayRouteTableId: this.cfnTransitGatewayRouteTable.ref,
        transitGatewayAttachmentId: tgwDevVpcAttachment.ref,
      }
    );

    // prod-vpc-attachment tgw-propogation
    new aws_ec2.CfnTransitGatewayRouteTablePropagation(
      this,
      "prod-vpc-attachment-tgw-route-table-propogation",
      {
        transitGatewayRouteTableId: this.cfnTransitGatewayRouteTable.ref,
        transitGatewayAttachmentId: tgwProdVpcAttachment.ref,
      }
    );

    // development vpc subnets route update
    for (var subnet of props.developmentVpc.isolatedSubnets) {
      var route = new aws_ec2.CfnRoute(this, "RouteToProdVpcDepartment", {
        routeTableId: subnet.routeTable.routeTableId,
        // vpc cidr here
        destinationCidrBlock: props.productionVpc.vpcCidrBlock,
        transitGatewayId: props.transitGateway.ref,
      });
      // route.addDependsOn(vpcDevTgwAttach);
      route.addDependsOn(tgwDevVpcAttachment);
    }

    // production vpc subnets route update
    for (var subnet of props.productionVpc.isolatedSubnets) {
      var route = new aws_ec2.CfnRoute(this, "RouteToDevVpcDepartment", {
        routeTableId: subnet.routeTable.routeTableId,
        // vpc cidr here
        destinationCidrBlock: props.developmentVpc.vpcCidrBlock,
        transitGatewayId: props.transitGateway.ref,
      });
      // route.addDependsOn(vpcDevTgwAttach);
      route.addDependsOn(tgwDevVpcAttachment);
    }
  }
}
