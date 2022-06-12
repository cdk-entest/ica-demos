#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { RdsElasticRedisStack } from "../lib/rds-elastic-redis-stack";

const app = new cdk.App();

new RdsElasticRedisStack(app, "DynamodbDaxStack", {
  vpcName: "MyNetworkStack/VpcWithS3Endpoint",
  vpcId: "vpc-07cafc6a819930727",
  env: {
    region: process.env.CDK_DEFAULT_REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});
