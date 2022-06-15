#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import {
  DatabaseStack,
  DmsMigrationStack,
  DmsVpcRole,
} from "../lib/msql-aurora-migration-stack";

const app = new cdk.App();

// create source and target databases
const dbStack = new DatabaseStack(app, "DatabaseStack", {
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

// dms migration
new DmsMigrationStack(app, "DmsMigrationStack", {
  vpcId: "vpc-07cafc6a819930727",
  vpcName: "MyNetworkStack/VpcWithS3Endpoint",
  dbStack: dbStack,
  env: {
    region: process.env.CDK_DEFAULT_REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});
