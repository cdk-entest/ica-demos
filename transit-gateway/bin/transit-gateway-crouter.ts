import * as cdk from "aws-cdk-lib";
import { TgwCentralRouter } from "../lib/transit-gateway-crouter";
import { Ec2Stack, VpcNetworkSack } from "../lib/transit-gateway-stack";

const app = new cdk.App();

// vpc for test department
const vpcTestDepartment = new VpcNetworkSack(app, "VpcForTestDepartment", {
  asn: 64512,
  cidr: "172.1.0.0/16",
  env: {
    region: "us-east-1",
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});

// vpc for dev department
const vpcDevDepartment = new VpcNetworkSack(app, "VpcForDevDepartment", {
  asn: 64513,
  cidr: "172.2.0.0/16",
  env: {
    region: "us-east-1",
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});

// ec2 for test department
const ec2TestDepartment = new Ec2Stack(app, "Ec2ForTestDepartment", {
  vpcNetworkStack: vpcTestDepartment,
  env: {
    region: "us-east-1",
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});

// ec2 for dev department
const ec2DevDepartment = new Ec2Stack(app, "Ec2ForDevDepartment", {
  vpcNetworkStack: vpcDevDepartment,
  env: {
    region: "us-east-1",
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});

// tgw as central router
new TgwCentralRouter(app, "TgwCentralRouter", {
  vpcTestDepartment: vpcTestDepartment.vpc,
  vpcDevDepartment: vpcDevDepartment.vpc,
  env: {
    region: "us-east-1",
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});
