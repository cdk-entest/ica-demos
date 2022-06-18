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
import * as fs from "fs";

// =================== simulated on-prem workshop ============================
export class SimulatedOnPremFromWorkShop extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    new cloudformation_include.CfnInclude(this, "SimulatedOnPrem", {
      templateFile: "./lib/simulated-on-prem.yaml",
    });
  }
}

// ============================= simulated on-prem============================
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
