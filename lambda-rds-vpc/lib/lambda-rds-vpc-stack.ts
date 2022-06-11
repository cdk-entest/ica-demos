import {
  aws_ec2,
  aws_iam,
  aws_lambda,
  aws_rds,
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from "path";

interface LambdaRdsVpcStackProps extends StackProps {
  functionName: string;
  vpcId: string;
  vpcName: string;
  dbName: string;
}

export class RdsLambdaStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: LambdaRdsVpcStackProps
  ) {
    super(scope, id, props);

    // get existed vpc
    const vpc = aws_ec2.Vpc.fromLookup(this, "Vpc", {
      vpcId: props.vpcId,
      vpcName: props.vpcName,
    });

    // db crentials
    const credentials = aws_rds.Credentials.fromGeneratedSecret(
      "mysqlSecret",
      {
        secretName: "mysql-secret-name",
      }
    );

    // RDS database instance
    const rds = new aws_rds.DatabaseInstance(
      this,
      "RdsIntance",
      {
        // production => RETAIN
        removalPolicy: RemovalPolicy.DESTROY,
        databaseName: props.dbName,
        // make sure combination version and instance type
        engine: aws_rds.DatabaseInstanceEngine.mysql({
          version: aws_rds.MysqlEngineVersion.VER_8_0_28,
        }),
        instanceType: aws_ec2.InstanceType.of(
          aws_ec2.InstanceClass.BURSTABLE3,
          aws_ec2.InstanceSize.SMALL
        ),
        vpc,
        vpcSubnets: {
          // production => private subnet
          subnetType: aws_ec2.SubnetType.PUBLIC,
        },
        credentials: credentials,
      }
    );

    // role for lambda
    const role = new aws_iam.Role(this, "RoleForLambdaRdsVpc", {
      roleName: "RoleForLambdaAccessRdsVpc",
      assumedBy: new aws_iam.ServicePrincipal(
        "lambda.amazonaws.com"
      ),
    });

    // policy to access RDS inside VPC
    role.attachInlinePolicy(
      new aws_iam.Policy(this, "PolicyForLambdaAccessRdsVpc", {
        policyName: "PolicyForLambdaAccessRdsVpc",
        statements: [
          new aws_iam.PolicyStatement({
            effect: aws_iam.Effect.ALLOW,
            actions: ["rds:*"],
            resources: ["*"],
          }),
        ],
      })
    );

    role.addManagedPolicy(
      aws_iam.ManagedPolicy.fromManagedPolicyArn(
        this,
        "AWSLambdaVPCAccessExecutionRole",
        "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
      )
    );

    role.addManagedPolicy(
      aws_iam.ManagedPolicy.fromManagedPolicyArn(
        this,
        "LambdaSecretManager",
        "arn:aws:iam::aws:policy/SecretsManagerReadWrite"
      )
    );

    // lambda access vpc
    new aws_lambda.Function(this, "LambdaRdsVpc", {
      functionName: props.functionName,
      runtime: aws_lambda.Runtime.PYTHON_3_8,
      code: aws_lambda.Code.fromAsset(
        path.join(__dirname, "lambda/package.zip")
      ),
      handler: "index.handler",
      timeout: Duration.seconds(10),
      memorySize: 512,
      role,
      vpc,
      environment: {
        SECRET_ARN: rds.secret!.secretFullArn ? rds.secret!.secretFullArn : rds.secret!.secretArn,
      },
    });

    // output
    new CfnOutput(this, "SECRET_ARN", {
      value:
      rds.secret!.secretFullArn ? rds.secret!.secretFullArn : rds.secret!.secretArn,
    });
  }
}

export class LambdaFunctionRdsVpcStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: LambdaRdsVpcStackProps
  ) {
    super(scope, id, props);

    // get existed vpc
    const vpc = aws_ec2.Vpc.fromLookup(this, "Vpc", {
      vpcId: props.vpcId,
      vpcName: props.vpcName,
    });

    // role for lambda
    const role = new aws_iam.Role(
      this,
      "RoleForLambdaFunctionRdsVpc",
      {
        roleName: "RoleForLambdaFunctionAccessRdsVpc",
        assumedBy: new aws_iam.ServicePrincipal(
          "lambda.amazonaws.com"
        ),
      }
    );

    // policy to access RDS inside VPC
    role.attachInlinePolicy(
      new aws_iam.Policy(
        this,
        "PolicyForLambdaFunctionAccessRdsVpc",
        {
          policyName: "PolicyForLambdaFunctionAccessRdsVpc",
          statements: [
            new aws_iam.PolicyStatement({
              effect: aws_iam.Effect.ALLOW,
              actions: ["rds:*"],
              resources: ["*"],
            }),
          ],
        }
      )
    );

    role.addManagedPolicy(
      aws_iam.ManagedPolicy.fromManagedPolicyArn(
        this,
        "AWSLambdaVPCAccessExecutionRole",
        "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
      )
    );

    role.addManagedPolicy(
      aws_iam.ManagedPolicy.fromManagedPolicyArn(
        this,
        "LambdaSecretManager",
        "arn:aws:iam::aws:policy/SecretsManagerReadWrite"
      )
    );

    //
    // lambda access vpc
    new aws_lambda.Function(this, "LambdaRdsVpc", {
      functionName: props.functionName,
      runtime: aws_lambda.Runtime.PYTHON_3_8,
      code: aws_lambda.Code.fromAsset(
        path.join(__dirname, "lambda/package.zip")
      ),
      handler: "index.handler",
      timeout: Duration.seconds(10),
      memorySize: 512,
      role,
      vpc,
    });
  }
}
