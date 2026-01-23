# Architecture Overview

Minimal configuration optimized for demo/school project use. All resources use `RemovalPolicy.DESTROY` for clean teardown.

## Network Layer

- VPC with 2 AZs, isolated subnets (no NAT Gateway)
- VPC endpoints for DynamoDB, S3, and Secrets Manager

## Data Layer

- DynamoDB (PAY_PER_REQUEST) for logistics preferences and clickstream
- RDS PostgreSQL (t3.micro, single-AZ, 20GB) for inventory
- OpenSearch (single t3.small.search node, 10GB)

## Application Layer

- Lambda (128MB) in VPC with access to data stores
- API Gateway with Cognito authorization

## Frontend

- S3 bucket with CloudFront distribution
- Origin Access Control for secure S3 access

## Security

- Storage encryption enabled
- SSL/TLS enforced
- Least privilege IAM policies
