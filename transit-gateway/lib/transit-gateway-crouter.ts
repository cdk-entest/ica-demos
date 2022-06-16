import { aws_ec2, aws_iam, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";

interface VpcNetworkSackProps extends StackProps {
  cidr: string;
  asn: number;
}

export class VpcNetworkSackWoTgw extends Stack {
  public readonly vpc: aws_ec2.Vpc;

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

    // vpc endpoint ssm (need 3)
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
  vpcNetworkStack: VpcNetworkSackWoTgw;
}

export class Ec2Stack extends Stack {
  constructor(scope: Construct, id: string, props: Ec2StackProps) {
    super(scope, id, props);

    // role for ec2
    const role = new aws_iam.Role(this, "RoleForEc2TgwDemo", {
      roleName: `RoleForEc2Ec2TgwDemo${this.region}${props.vpcNetworkStack.vpc.vpcId}`,
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
  }
}

interface TgwCentralRouterProps extends StackProps {
  vpcTestDepartment: aws_ec2.Vpc;
  vpcDevDepartment: aws_ec2.Vpc;
}

export class TgwCentralRouter extends Stack {
  constructor(scope: Construct, id: string, props: TgwCentralRouterProps) {
    super(scope, id, props);

    // transigt gateway
    const tgw = new aws_ec2.CfnTransitGateway(
      this,
      "TransitGatewayCentralRouter",
      {
        // 64512 to 65534 for 16-bit ASNs. The default is 64512.
        amazonSideAsn: 64512,
        autoAcceptSharedAttachments: "enable",
        defaultRouteTableAssociation: "enable",
        defaultRouteTablePropagation: "enable",
      }
    );

    // tgw attachment vpc test department
    const vpcTestTgwAttach = new aws_ec2.CfnTransitGatewayAttachment(
      this,
      "TgwAttachmentVpcTestDepartment",
      {
        transitGatewayId: tgw.ref,
        vpcId: props.vpcTestDepartment.vpcId,
        subnetIds: props.vpcTestDepartment.isolatedSubnets.map(
          (subnet) => subnet.subnetId
        ),
      }
    );

    vpcTestTgwAttach.addDependsOn(tgw);

    // tgw attachment vpc dev department
    const vpcDevTgwAttach = new aws_ec2.CfnTransitGatewayAttachment(
      this,
      "TgwAttachmentVpcDevDepartment",
      {
        transitGatewayId: tgw.ref,
        vpcId: props.vpcDevDepartment.vpcId,
        subnetIds: props.vpcDevDepartment.isolatedSubnets.map(
          (subnet) => subnet.subnetId
        ),
      }
    );

    vpcDevTgwAttach.addDependsOn(tgw);

    // update routes in vpc test department
    for (var subnet of props.vpcTestDepartment.isolatedSubnets) {
      var route = new aws_ec2.CfnRoute(this, "RouteToDevVpcDepartment", {
        routeTableId: subnet.routeTable.routeTableId,
        // vpc cidr here
        destinationCidrBlock: props.vpcDevDepartment.vpcCidrBlock,
        transitGatewayId: tgw.ref,
      });
      // route.addDependsOn(vpcDevTgwAttach);
      route.addDependsOn(vpcTestTgwAttach);
    }

    // update routes in vpc test department
    for (var subnet of props.vpcDevDepartment.isolatedSubnets) {
      var route = new aws_ec2.CfnRoute(this, "RouteToTestVpcDepartment", {
        routeTableId: subnet.routeTable.routeTableId,
        // vpc cidr here
        destinationCidrBlock: props.vpcTestDepartment.vpcCidrBlock,
        transitGatewayId: tgw.ref,
      });
      route.addDependsOn(vpcDevTgwAttach);
      // route.addDependsOn(vpcTestTgwAttach);
    }
  }
}
