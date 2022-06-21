#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { RedisDynamodbStack } from '../lib/redis-dynamodb-stack';

const app = new cdk.App();

// redis cluster 
new RedisDynamodbStack(app, 'RedisDynamodbStack', {
  vscodeSecurityGroupId: "sg-0de2e7b79ec68a6ce",
  vpcId: "vpc-07cafc6a819930727",
  vpcName: "MyNetworkStack/VpcWithS3Endpoint",
  env: {
    region: process.env.CDK_DEFAULT_REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
  }
});