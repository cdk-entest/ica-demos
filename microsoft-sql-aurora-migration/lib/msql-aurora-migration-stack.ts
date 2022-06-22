import {
  aws_dms,
  aws_ec2,
  aws_iam,
  aws_rds,
  CfnOutput,
  RemovalPolicy,
  SecretValue,
  Stack,
  StackProps,
} from "aws-cdk-lib";
import { Construct } from "constructs";

interface DatabasesStackProps extends StackProps {
  vpcId: string;
  vpcName: string;
  amiImage: string;
  keyPair: string;
  dbName: string;
}

export class DatabaseStack extends Stack {
  public readonly ec2: aws_ec2.Instance;
  public readonly aurora: aws_rds.DatabaseCluster;
  public readonly ec2SecurityGrroup: aws_ec2.SecurityGroup;
  public readonly dbSecurityGroup: aws_ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: DatabasesStackProps) {
    super(scope, id, props);

    // get existed vpc
    const vpc = aws_ec2.Vpc.fromLookup(this, "Vpc", {
      vpcId: props.vpcId,
      vpcName: props.vpcName,
    });

    // security group
    this.ec2SecurityGrroup = new aws_ec2.SecurityGroup(
      this,
      "SecurityGroupForEc2MySql",
      {
        securityGroupName: "SecurityGroupForEc2MySql",
        vpc: vpc,
      }
    );

    this.ec2SecurityGrroup.addIngressRule(
      // RDP access
      aws_ec2.Peer.anyIpv4(),
      aws_ec2.Port.tcp(1521)
    );

    this.ec2SecurityGrroup.addIngressRule(
      // RDP access
      aws_ec2.Peer.anyIpv4(),
      aws_ec2.Port.tcp(3389)
    );

    this.ec2SecurityGrroup.addIngressRule(
      // sql server access
      aws_ec2.Peer.anyIpv4(),
      aws_ec2.Port.tcp(1433)
    );

    // role for ec2
    const role = new aws_iam.Role(this, "RoleForEc2DbMigrationDemo", {
      roleName: "RoleForEc2DbMigrationDemo",
      assumedBy: new aws_iam.ServicePrincipal("ec2.amazonaws.com"),
    });

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
      new aws_iam.Policy(this, "PolicyForEc2DbMigrationDemo", {
        policyName: "PolicyForEc2DbMigrationDemo",
        statements: [
          new aws_iam.PolicyStatement({
            effect: aws_iam.Effect.ALLOW,
            actions: ["secretsmanager:GetSecretValue"],
            resources: ["arn:aws:secretsmanager:*"],
          }),
        ],
      })
    );

    // ec2 host MySQL
    this.ec2 = new aws_ec2.Instance(this, "Ec2HostMySQLDemo", {
      instanceName: "Ec2HostMySqlDemo",
      keyName: props.keyPair,
      instanceType: aws_ec2.InstanceType.of(
        aws_ec2.InstanceClass.M5,
        aws_ec2.InstanceSize.LARGE
      ),
      blockDevices: [
        {
          deviceName: "/dev/sda1",
          volume: aws_ec2.BlockDeviceVolume.ebs(250, {
            deleteOnTermination: true,
            iops: 2000,
            volumeType: aws_ec2.EbsDeviceVolumeType.IO1,
          }),
        },
      ],
      machineImage: aws_ec2.MachineImage.genericWindows({
        "ap-southeast-1": props.amiImage,
      }),
      vpc: vpc,
      role: role,
      securityGroup: this.ec2SecurityGrroup,
      vpcSubnets: {
        subnetType: aws_ec2.SubnetType.PUBLIC,
      },
    });

    // db security group
    this.dbSecurityGroup = new aws_ec2.SecurityGroup(
      this,
      "SecurityGroupForDb",
      {
        securityGroupName: "SecurityGroupForDb",
        vpc: vpc,
      }
    );

    this.dbSecurityGroup.addIngressRule(
      aws_ec2.Peer.securityGroupId(this.ec2SecurityGrroup.securityGroupId),
      aws_ec2.Port.tcp(3306)
    );

    // subnet group for aurora
    const subnetGroup = new aws_rds.SubnetGroup(this, "AuroraSubnetGroup", {
      vpc: vpc,
      removalPolicy: RemovalPolicy.DESTROY,
      description: "subnet group for aurora clsuter",
      subnetGroupName: "AuroraSubnetGroup",
      vpcSubnets: {
        subnetType: aws_ec2.SubnetType.PRIVATE_WITH_NAT,
      },
    });

    // amazon qurora mysql
    this.aurora = new aws_rds.DatabaseCluster(this, "AuroraCluster", {
      removalPolicy: RemovalPolicy.DESTROY,
      defaultDatabaseName: props.dbName,
      clusterIdentifier: "AuroraClusterDemo",
      engine: aws_rds.DatabaseClusterEngine.auroraMysql({
        version: aws_rds.AuroraMysqlEngineVersion.VER_2_08_1,
      }),
      // production: secrete manager
      credentials: {
        username: "admin",
        password: SecretValue.unsafePlainText("Password1"),
      },
      instanceProps: {
        instanceType: aws_ec2.InstanceType.of(
          aws_ec2.InstanceClass.BURSTABLE2,
          aws_ec2.InstanceSize.SMALL
        ),
        vpcSubnets: {
          subnets: vpc.privateSubnets.map((subnet) => subnet),
        },
        vpc: vpc,
        securityGroups: [this.dbSecurityGroup],
      },
      deletionProtection: false,
      instances: 1,
      subnetGroup: subnetGroup,
    });
  }
}

export class DmsVpcRole extends Stack {
  public readonly role: aws_iam.Role;

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    this.role = new aws_iam.Role(this, "DmsVpcRole", {
      roleName: "dms-vpc-role",
      assumedBy: new aws_iam.ServicePrincipal("dms.amazonaws.com"),
    });

    this.role.addManagedPolicy(
      aws_iam.ManagedPolicy.fromManagedPolicyArn(
        this,
        "AmazonDMSVPCManagementRole",
        "arn:aws:iam::aws:policy/service-role/AmazonDMSVPCManagementRole"
      )
    );

    new CfnOutput(this, "TheDmsVpcRole", {
      value: this.role.roleArn,
    });
  }
}

interface DmsMigrationStackProps extends StackProps {
  vpcId: string;
  vpcName: string;
  dbStack: DatabaseStack;
}

export class DmsMigrationStack extends Stack {
  constructor(scope: Construct, id: string, props: DmsMigrationStackProps) {
    super(scope, id, props);

    // get existed vpc
    const vpc = aws_ec2.Vpc.fromLookup(this, "Vpc", {
      vpcId: props.vpcId,
      vpcName: props.vpcName,
    });

    // dms subnet group
    const dmSubnet = new aws_dms.CfnReplicationSubnetGroup(
      this,
      "SubnetGroupForDms",
      {
        replicationSubnetGroupDescription: "subnet group for replication demo",
        subnetIds: vpc.privateSubnets.map((subnet) => subnet.subnetId),
        replicationSubnetGroupIdentifier: "SubnetGroupForDmsId",
      }
    );

    // dms database migration service
    const remplicationIstance = new aws_dms.CfnReplicationInstance(
      this,
      "ReplicationInstanceDemo",
      {
        replicationInstanceClass: "dms.t2.medium",
        allocatedStorage: 256,
        engineVersion: "3.4.6",
        multiAz: false,
        publiclyAccessible: false,
        resourceIdentifier: "ReplicationInstanceDemo",
        vpcSecurityGroupIds: [
          props.dbStack.dbSecurityGroup.securityGroupId,
          props.dbStack.ec2SecurityGrroup.securityGroupId,
        ],
        availabilityZone: "ap-southeast-1a",
        replicationSubnetGroupIdentifier:
          dmSubnet.replicationSubnetGroupIdentifier!.toLowerCase(),
      }
    );

    remplicationIstance.addDependsOn(dmSubnet);

    // dms target endpoints
    const targetEndpoint = new aws_dms.CfnEndpoint(
      this,
      "DmsTargetEndpointAuroraMySql",
      {
        endpointType: "target",
        endpointIdentifier: "targetEndpointId",
        engineName: "aurora",
        // default dbname aurora mysql
        // databaseName: "tempdb",
        serverName: props.dbStack.aurora.clusterEndpoint.hostname,
        port: 3306,
        username: "admin",
        // default non
        sslMode: "none",
        // production => secret manager
        password: "Password1",
        mySqlSettings: {},
      }
    );

    // dms source endpoint
    const sourceEndpoint = new aws_dms.CfnEndpoint(
      this,
      "DmsSourceEndpointRdsSqlServerEc2",
      {
        endpointType: "source",
        endpointIdentifier: "sourceEndpointId",
        engineName: "sqlserver",
        databaseName: "dms_sample",
        serverName: props.dbStack.ec2.instancePublicDnsName,
        port: 1433,
        username: "awssct",
        password: "Password1",
        sslMode: "none",
      }
    );

    // dms replication task
    const replicationAllTablesTask = new aws_dms.CfnReplicationTask(
      this,
      "DmsReplicationTaskDemo",
      {
        // full-load, cdc, full-load-and-cdc
        migrationType: "full-load",
        // replication instance ref indicates its arn
        replicationInstanceArn: remplicationIstance.ref,
        sourceEndpointArn: sourceEndpoint.ref,
        tableMappings: JSON.stringify({
          rules: [
            {
              "rule-type": "selection",
              "rule-id": "200548593",
              "rule-name": "200548593",
              "object-locator": {
                "schema-name": "%",
                "table-name": "%",
              },
              "rule-action": "include",
              filters: [],
            },
          ],
        }),
        targetEndpointArn: targetEndpoint.ref,
      }
    );

    // dms replication task
    const replicationSelectTablesTask = new aws_dms.CfnReplicationTask(
      this,
      "DmsReplicationTaskSelectDemo",
      {
        // full-load, cdc, full-load-and-cdc
        migrationType: "full-load",
        // replication instance ref indicates its arn
        replicationInstanceArn: remplicationIstance.ref,
        sourceEndpointArn: sourceEndpoint.ref,
        tableMappings: JSON.stringify({
          rules: [
            {
              "rule-type": "selection",
              "rule-id": "200548593",
              "rule-name": "200548593",
              "object-locator": {
                "schema-name": "dbo",
                "table-name": "player",
              },
              "rule-action": "include",
              filters: [],
            },
            {
              "rule-type": "transformation",
              "rule-id": "876674182",
              "rule-name": "876674182",
              "rule-target": "schema",
              "object-locator": {
                "schema-name": "dbo"
              },
              "rule-action": "rename",
              "value": "dms_sample_dbo",
              "old-value": null
            }
          ],
        }),
        targetEndpointArn: targetEndpoint.ref,
      }
    );

    // output
    new CfnOutput(this, "dmsSubnetGroup", {
      value: dmSubnet.replicationSubnetGroupIdentifier!.toString(),
    });
  }
}
