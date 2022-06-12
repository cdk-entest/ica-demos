import {
  aws_dax,
  aws_ec2,
  aws_iam,
  Stack,
  StackProps,
} from "aws-cdk-lib";
import { Construct } from "constructs";

interface DynamodbDaxStackProps extends StackProps {
  vpcId: string;
  vpcName: string;
}

export class DynamodbDaxStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: DynamodbDaxStackProps
  ) {
    super(scope, id, props);

    // get existed vpc
    const vpc = aws_ec2.Vpc.fromLookup(this, "Vpc", {
      vpcId: props.vpcId,
      vpcName: props.vpcName,
    });

    // subnet groups
    const subnetGroup = new aws_dax.CfnSubnetGroup(
      this,
      "SubnetGroupForDaxDemo",
      {
        description: "subnet group for dax demo",
        subnetGroupName: "SubnetGroupForDaxDemo",
        // nice map
        subnetIds: vpc.privateSubnets.map(
          (subnet) => subnet.subnetId
        ),
      }
    );

    // parameter group
    const parameterGroup = new aws_dax.CfnParameterGroup(
      this,
      "ParameterGroupDaxDemo",
      {
        parameterGroupName: "ParameterGroupDaxDemo",
        description: "parameter gropu for dax cluster demo",
        // default 5 minutes 300000 milisesconds
        parameterNameValues: {
          "query-ttl-millis": "300000",
          "record-ttl-millis": "180000",
        },
      }
    );

    // role for dax cluster
    const role = new aws_iam.Role(
      this,
      "RoleForDaxClusterDmoe",
      {
        roleName: "RoleForDaxClusterDemo",
        assumedBy: new aws_iam.ServicePrincipal(
          "dax.amazonaws.com"
        ),
      }
    );

    role.attachInlinePolicy(
      new aws_iam.Policy(this, "PolicyForDaxClusterDmoe", {
        policyName: "PolicyForDaxClusterDmoe",
        statements: [
          new aws_iam.PolicyStatement({
            effect: aws_iam.Effect.ALLOW,
            actions: ["dynamodb:*"],
            resources: ["*"],
          }),
        ],
      })
    );

    // security group 
    const securityGroup = new aws_ec2.SecurityGroup(
      this,
      "SecurityGroupForDaxCluster",
      {
        securityGroupName: "SecurityGroupForDaxCluster",
        vpc: vpc
      }
    )

    securityGroup.addIngressRule(
      // production SG peer 
      aws_ec2.Peer.anyIpv4(),
      // unencrypted 8111
      aws_ec2.Port.tcp(8111),
    )

    // create a dax cluster
    new aws_dax.CfnCluster(this, "DaxClusterDemo", {
      clusterName: "DaxClusterDemo",
      // role to access ddb
      iamRoleArn: role.roleArn,
      // mem optimized node type
      nodeType: "dax.r4.large",
      // 3: 1 primary and 2 read replics
      replicationFactor: 3,
      // automatically into az
      // availabilityZones: [''],
      // encryption TSL or NONE as default
      clusterEndpointEncryptionType: "NONE",
      // notificationTopicArn: "",
      parameterGroupName: parameterGroup.parameterGroupName,
      // range of time maintenance of DAX software performed
      // preferredMaintenanceWindow: "",
      securityGroupIds: [
        securityGroup.securityGroupId
      ],
      subnetGroupName: subnetGroup.subnetGroupName,
    });
  }
}
