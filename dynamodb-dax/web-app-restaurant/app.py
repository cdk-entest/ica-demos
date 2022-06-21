# Hai Tran 13 JUN 2022 
# Setup flask 

from flask import Flask
from flask import Flask, render_template
from dax_client import *
import redis_client


app = Flask(__name__)

@app.route("/")
def index():
    return render_template('index.html')

@app.route("/query-ddb")
def query_dax():
    restaurants = fetch_multiple_restaurants(mode='ddb', limit=120)
    return render_template('query_ddb.html', restaurants=restaurants[10:])

@app.route("/query-dax")
def query_ddb():
    restaurants = fetch_multiple_restaurants(mode='dax', limit=120)
    return render_template('query_dax.html', restaurants=restaurants[10:])


@app.route("/query-redis")
def query_redis():
    restaurants = redis_client.fetch_multiple_restaurants(mode='cache', limit=120)
    return render_template('query_redis.html', restaurants=restaurants[10:])


if __name__=="__main__":
    app.run(host='0.0.0.0', port=5000, debug=True)