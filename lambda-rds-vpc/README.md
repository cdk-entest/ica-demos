---
title: Lambda Access RDS in a VPC 
author: haimtran 
description: lambda function access rds in a vpc using vpc endpoints  
publishedDate: 25/10/2022
date: 25/10/2022
---

## Introduction 
- create a RDS in private subnest 
- add vpc endpoints so lambda can access rds and secrete manager
- check lambda and rds security group
- test lambda fetch data from rds tables 

## RDS Stack 
get the existed vpc 
```tsx 
const vpc = aws_ec2.Vpc.fromLookup(this, "Vpc", {
  vpcId: props.vpcId,
  vpcName: props.vpcName,
});
```

add vpc endpoint to access secrete manager

```tsx
vpc.addInterfaceEndpoint("SecreteManagerVpcEndpoint", {
  service:
    aws_ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
  privateDnsEnabled: true,
  subnets: {
    subnetType: aws_ec2.SubnetType.PRIVATE_ISOLATED,
  },
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


aws rds db instance in private subnets
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
          subnetType: aws_ec2.SubnetType.PRIVATE_ISOLATED,
        },
        credentials: credentials,
        securityGroups: [securityGroup]
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
      vpcSubnets: {
        subnetType: aws_ec2.SubnetType.PRIVATE_ISOLATED,
      },
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

## Create a table for testing 
```python 
def create_database(database: str):
    """
    """
    cusor = conn.cursor()
    cusor.execute('SHOW DATABASES')
    dbs = cusor.fetchall()
    # list of dbs
    dbs_list = [db[0] for db in dbs]
    # create IcaDb if not existed yet
    if (database in dbs_list):
        pass
    else:
        cusor.execute("CREATE DATABASE IcaDb")
```
table 
```python 
def create_table(database: str):
    """
    create a table inside a database
    """
    conn = pymysql.connect(
        host=host,
        user=user,
        passwd=password,
        port=port,
        database=database
    )
    # cursor
    cur = conn.cursor()
    # drop table if exists
    drop = "DROP TABLE IF EXISTS employees"
    cur.execute(drop)
    # create table
    employee_table = (
        "CREATE TABLE employees ("
        "    id TINYINT UNSIGNED NOT NULL AUTO_INCREMENT, "
        "    name VARCHAR(30) DEFAULT '' NOT NULL, "
        "    age TEXT, "
        "    time TEXT, "
        "PRIMARY KEY (id))"
    )
    cur.execute(employee_table)
    # time stamp
    now = datetime.datetime.now()
    time_stamp = now.strftime("%Y/%m/%d-%H:%M:%S.%f")
    # employees (id, name, age, time)
    employees = [(k, names.get_full_name(), random.randint(
        20, 100),  time_stamp) for k in range(1, 100)]
    # tuple
    employees = tuple(employees)
    stmt_insert = "INSERT INTO employees (id, name, age, time) VALUES (%s, %s, %s, %s)"
    cur.executemany(stmt_insert, employees)
    conn.commit()
    # show table
    cur.execute("SHOW TABLES")
    tables = cur.fetchall()
    for table in tables:
        print(f'table: {table}')
```

## Troubleshooting 
run create_table.py to test 
- get rds credentials from secrete manager 
- rds connector, lambda and rds subnets and security group 
- create IcaDb database 
- create employee table in IcaDb database
- fetch data from employee table
