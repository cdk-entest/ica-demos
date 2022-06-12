#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { DynamodbDaxStack } from "../lib/dynamodb-dax-stack";

const app = new cdk.App();

// create dax cluster
new DynamodbDaxStack(app, "DynamodbDaxStack", {
  vpcName: "MyNetworkStack/VpcWithS3Endpoint",
  vpcId: "vpc-07cafc6a819930727",
  env: {
    region: process.env.CDK_DEFAULT_REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
  }
});
