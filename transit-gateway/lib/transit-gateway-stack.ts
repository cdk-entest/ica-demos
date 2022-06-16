import { aws_ec2, aws_iam, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";

interface VpcNetworkSackProps extends StackProps {
  cidr: string;
  asn: number;
}

export class VpcNetworkSack extends Stack {
  public readonly vpc: aws_ec2.Vpc;
  public readonly tgw: aws_ec2.CfnTransitGateway;

  constructor(scope: Construct, id: string, props: VpcNetworkSackProps) {
    super(scope, id, props);

    // create a vpc
    this.vpc = new aws_ec2.Vpc(this, "VpcTgwDemo", {
      vpcName: "VpcTgwDemo",
      maxAzs: 1,
      cidr: props.cidr,
      subnetConfiguration: [
        {
          cidrMask: 25,
          name: "Isolated",
          subnetType: aws_ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    // transit gateway
    this.tgw = new aws_ec2.CfnTransitGateway(this, "TgwDemo", {
      // 64512 to 65534 for 16-bit ASNs. The default is 64512.
      amazonSideAsn: props.asn,
      autoAcceptSharedAttachments: "enable",
      defaultRouteTableAssociation: "enable",
      defaultRouteTablePropagation: "enable",
    });

    // tgw attachment vpc
    const tgwAttachment = new aws_ec2.CfnTransitGatewayAttachment(
      this,
      "TgwAttach",
      {
        transitGatewayId: this.tgw.ref,
        vpcId: this.vpc.vpcId,
        subnetIds: this.vpc.isolatedSubnets.map((subnet) => subnet.subnetId),
      }
    );

    // vpc s3 gateway endpoint
    new aws_ec2.InterfaceVpcEndpoint(this, "SsmVpcEndpoint", {
      service: aws_ec2.InterfaceVpcEndpointAwsService.SSM,
      privateDnsEnabled: true,
      vpc: this.vpc,
    });

    new aws_ec2.InterfaceVpcEndpoint(this, "Ec2Message", {
      service: aws_ec2.InterfaceVpcEndpointAwsService.EC2_MESSAGES,
      privateDnsEnabled: true,
      vpc: this.vpc,
    });

    new aws_ec2.InterfaceVpcEndpoint(this, "SsmMessage", {
      service: aws_ec2.InterfaceVpcEndpointAwsService.SSM_MESSAGES,
      privateDnsEnabled: true,
      vpc: this.vpc,
    });
  }
}

interface Ec2StackProps extends StackProps {
  vpcNetworkStack: VpcNetworkSack;
}

export class Ec2Stack extends Stack {
  constructor(scope: Construct, id: string, props: Ec2StackProps) {
    super(scope, id, props);

    // role for ec2
    const role = new aws_iam.Role(this, "RoleForEc2TgwDemo", {
      roleName: `RoleForEc2Ec2TgwDemo${this.region}`,
      assumedBy: new aws_iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonSSMManagedInstanceCore"
        ),
      ],
      description: "this is a custome role for assuming ssm role",
    });

    // security group
    const sg = new aws_ec2.SecurityGroup(this, "SecurityGroupForEc2TgwDemo", {
      securityGroupName: "SecurityGroupForEc2TgwDemo",
      vpc: props.vpcNetworkStack.vpc,
    });

    sg.addIngressRule(aws_ec2.Peer.anyIpv4(), aws_ec2.Port.allIcmp());

    // ec2 instance
    new aws_ec2.Instance(this, "Ec2InstanceTgwDemo", {
      vpc: props.vpcNetworkStack.vpc,
      instanceType: aws_ec2.InstanceType.of(
        aws_ec2.InstanceClass.BURSTABLE3_AMD,
        aws_ec2.InstanceSize.NANO
      ),
      machineImage: new aws_ec2.AmazonLinuxImage({
        generation: aws_ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      securityGroup: sg,
      role: role,
    });

    // nice looop default route on the subnets to tgw
    for (var subnet of props.vpcNetworkStack.vpc.isolatedSubnets) {
      new aws_ec2.CfnRoute(this, "Route", {
        routeTableId: subnet.routeTable.routeTableId,
        destinationCidrBlock: "0.0.0.0/0",
        transitGatewayId: props.vpcNetworkStack.tgw.ref,
      });
    }
  }
}

interface TgwPeeringProps extends StackProps {
  transitGatewayId: string;
  peerTransitGatewayId: string;
  peerRegion: string;
  peerAccountId: string;
}

export class TgwPeering extends Stack {
  constructor(scope: Construct, id: string, props: TgwPeeringProps) {
    super(scope, id, props);

    new aws_ec2.CfnTransitGatewayPeeringAttachment(
      this,
      "TransitGatewayPeeringAttachmentDemo",
      {
        transitGatewayId: props.transitGatewayId,
        peerTransitGatewayId: props.transitGatewayId,
        peerRegion: props.peerRegion,
        peerAccountId: props.peerAccountId,
      }
    );
  }
}

interface TgwRouteTableProps extends StackProps {
  routeTableId: string; 
  attachmentId: string; 
  destCidr: string; 
}

export class TgwRouteTable extends Stack {
  constructor(scope: Construct, id: string, props: TgwRouteTableProps) {
    super(scope, id, props);

    new aws_ec2.CfnTransitGatewayRoute(
      this,
      `TgwRoutTable-${this.region}`,
      {
        transitGatewayRouteTableId: props.routeTableId,
        blackhole: false,
        destinationCidrBlock: props.destCidr,
        transitGatewayAttachmentId: props.attachmentId
      }
    )

  }
}
