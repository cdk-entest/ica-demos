#!/bin/bash
# install updates
yum update -y

# install OpenSWNA
yum install -y openswan

# configure AWS CLI for ec2-user