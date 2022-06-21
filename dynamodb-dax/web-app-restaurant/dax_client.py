"""
Hai Tran: 12 JUN 2022 
DynamoDB with DAX Performance 
"""

from asyncore import write
import os
import uuid
import names 
import amazondax 
import boto3
import random 
import datetime
from boto3.dynamodb.conditions import Key
import time
import json 
import matplotlib.pyplot as plt

# configure region 
REGION = os.environ.get("AWS_DEFAULT_REGION", "ap-southeast-1")
# dax endpoint 
DAX_ENDPOINT = "dax://test.a7wlr3.dax-clusters.ap-southeast-1.amazonaws.com"
# table name 
TABLE_NAME = "RestaurantsDax"
# number of thread 
NUM_THREAD = 100
# dynamodb client 
dynamodb = boto3.client("dynamodb")


def fetch_multiple_restaurants( mode='dax', limit=100): 
  """
  """
  # table
  if mode=='dax':
    client = amazondax.AmazonDaxClient(endpoint_url=DAX_ENDPOINT)
  else:
    client = boto3.client('dynamodb')
  # get some user ids 
  names = scan_restaurant(limit)
  # loop over user_ids
  restaurants = [fetch_restaurant_summary(client, name) for name in names]
  # return 
  return restaurants


def fetch_restaurant_summary(client, restaurant_name):
    """
    from directory from db 
    """
    start = time.perf_counter()
    resp =client.query(
        TableName=TABLE_NAME,
        IndexName="GSI1",
        KeyConditionExpression="GSI1PK = :gsi1pk",
        ExpressionAttributeValues={
            ":gsi1pk": {"S": "REST#{}".format(restaurant_name)},
        },
        ScanIndexForward=False,
        Limit=6,
    )
    end = time.perf_counter()
    print(f'db query latency {(end - start) * 1000: .4f}ms')
    restaurant = Restaurant(resp["Items"][0])
    restaurant.reviews = [Review(item) for item in resp["Items"][1:]]
    restaurant.latency = (end - start) * 1000
    print_restaurant(restaurant)
    # return 
    return restaurant


def scan_restaurant(limit=100):
    """
    """
    names = []
    res = dynamodb.scan(
        TableName=TABLE_NAME,
        Limit=limit
    )
    items = res['Items']
    for item in items:
        try: 
            names.append(item['restaurant']['S'])
        except:
            pass
    # print(names)
    return names


def create_table() -> None:
    """
    create a table
    """
    try:
        dynamodb.create_table(
            TableName=TABLE_NAME,
            AttributeDefinitions=[
                {"AttributeName": "PK", "AttributeType": "S"},
                {"AttributeName": "SK", "AttributeType": "S"},
                {"AttributeName": "GSI1PK", "AttributeType": "S"},
                {"AttributeName": "GSI1SK", "AttributeType": "S"},
            ],
            KeySchema=[
                {"AttributeName": "PK", "KeyType": "HASH"},
                {"AttributeName": "SK", "KeyType": "RANGE"},
            ],
            GlobalSecondaryIndexes=[
                {
                    "IndexName": "GSI1",
                    "KeySchema": [
                        {"AttributeName": "GSI1PK", "KeyType": "HASH"},
                        {"AttributeName": "GSI1SK", "KeyType": "RANGE"},
                    ],
                    "Projection": {"ProjectionType": "ALL"},
                    "ProvisionedThroughput": {
                        "ReadCapacityUnits": 5,
                        "WriteCapacityUnits": 5,
                    },
                }
            ],
            ProvisionedThroughput={"ReadCapacityUnits": 5, "WriteCapacityUnits": 5},
        )
        print("Table created successfully.")
    except Exception as e:
        print("Could not create table. Error:")
        print(e)


def delete_table() -> None:
  """
  delete a table 
  """ 
  # get table 
  table = get_table(TABLE_NAME)
  # delete table 
  res = table.delete()
  # print 
  print(res)


def buck_load_table(mode='ddb'):
  """
  """
  if mode=='dax':
    dax = amazondax.AmazonDaxClient.resource(endpoint_url=DAX_ENDPOINT)
    table = dax.Table(TABLE_NAME)
  else: 
    dynamodb = boto3.resource("dynamodb")
    table = dynamodb.Table(TABLE_NAME)
  items = []
  # open local file data 
  with open("items.json", "r") as f:
      for row in f:
          items.append(json.loads(row))
  # batch write to dyanmodb
  with table.batch_writer() as batch:
      for item in items:
          batch.put_item(Item=item)
  print("Items loaded successfully.")



def get_table(table_name: str, mode='ddb'):
  """
  get table 
  """
  if mode=='dax':
    dax = amazondax.AmazonDaxClient.resource(endpoint_url=DAX_ENDPOINT)
    # table  
    table = dax.Table(TABLE_NAME)
  else: 
    # create ddb client
    ddb = boto3.resource('dynamodb')
    # table
    table = ddb.Table(TABLE_NAME)
  # return 
  return table

# support 
class Restaurant:
    def __init__(self, item):
        self.name = item.get("name")
        self.cuisine = item.get("cuisine")
        self.address = item.get("address")
        self.five_stars = item.get("five_stars", {})
        self.four_stars = item.get("four_stars", {})
        self.three_stars = item.get("three_stars", {})
        self.two_stars = item.get("two_stars", {})
        self.one_stars = item.get("one_stars", {})
        self.latency = -1

    def __repr__(self):
        return "Restaurant<{} -- {}>".format(self.name, self.cuisine)


class Review:
    def __init__(self, item):
        self.restaurant = item.get("restaurant")
        self.username = item.get("username")
        self.rating = item.get("rating")
        self.review = item.get("review")
        self.id = item.get("id")
        self.created_at = item.get("created_at")

    def __repr__(self):
        return "Review<{} -- {} ({})>".format(
            self.restaurant, self.username, self.created_at
        )


def print_restaurant(restaurant):
    """
    """
    print(restaurant)
    for review in restaurant.reviews:
        print(review)


def plot_performance(db_latencies, cache_latencies):
    """
    """
    fig,axes = plt.subplots(1,1,figsize=(10,5))
    axes.plot(db_latencies,'k--o',markersize=3,linewidth=0.5)
    axes.plot(cache_latencies,'b--o',markersize=3,linewidth=0.5)
    axes.legend(['dax-query','db-query'])
    axes.set_ylabel('milisecond')
    axes.set_xlabel('read db')
    axes.set_yticks([k for k in range(10)])
    axes.set_ylim(0,10)
    fig.suptitle('cache latency')
    fig.savefig('dax-ddb-performance.png')





if __name__=="__main__":
  # delete_table()
  # create_table()
  # buck_load_table(mode='dax')
  db_latencies = [restaurant.latency for restaurant in  fetch_multiple_restaurants('ddb', 120)]
  cache_latencies = [restaurant.latency for restaurant in  fetch_multiple_restaurants('dax', 120)]
  plot_performance(db_latencies[10:], cache_latencies[10:])







