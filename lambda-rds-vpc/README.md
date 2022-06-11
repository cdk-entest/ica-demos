# Lambda Access RDS in a VPC 

## Architecture 

## RDS Stack 
get the existed vpc 
```tsx 
const vpc = aws_ec2.Vpc.fromLookup(this, "Vpc", {
  vpcId: props.vpcId,
  vpcName: props.vpcName,
});
```
db credentials by secret manager 
```tsx 
const credentials = aws_rds.Credentials.fromGeneratedSecret(
  "mysqlSecret",
  {
    secretName: "mysql-secret-name",
  }
);
```
aws rds db instance 
```tsx
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
```

## Lambda Stack 
role for lambda 
```tsx
const role = new aws_iam.Role(this, "RoleForLambdaRdsVpc", {
      roleName: "RoleForLambdaAccessRdsVpc",
      assumedBy: new aws_iam.ServicePrincipal(
        "lambda.amazonaws.com"
      ),
    });

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
```
lambda function in vpc 
```tsx
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
        SECRET_ARN:
          (credentials.secret &&
            credentials.secret?.secretArn.toString()) ||
          "",
      },
    });
```
stack output 
```tsx
new CfnOutput(this, "SECRET_ARN", {
      value:
        (credentials.secret && credentials.secret?.secretArn) ||
        "",
    });
```

## Lambda code 
dependencies requriements.txt
```txt 
PyMySQL
```
handler function 
```python

"""
- simple lambda function
- double check the lambda handler name 
"""

import datetime
import json
import boto3
import pymysql

# production => from os.env['SECRET_ARN']
SECRET_ARN = "arn:aws:secretsmanager:ap-southeast-1:392194582387:secret:mysql-secret-name-QZlN2R"

# region
REGION = 'ap-southeast-1'

# databse credentials => secret manager
# host = "database-3.c3x7jlemonqv.ap-southeast-1.rds.amazonaws.com"
# user = "admin"
# password = "Mike865525"
# port = 3306
dbName = 'IcaDb'

# get credenetials
secrete_client = boto3.client('secretsmanager', region_name=REGION)

# get secret string
secret = secrete_client.get_secret_value(
    SecretId=SECRET_ARN
)

# parse db information
secret_dic = json.loads(secret["SecretString"])
print(secret_dic)

# override
host = secret_dic["host"]
user = secret_dic["username"]
password = secret_dic["password"]
port = secret_dic["port"]

# secret manager
SECRET_ARN = ""


# connect
conn = pymysql.connect(
    host=host,
    user=user,
    password=password,
    port=port,
    database=dbName
)


def fetch_data():
    """
    query data
    """
    # cursor
    cur = conn.cursor()
    # fetch
    cur.execute("SELECT * FROM employees;")
    # data
    employees = cur.fetchall()
    # print
    for employee in employees:
        print(employee)
    # return
    return employees


def handler(event, context) -> json:
    """
    simple lambda function
    """
    # fetch data from db
    res = fetch_data()
    # return
    return {
        'statusCode': 200,
        'headers': {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Methods": "OPTIONS,GET"
        },
        'body': json.dumps(res)
    }


# test
if __name__ == "__main__":
    # fetch_data()
    print(handler(event=None, context=None))

```
package run.sh 
```bash 
mkdir package
python3 -m pip install --target ./package PyMySQL 
cd package
zip -r ../package.zip .
cd ..
zip -g package.zip index.py 
```