#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import {
  DatabaseStack,
  DmsMigrationStack,
} from "../lib/msql-aurora-migration-stack";

//
const app = new cdk.App();

// create a based db stack
const db = new DatabaseStack(app, "DatabaseBasedStack", {
  vpcId: "vpc-07cafc6a819930727",
  vpcName: "MyNetworkStack/VpcWithS3Endpoint",
  amiImage: "ami-08c6f23674b803e33",
  keyPair:  "haimtranEc2KeyPair",
  dbName: "exampledb",
  env: {
    region: process.env.CDK_DEFAULT_REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});

// create a db migration stack
new DmsMigrationStack(app, "DmsMigrationDemoStack", {
  vpcId: "vpc-07cafc6a819930727",
  vpcName: "MyNetworkStack/VpcWithS3Endpoint",
  dbStack: db,
  env: {
    region: process.env.CDK_DEFAULT_REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});
