import {
  aws_ec2,
  aws_elasticache,
  CfnOutput,
  Stack,
  StackProps,
} from "aws-cdk-lib";
import { Construct } from "constructs";

interface RedisDynamodbStackProps extends StackProps {
  vscodeSecurityGroupId: string;
  vpcId: string;
  vpcName: string;
}

export class RedisDynamodbStack extends Stack {
  constructor(scope: Construct, id: string, props: RedisDynamodbStackProps) {
    super(scope, id, props);

    // get existed vpc
    const vpc = aws_ec2.Vpc.fromLookup(this, "Vpc", {
      vpcId: props.vpcId,
      vpcName: props.vpcName,
    });

    // subnet groups
    const subnetGroup = new aws_elasticache.CfnSubnetGroup(
      this,
      "SubnetGroupForRedisCluster",
      {
        subnetIds: vpc.privateSubnets.map((subnet) => subnet.subnetId),
        description: "subnet group for redis cluster",
      }
    );

    // redis security group
    const redisSecurityGroup = new aws_ec2.SecurityGroup(
      this,
      "SecurityGroupForRedisCluster",
      {
        securityGroupName: "SecurityGroupForRedisCluster",
        vpc: vpc,
      }
    );

    redisSecurityGroup.addIngressRule(
      // production SG peer
      aws_ec2.Peer.securityGroupId(props.vscodeSecurityGroupId),
      // redis port
      aws_ec2.Port.tcp(6379)
    );

    // elasticache for redis cluster
    const redis = new aws_elasticache.CfnCacheCluster(
      this,
      "RedisClusterDmoe",
      {
        clusterName: "RedisClusterDemo",
        engine: "redis",
        cacheNodeType: "cache.t3.small",
        numCacheNodes: 1,
        cacheSubnetGroupName: subnetGroup.ref,
        vpcSecurityGroupIds: [redisSecurityGroup.securityGroupId],
      }
    );

    // output
    new CfnOutput(this, "redis_endpoint", {
      value: redis.attrRedisEndpointAddress,
    });
  }
}
