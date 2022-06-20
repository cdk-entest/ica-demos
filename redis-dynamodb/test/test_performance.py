"""
Hai Tran 20 JUNE 2022 
Redis and DynamoDB 
"""

import os
import time
import redis 
import boto3
import json
from entities import Restaurant, Review
import matplotlib.pyplot as plt 

# redis endpoint 
HOST = os.environ["REDIS_HOSTNAME"].replace(":6379", "")
# boto3 db client
dynamodb = boto3.client("dynamodb")
# redis client
r = redis.Redis(host=HOST)

def fetch_restaurant_summary(restaurant_name):
    """
    fetch from cache and write to cache 
    """
    # fetch from cache
    start = time.perf_counter()
    restaurant = fetch_restaurant_summary_from_cache(restaurant_name)
    end = time.perf_counter()
    print(f'cache query latency {(end - start) * 1000:.4f}ms')
    # hit cache and return 
    if restaurant:
        print_restaurant(restaurant)
        print("Using cached result!")
        return (end-start)*1000
    # mis-cache and fetch from db
    restaurant = fetch_restaurant_summary_from_local(restaurant_name)
    # write to cache 
    store_restaurant_summary_in_cache(restaurant)
    # print response 
    print("Using uncached result!")
    return (end-start)*1000


def fetch_restaurant_summary_from_db(restaurant_name):
    """
    from directory from db 
    """
    start = time.perf_counter()
    resp = dynamodb.query(
        TableName="Restaurants",
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
    print_restaurant(restaurant)
    # return 
    return (end-start)*1000


def scan_restaurant(limit=100):
    """
    """
    names = []
    res = dynamodb.scan(
        TableName="Restaurants",
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


class ObjectEncoder(json.JSONEncoder):
    def default(self, o):
        return o.__dict__


def store_restaurant_summary_in_cache(restaurant):
    """
    store to cache
    """
    key = restaurant.name
    r.set(key, json.dumps(restaurant, cls=ObjectEncoder), ex=900)

    return True


def fetch_restaurant_summary_from_cache(restaurant_name):
    """
    fetch from cache
    """
    response = r.get(restaurant_name)
    if response:
        data = json.loads(response)
        restaurant = Restaurant(data)
        restaurant.reviews = [Review(review) for review in data["reviews"]]
        return restaurant
    return None



def print_restaurant(restaurant):
    """
    """
    print(restaurant)
    for review in restaurant.reviews:
        print(review)




def fetch_restaurant_summary_from_local(restaurant_name):
    restaurants = []
    reviews = []

    with open("items.json", "r") as f:
        for row in f:
            data = json.loads(row)
            if data["PK"].startswith("REST#"):
                restaurants.append(Restaurant(data))
            else:
                reviews.append(Review(data))

    restaurant = list(filter(lambda x: x.name == restaurant_name, restaurants))[0]
    filtered_reviews = filter(lambda x: x.restaurant == restaurant_name, reviews)

    restaurant.reviews = sorted(
        filtered_reviews, key=lambda x: x.created_at, reverse=True
    )[:5]

    return restaurant



def test_connect():
    """
    test connect redis 
    """
    r = redis.Redis(host=HOST)
    r.ping()
    print("Connected to Redis!")


def plot_performance(db_latencies, cache_latencies):
    """
    """
    fig,axes = plt.subplots(1,1,figsize=(10,5))
    axes.plot(db_latencies,'k--o',markersize=3,linewidth=0.5)
    axes.plot(cache_latencies,'b--o',markersize=3,linewidth=0.5)
    axes.legend(['redis-query','db-query'])
    axes.set_ylabel('milisecond')
    axes.set_xlabel('read db')
    axes.set_yticks([k for k in range(10)])
    axes.set_ylim(0,10)
    fig.suptitle('cache latency')
    fig.savefig('redis-ddb-performance.png')


  
# ===================================================================
if __name__=="__main__":
    # test_connect()
    names = scan_restaurant(limit=100)
    db_latencies = [fetch_restaurant_summary_from_db(name) for name in names]
    cache_latencies = [fetch_restaurant_summary(name) for name in names]
    plot_performance(db_latencies[1:], cache_latencies[1:])






