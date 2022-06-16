#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import {
  Ec2Stack,
  VpcNetworkSack,
  VpcPeerConnection,
} from "../lib/transit-gateway-stack";

const app = new cdk.App();

// network stack us-east-1
const networkStackUsEast1 = new VpcNetworkSack(app, "VpcNetworkSackUsEast1", {
  asn: 64512,
  cidr: "172.16.0.0/24",
  env: {
    region: "us-east-1",
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});

// network us-west-1
const networkStackUsWest1 = new VpcNetworkSack(app, "VpcNetworkStackUsWest1", {
  asn: 64513,
  cidr: "172.16.1.0/24",
  env: {
    region: "us-west-1",
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});

// ec2 us-east-1
const ec2UsEast1 = new Ec2Stack(app, "Ec2StackUsEast1", {
  vpcNetworkStack: networkStackUsEast1,
  env: {
    region: "us-east-1",
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});

ec2UsEast1.addDependency(networkStackUsEast1);

// ec us-west-1
const ec2UsWest1 = new Ec2Stack(app, "Ec2StackUsWest1", {
  vpcNetworkStack: networkStackUsWest1,
  env: {
    region: "us-west-1",
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});

ec2UsWest1.addDependency(networkStackUsWest1);

// twg peering attachment here
const peer = new VpcPeerConnection(app, "TransitGatewayPeering", {
  transitGatewayId: networkStackUsEast1.tgw.ref,
  peerTransitGatewayId: "tgw-03119c6197818d92e",
  peerRegion: "us-west-1",
  peerAccountId: process.env.CDK_DEFAULT_ACCOUNT!.toString(),
  env: {
    region: "us-east-1",
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});
