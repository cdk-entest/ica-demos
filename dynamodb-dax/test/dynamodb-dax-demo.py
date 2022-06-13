"""
Hai Tran: 12 JUN 2022 
DynamoDB with DAX Performance 
"""

import os
from tokenize import Double 
import amazondax 
import boto3
import random 
import datetime
from boto3.dynamodb.conditions import Key
import time
import matplotlib.pyplot as plt

# configure region 
REGION = os.environ.get("AWS_DEFAULT_REGION", "ap-southeast-1")
# dax endpoint 
DAX_ENDPOINT = "dax://daxclusterdemo.a7wlr3.dax-clusters.ap-southeast-1.amazonaws.com"
# game title 
GAME_TITLES = [
    'Galaxy Invaders',
    'Meteor Blasters',
]
# user or player id
USER_IDS = [str(x) for x in range(100, 121)]


def create_table(table_name: str) -> None:
    """
    create a table
    """
    # db client, optional region specified here
    db_client = boto3.client('dynamodb')
    # create a table
    res = db_client.create_table(
        TableName=table_name,
        AttributeDefinitions=[
            {
                'AttributeName': 'UserId',
                'AttributeType': 'S'
            },
            {
                'AttributeName': 'CreatedTime',
                'AttributeType': 'N'
            },
        ],
        # KeySchema and Attribute should be the same
        KeySchema=[
            {
                'AttributeName': 'UserId',
                'KeyType': 'HASH'
            },
            {
                'AttributeName': 'CreatedTime',
                'KeyType': 'RANGE'
            },
        ],
        # PAY_PER_REQUEST when load is unpredictable
        # PROVISIONED when load is predictable
        BillingMode="PAY_PER_REQUEST"
    )
    # print table meta data 
    print(res)



def get_table(table_name: str):
  """
  get table 
  """
  # create ddb client
  ddb = boto3.resource('dynamodb')
  # table
  table = ddb.Table(table_name)
  # return 
  return table 
    


def write_table(table_name: str) -> None:
  """
  write data items to a table 
  """
  # table 
  # table = get_table(table_name)
  # dax client 
  dax = amazondax.AmazonDaxClient.resource(
    endpoint_url=DAX_ENDPOINT
  )
  # table  
  table = dax.Table(table_name)
  # create a new item
  for game_title in GAME_TITLES:
      for user_id in USER_IDS:
          res = table.put_item(
              Item={
                  'UserId': user_id,
                  'GameTitle': game_title,
                  'Score': random.randint(1000, 6000),
                  'Wins': random.randint(0, 100),
                  'Losses': random.randint(5, 50),
                  'CreatedTime': int(datetime.datetime.now().timestamp() * 1000)
              }
          )
          print(res)



def get_item_by_id(table_name: str, user_id: str) -> None:
  """
  get an item by id
  """
  # get table
  table = get_table(table_name)
  # query by user id
  res = table.query(
      KeyConditionExpression=Key('UserId').eq(user_id),
      ScanIndexForward=False,
  )
  # print result
  print(res['Items'])



def get_items_wo_dax(table_name: str, no_iter: int) -> Double:
  """
  measure time lag when getting items 
  """
  # get table 
  table = get_table(table_name)
  # start time 
  start = time.time()
  # loop no_iter
  for k in range(no_iter):
    # loop over user_ids
    for user_id in USER_IDS[1:]:
      start_item = time.time()
      # query by user_id 
      res = table.query(
        KeyConditionExpression=Key('UserId').eq(user_id),
        ScanIndexForward=False)
      end_item = time.time()
      print(f'latency item {(end_item - start_item) * 1000} ms')
      # print(res)
  # end time 
  end = time.time()
  # time lag
  time_lag = (end - start) * 1000 
  print(f'witout dax: time lag total: {time_lag}ms, per loop: {time_lag/no_iter}ms, per query: {time_lag/(no_iter * len(USER_IDS))}ms')
  # return 
  return time_lag/(no_iter * len(USER_IDS))



def get_items_wi_dax(table_name: str, no_iter: int) -> Double:
  """
  measure time when getting items with dax 
  """
  # dax client 
  dax = amazondax.AmazonDaxClient.resource(
    endpoint_url=DAX_ENDPOINT
  )
  # table  
  table = dax.Table(table_name)
  # start time 
  start = time.time()
  # loop no_iter
  for k in range(no_iter):
    # loop over user_ids
    for user_id in USER_IDS:
      # query by user_id 
      start_item = time.time()
      res = table.query(
        KeyConditionExpression=Key('UserId').eq(user_id),
        ScanIndexForward=False)
      end_item = time.time()
      # print(res)
      print(f'latency item {(end_item - start_item) * 1000} ms')
  # end time 
  end = time.time()
  # time lag
  time_lag = (end - start) * 1000 
  print(f'with dax: time lag total: {time_lag}ms, per loop: {time_lag/no_iter}ms, per query: {time_lag/(no_iter * len(USER_IDS))}ms')
  # return 
  return time_lag/(no_iter * len(USER_IDS))



def get_items_by_primary_key(table: str, mode='dax', no_iter=10) -> None:
  """
  """
  # table 
  if mode=='dax':
    # dax client 
    dax = amazondax.AmazonDaxClient.resource(
      endpoint_url=DAX_ENDPOINT
    )
    # table  
    table = dax.Table(table_name)
  else:
    table = get_table(table_name)
  # 
  for k in range(no_iter):
    start = time.time()
    res = table.get_item(
      Key={"UserId": "120", "CreatedTime": 1655098896759}
    )
    end = time.time()
    print(f'get-item tim: {(end-start)*1000}ms')
    # print(res)


def delete_table(table_name) -> None:
  """
  delete a table 
  """ 
  # get table 
  table = get_table(table_name)
  # delete table 
  res = table.delete()
  # print 
  print(res)

if __name__=="__main__":
  table_name = "DaxTable"
  # create_table(table_name)
  # write_table(table_name)
  # get_item_by_id(table_name,"120")
  # get_items_wo_dax(table_name, 1)
  # get_items_wi_dax(table_name, 1)
  # delete_table("DaxTable")
  # time_lags_wo_dax = [get_items_wo_dax(table_name, 1) for k in range(20)]
  # time_lags_wi_dax = [get_items_wi_dax(table_name, 1) for k in range(20)]
  # fig,axes = plt.subplots(1,1,figsize=(10,5))
  # axes.plot(time_lags_wo_dax,'k--o',markersize=5,linewidth=0.5)
  # axes.plot(time_lags_wi_dax,'b--o',markersize=5,linewidth=0.5)
  # axes.legend(['wo-dax','wi-dax'])
  # axes.set_ylabel('milisecond')
  # axes.set_xlabel('read db')
  # fig.suptitle('DAX performance')
  # fig.savefig('dax_performance.png')

  get_items_by_primary_key(table_name, mode="dax", no_iter=100)