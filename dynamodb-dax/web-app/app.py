# Hai Tran 13 JUN 2022 
# Setup flask 

from flask import Flask
from flask import Flask, render_template
from dax_client import *

app = Flask(__name__)

@app.route("/")
def index():
    return render_template('index.html')

@app.route("/query-dax")
def query_dax():
    dic = get_items_by_primary_key(TABLE_NAME, mode='dax', no_user=100)
    return render_template('query_dax.html', items=dic['items'], latencies=dic['latencies'])

@app.route("/query-ddb")
def query_ddb():
    dic = get_items_by_primary_key(TABLE_NAME, mode='ddb', no_user=100)
    return render_template('query_ddb.html', items=dic['items'], latencies=dic['latencies'])


if __name__=="__main__":
    app.run(host='0.0.0.0', port=5000, debug=True)