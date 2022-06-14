#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import {
  DmsVpcRole,
  MysqlAuroraMigrationStack,
} from "../lib/msql-aurora-migration-stack";

const app = new cdk.App();
new MysqlAuroraMigrationStack(app, "MysqlAuroraMigrationStack", {
  vpcName: "MyNetworkStack/VpcWithS3Endpoint",
  vpcId: "vpc-07cafc6a819930727",
  amiImage: "ami-08c6f23674b803e33",
  keyPair: "haimtranEc2KeyPair",
  env: {
    region: process.env.CDK_DEFAULT_REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});

// dms-vpc-role
new DmsVpcRole(app, "DmsVpcRoleStack", {
  env: {
    region: process.env.CDK_DEFAULT_REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});
