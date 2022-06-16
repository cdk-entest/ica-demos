"""
Hai Tran: 15 JUNE 2022 
get transit gateway id from region and 
create peering tgw attachment 
aws ec2 describe-transit-gateway-peering-attachments --region us-east-1
"""

import boto3

def get_tgw_id_from_region(region_name: str) -> str:
  """
  get tgw id given region 
  """
  client = boto3.client('ec2', region_name=region_name)
  query = client.describe_transit_gateways(
    Filters = [
        {
            'Name': 'state',
            'Values': [
                'available',
            ]
        }
    ]
  )
  tgw_id = (query['TransitGateways'][0]['TransitGatewayId'])
  account_id=(query['TransitGateways'][0]['OwnerId'])
  return tgw_id,account_id


# print tgw id
tgw_us_east_1,account_id =  get_tgw_id_from_region(region_name='us-east-1')
tgw_us_west_1,account_id =  get_tgw_id_from_region(region_name='us-west-1')
print(f'tgw-us-east-1: {tgw_us_east_1}')
print(f'tgw-us-west-1: {tgw_us_west_1}')

# create tgw peering attachment 
client = boto3.client('ec2', region_name='us-east-1') 
response = client.create_transit_gateway_peering_attachment(
    TransitGatewayId=(tgw_us_east_1),
    PeerTransitGatewayId=(tgw_us_west_1),
    PeerAccountId=(account_id),
    PeerRegion='us-west-1'
)