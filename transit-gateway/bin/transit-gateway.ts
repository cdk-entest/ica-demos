#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import {
  Ec2Stack,
  VpcNetworkSack,
  TgwPeering,
  TgwRouteTable,
} from "../lib/transit-gateway-stack";

const app = new cdk.App();

// ====================== STEP 2: NETWORK & EC2 ==================
// cidr for vpc in us-east-1
const US_EAST_1_CIDR = "172.16.0.0/24"; 
// cidr for vpc in us-west-1
const US_WEST_1_CIDR = "172.16.1.0/24";
// peer tgw id - us-west-1 tgw 
const PeerTransitGatewayId = "tgw-0ef15ea87e6086941"

// ====================== STEP 2: TGW PEER ======================
// tgw route table id - us-east-1
const RouteTableIdUsEast1 = "tgw-rtb-00d678638374ed0d8"
// tgw rout table id - us-west-1
const RouteTableIdWest1 = "tgw-rtb-0a830b0b8f65619ea"

// ====================== STEP 3: TGW PEER ======================
// tgw-peer attachment id - us-east-1
const TgwAttachmentIdUsEast1 = "tgw-attach-08cfff38699320f0a"
// tgw-peer attachment id - us-west-1
const TgwAttachmentIdUsWest1 = "tgw-attach-08cfff38699320f0a"


// network stack us-east-1
const networkStackUsEast1 = new VpcNetworkSack(app, "VpcNetworkSackUsEast1", {
  asn: 64512,
  cidr: US_EAST_1_CIDR,
  env: {
    region: "us-east-1",
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});

// network us-west-1
const networkStackUsWest1 = new VpcNetworkSack(app, "VpcNetworkStackUsWest1", {
  asn: 64513,
  cidr: US_WEST_1_CIDR,
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

// tgw peering attachment: us-east-1 to us-west-1 (acceptor)
const peer = new TgwPeering(app, "TransitGatewayPeering", {
  transitGatewayId: networkStackUsEast1.tgw.ref,
  peerTransitGatewayId: PeerTransitGatewayId,
  peerRegion: "us-west-1",
  peerAccountId: process.env.CDK_DEFAULT_ACCOUNT!.toString(),
  env: {
    region: "us-east-1",
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});


// acceptance manually 

// us-east-1 update tgw routes 
new TgwRouteTable(
  app, 
  "TgwRouteTableUsEast1",
  {
    routeTableId: RouteTableIdUsEast1,
    attachmentId: TgwAttachmentIdUsEast1,
    destCidr: US_WEST_1_CIDR,
    env: {
      region: "us-east-1",
    account: process.env.CDK_DEFAULT_ACCOUNT,
    }
  }
)

// us-west-1 update tgw routes 
new TgwRouteTable(
  app, 
  "TgwRouteTableUsWest1",
  {
    routeTableId: RouteTableIdWest1,
    attachmentId: TgwAttachmentIdUsWest1,
    destCidr: US_EAST_1_CIDR,
    env: {
      region: "us-west-1",
    account: process.env.CDK_DEFAULT_ACCOUNT,
    }
  }
)