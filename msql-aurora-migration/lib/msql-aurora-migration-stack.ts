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

interface MysqlAuroraMigrationStackProps extends StackProps {
  vpcId: string;
  vpcName: string;
  amiImage: string;
  keyPair: string;
}

export class MysqlAuroraMigrationStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: MysqlAuroraMigrationStackProps
  ) {
    super(scope, id, props);

    // get existed vpc
    const vpc = aws_ec2.Vpc.fromLookup(this, "Vpc", {
      vpcId: props.vpcId,
      vpcName: props.vpcName,
    });

    // security group
    const ec2MySqlSecurityGroup = new aws_ec2.SecurityGroup(
      this,
      "SecurityGroupForEc2MySql",
      {
        securityGroupName: "SecurityGroupForEc2MySql",
        vpc: vpc,
      }
    );

    ec2MySqlSecurityGroup.addIngressRule(
      // RDP access
      aws_ec2.Peer.anyIpv4(),
      aws_ec2.Port.tcp(1521)
    );

    ec2MySqlSecurityGroup.addIngressRule(
      // sql server access
      aws_ec2.Peer.anyIpv4(),
      aws_ec2.Port.tcp(3306)
    );

    ec2MySqlSecurityGroup.addIngressRule(
      // sql server access
      aws_ec2.Peer.anyIpv4(),
      aws_ec2.Port.tcp(3389)
    );

    ec2MySqlSecurityGroup.addIngressRule(
      // sql server access
      aws_ec2.Peer.anyIpv4(),
      aws_ec2.Port.tcp(1433)
    );

    // role for ec2
    const role = new aws_iam.Role(
      this,
      "RoleForEc2DbMigrationDemo",
      {
        roleName: "RoleForEc2DbMigrationDemo",
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
    const ec2 = new aws_ec2.Instance(this, "Ec2HostMySQLDemo", {
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
      securityGroup: ec2MySqlSecurityGroup,
      vpcSubnets: {
        subnetType: aws_ec2.SubnetType.PUBLIC,
      },
    });

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
        ec2MySqlSecurityGroup.securityGroupId
      ),
      aws_ec2.Port.tcp(1433)
    );

    // amazon rds microsoft sql
    const rds = new aws_rds.DatabaseInstance(
      this,
      "RdsDbMigrationDemo",
      {
        deletionProtection: false,
        engine: aws_rds.DatabaseInstanceEngine.sqlServerSe({
          version:
            aws_rds.SqlServerEngineVersion.VER_15_00_4043_16_V1,
        }),
        licenseModel: aws_rds.LicenseModel.LICENSE_INCLUDED,
        vpc,
        // sql server
        port: 1433,
        instanceType: aws_ec2.InstanceType.of(
          aws_ec2.InstanceClass.M5,
          aws_ec2.InstanceSize.LARGE
        ),
        storageType: aws_rds.StorageType.GP2,
        allocatedStorage: 250,
        // this is testing purpose => secret manager
        credentials: {
          username: "admin",
          password: SecretValue.unsafePlainText("Password1"),
        },
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

    // dms subnet group
    const dmSubnet = new aws_dms.CfnReplicationSubnetGroup(
      this,
      "SubnetGroupForDms",
      {
        replicationSubnetGroupDescription:
          "subnet group for replication demo",
        subnetIds: vpc.privateSubnets.map(
          (subnet) => subnet.subnetId
        ),
        replicationSubnetGroupIdentifier: "SubnetGroupForDmsId",
      }
    );

    // dms database migration service
    const remplicationIstance =
      new aws_dms.CfnReplicationInstance(
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
            dbSecurityGroup.securityGroupId,
            ec2MySqlSecurityGroup.securityGroupId,
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
      "DmsTargetEndpoinRdsSqlServer",
      {
        endpointType: "target",
        endpointIdentifier: "targetEndpointId",
        engineName: "sqlserver",
        // default dbname microsoft sql
        databaseName: "tempdb",
        serverName: rds.dbInstanceEndpointAddress,
        port: 1433,
        username: "admin",
        // default non
        sslMode: "none",
        // production => secret manager
        password: "Password1",
        microsoftSqlServerSettings: {
          // bcpPacketSize: 123,
          // controlTablesFileGroup: "",
          // querySingleAlwaysOnNode: false,
          // readBackupOnly: false,
          // safeguardPolicy: "",
          // secretsManagerAccessRoleArn: "",
          // secretsManagerSecretId: "",
          // useBcpFullLoad: false,
          // useThirdPartyBackupDevice: false
        },
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
        serverName:
          "ec2-13-215-254-14.ap-southeast-1.compute.amazonaws.com",
        port: 1433,
        username: "awssct",
        password: "Password1",
        sslMode: "none",
      }
    );

    // dms replication task
    const replicationTask = new aws_dms.CfnReplicationTask(
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

    // output
    new CfnOutput(this, "dmsSubnetGroup", {
      value:
        dmSubnet.replicationSubnetGroupIdentifier!.toString(),
    });
  }
}

export class DmsVpcRole extends Stack {
  public readonly role: aws_iam.Role;

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    this.role = new aws_iam.Role(this, "DmsVpcRole", {
      roleName: "dms-vpc-role",
      assumedBy: new aws_iam.ServicePrincipal(
        "dms.amazonaws.com"
      ),
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
