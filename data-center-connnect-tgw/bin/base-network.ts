import { App, aws_iam, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  Gateway,
  SimulatedOnPremFromWorkShop,
  TgwRouteAttachment,
  VpcWithEc2,
} from "../lib";
import * as config from "./data/params.json";

const cfnParams: Record<string, Record<string, any>> = config;

// region to deploy
const REGION = "us-east-1";

export class BaseNetworkStack extends Stack {
  public readonly developmentVpc: VpcWithEc2;
  public readonly productionVpc: VpcWithEc2;
  public readonly ec2Role: aws_iam.IRole;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // ec2 role
    this.ec2Role = new aws_iam.Role(this, "svcRoleForEc2ViaSsm", {
      assumedBy: new aws_iam.ServicePrincipal("ec2.amazonaws.com"),
      description: "Service role for EC2 access via SSM session manager",
      managedPolicies: [
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonSSMManagedInstanceCore"
        ),
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonSSMPatchAssociation"
        ),
      ],
    });

    // vpc-ec2 for dev development
    this.developmentVpc = new VpcWithEc2(this, "Development", {
      prefix: "Development",
      cidr: cfnParams[this.region].DevelopmentCidr,
      cidrMask: cfnParams[this.region].CidrMask,
      ec2Role: this.ec2Role,
    });

    // vpc-ec2 prod department
    this.productionVpc = new VpcWithEc2(this, "Production", {
      prefix: "Production",
      cidr: cfnParams[this.region].ProductionCidr,
      cidrMask: cfnParams[this.region].CidrMask,
      ec2Role: this.ec2Role,
    });
  }
}

const app = new App();

// simulated on-prem network
const simulatedOnPrem = new SimulatedOnPremFromWorkShop(
  app,
  "SimulatedOnPremFromWorkShop",
  {
    env: {
      region: REGION,
    },
  }
);

// aws based network
const baseNetwork = new BaseNetworkStack(app, "AwsBaseNetwork", {
  env: {
    region: REGION,
  },
  description: "Builds the base resources for the TGW",
});

// tgw, vpn connection, customer router
const gateway = new Gateway(app, "TgwAndVpnAndCgw", {
  prefix: "TGW-",
  amazonSideAsn: cfnParams[REGION].AmazonSideAsn,
  onPremIpAddress: "54.210.184.138",
  customerSideAsn: cfnParams[REGION].CustomerSideAsn,
  env: {
    region: REGION,
  },
});

// tgw route table, attachment
new TgwRouteAttachment(app, "TgwRouteAttachment", {
  prefix: "TGW-",
  transitGateway: gateway.cfnTransitGateway,
  developmentVpc: baseNetwork.developmentVpc.vpc,
  productionVpc: baseNetwork.productionVpc.vpc,
  env: {
    region: REGION,
  },
});
