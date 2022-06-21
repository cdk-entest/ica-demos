# Hai Tran 13 JUN 2022 
# Setup flask 

from flask import Flask
from flask import Flask, render_template
from redis_client import *

app = Flask(__name__)

@app.route("/")
def index():
    return render_template('index.html')

@app.route("/query-ddb")
def query_dax():
    restaurants = fetch_multiple_restaurants(mode='ddb', limit=100)
    return render_template('query_ddb.html', restaurants=restaurants)

@app.route("/query-dax")
def query_ddb():
    restaurants = fetch_multiple_restaurants(mode='cache', limit=100)
    return render_template('query_cache.html', restaurants=restaurants)


if __name__=="__main__":
    app.run(host='0.0.0.0', port=5000, debug=True)