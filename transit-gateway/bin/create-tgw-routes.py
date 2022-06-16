"""
Hai Tran: June 15 2022 
create tgw routes 
double check tgw-route-table-id and tgw-attachment-id 
because query here check inex 0 only 
"""

import boto3

def get_tgw_attachments(region_name: str):
  """
  """
  client = boto3.client('ec2', region_name='us-east-1')
  query = client.describe_transit_gateway_attachments(
      Filters=[
          {
              'Name': 'resource-type',
              'Values': [
                  'peering',
              ]
          },
          {
              'Name': 'state',
              'Values': [
                  'available',
              ]
          }
      ]
  )
  #
  print(query)
  # parse response 
  tgw_rt_id=(query['TransitGatewayAttachments'][0]['Association']['TransitGatewayRouteTableId'])
  tgw_attachment_id=(query['TransitGatewayAttachments'][0]['TransitGatewayAttachmentId'])
  # return 
  return tgw_rt_id, tgw_attachment_id



def create_tgw_route(region_name: str, dest_cidr: str):
  """
  create transit gateway route us-east-1
  """
  # client 
  client = boto3.client('ec2', region_name=region_name)
  # get tgw-route-table-id and tgw-attachment-id
  tgw_rt_id, tgw_attachment_id = get_tgw_attachments(region_name)
  print(f'tgw-rt-id-{region_name}: {tgw_rt_id}')
  print(f'tgw-attachment-id: {tgw_attachment_id}')
  # create tgw-route
  response = client.create_transit_gateway_route(
      DestinationCidrBlock=dest_cidr,
      TransitGatewayRouteTableId=(tgw_rt_id),
      TransitGatewayAttachmentId=(tgw_attachment_id)
  )
  # 
  print(response)

# create tgw routes 
# create_tgw_route(region_name='us-east-1', dest_cidr='172.16.1.0/24')
# create_tgw_route(region_name='us-west-1', dest_cidr='172.16.0.0/24')
