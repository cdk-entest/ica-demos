import {
  aws_ec2,
  aws_elasticache,
  aws_iam,
  aws_rds,
  CfnOutput,
  RemovalPolicy,
  Stack,
  StackProps,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import * as fs from "fs";

interface RdsElasticRedisStackProps extends StackProps {
  vpcId: string;
  vpcName: string;
}

export class RdsElasticRedisStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: RdsElasticRedisStackProps
  ) {
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
        subnetIds: vpc.privateSubnets.map(
          (subnet) => subnet.subnetId
        ),
        description: "subnet group for redis cluster",
      }
    );

    // web app security group
    const webAppSecurityGroup = new aws_ec2.SecurityGroup(
      this,
      "SecurityGroupForRedisCulster",
      {
        securityGroupName: "SecurityGroupForRedisCulster",
        vpc: vpc,
      }
    );

    webAppSecurityGroup.addIngressRule(
      // production SG peer
      aws_ec2.Peer.anyIpv4(),
      // application port 8080
      aws_ec2.Port.tcp(8080)
    );

    // db security group
    const dbSecurityGroup = new aws_ec2.SecurityGroup(
      this,
      "SecurityGroupForDb",
      {
        securityGroupName: "SecurityGroupForDb",
        vpc: vpc,
      }
    );

    dbSecurityGroup.addIngressRule(
      aws_ec2.Peer.securityGroupId(
        webAppSecurityGroup.securityGroupId
      ),
      aws_ec2.Port.tcp(3306)
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
      aws_ec2.Peer.securityGroupId(
        webAppSecurityGroup.securityGroupId
      ),
      // redis port
      aws_ec2.Port.tcp(6379)
    );

    // rds mysql database
    const rds = new aws_rds.DatabaseInstance(
      this,
      "RdsDatabaseRedisDemo",
      {
        databaseName: "covid",
        deletionProtection: false,
        engine: aws_rds.DatabaseInstanceEngine.mysql({
          version: aws_rds.MysqlEngineVersion.VER_8_0_23,
        }),
        vpc,
        port: 3306,
        instanceType: aws_ec2.InstanceType.of(
          aws_ec2.InstanceClass.BURSTABLE3,
          aws_ec2.InstanceSize.MEDIUM
        ),
        // password generated and stored in secret-manager
        credentials: aws_rds.Credentials.fromGeneratedSecret(
          "admin",
          {
            secretName: "rds-secret-name",
          }
        ),
        // iam authentication
        iamAuthentication: true,
        // for testing => production retain
        removalPolicy: RemovalPolicy.DESTROY,
        // for testing => production true
        securityGroups: [dbSecurityGroup],
        storageEncrypted: false,
        // vpc subnet
        vpcSubnets: {
          subnetType: aws_ec2.SubnetType.PRIVATE_WITH_NAT,
        },
      }
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
        vpcSecurityGroupIds: [
          redisSecurityGroup.securityGroupId,
        ],
      }
    );

    // role for ec2
    const role = new aws_iam.Role(
      this,
      "RoleForEc2AccessRdsRedisDemo",
      {
        roleName: "RoleForEc2AccessRdsRedisDemo",
        assumedBy: new aws_iam.ServicePrincipal(
          "ec2.amazonaws.com"
        ),
      }
    );

    role.addManagedPolicy(
      aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
        "AmazonSSMManagedInstanceCore"
      )
    );

    role.addManagedPolicy(
      aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
        "AWSCloudFormationReadOnlyAccess"
      )
    );

    role.attachInlinePolicy(
      new aws_iam.Policy(
        this,
        "PolicyForEc2AccessRdsRedisDemo",
        {
          policyName: "PolicyForEc2AccessRdsRedisDemo",
          statements: [
            new aws_iam.PolicyStatement({
              effect: aws_iam.Effect.ALLOW,
              actions: ["secretsmanager:GetSecretValue"],
              resources: ["arn:aws:secretsmanager:*"],
            }),
          ],
        }
      )
    );

    // ec2 web app server
    const ec2 = new aws_ec2.Instance(this, "Ec2RdsRedisDemo", {
      instanceName: "Ec2RdsRedisDemo",
      instanceType: aws_ec2.InstanceType.of(
        aws_ec2.InstanceClass.T3,
        aws_ec2.InstanceSize.SMALL
      ),
      machineImage: aws_ec2.MachineImage.latestAmazonLinux({
        generation: aws_ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
        edition: aws_ec2.AmazonLinuxEdition.STANDARD,
        storage: aws_ec2.AmazonLinuxStorage.GENERAL_PURPOSE,
      }),
      vpc: vpc,
      role: role,
      securityGroup: webAppSecurityGroup,
      vpcSubnets: {
        subnetType: aws_ec2.SubnetType.PUBLIC,
      },
    });

    // add user data for ec2
    ec2.addUserData(
      fs.readFileSync("./lib/user-data.sh", "utf8")
    );

    // output
    new CfnOutput(this, "RdsSecreteArnFull", {
      value: rds.secret!.secretFullArn
        ? rds.secret!.secretFullArn
        : rds.secret!.secretArn,
    });

    new CfnOutput(this, "secret_name", {
      value: rds.secret!.secretName,
    });

    new CfnOutput(this, "mysql_endpoint", {
      value: rds.dbInstanceEndpointAddress,
    });

    new CfnOutput(this, "redis_endpoint", {
      value: redis.attrRedisEndpointAddress,
    });

    new CfnOutput(this, "webserver_public_ip", {
      value: ec2.instancePublicIp,
    });

    new CfnOutput(this, "webserver_public_url", {
      value: ec2.instancePublicDnsName,
    });
  }
}
