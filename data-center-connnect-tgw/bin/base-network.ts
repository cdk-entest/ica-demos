import { App } from "aws-cdk-lib";
import { BaseNetworkStack } from "../lib/base-network-stack";
import { SimulatedOnPremFromWorkShop } from "../lib/simulated-on-prem";
import { Gateway, TgwRouteAttachment } from "../lib/transit-gateway-routes";
import * as config from "../params.json";

const cfnParams: Record<string, Record<string, any>> = config;

// region to deploy
const REGION = "us-east-1";

// create an app
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

// tgw, cgw, vpn-connection
const gateway = new Gateway(app, "TgwAndVpnAndCgw", {
  prefix: "TGW-",
  amazonSideAsn: cfnParams[REGION].AmazonSideAsn,
  onPremIpAddress: "54.210.184.138",
  customerSideAsn: cfnParams[REGION].CustomerSideAsn,
  env: {
    region: REGION,
  },
});

// tgw route table, tgw-attachments, vpc-subnet-routing
new TgwRouteAttachment(app, "TgwRouteAttachment", {
  prefix: "TGW-",
  transitGateway: gateway.cfnTransitGateway,
  developmentVpc: baseNetwork.developmentVpc.vpc,
  productionVpc: baseNetwork.productionVpc.vpc,
  env: {
    region: REGION,
  },
});
