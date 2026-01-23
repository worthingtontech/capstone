# D2C Food Platform

A direct-to-consumer ordering and logistics customization platform for a medium-sized food distributor. This monorepo contains all code for the cloud-based e-commerce platform deployed on AWS.

## What is this?

This platform enables customers to:
- Browse and search products with a fast search experience
- Place orders directly with secure checkout
- Customize delivery preferences (slots, pick-up points, special instructions)
- Track orders in real-time

## Project Structure

```
├── apps/
│   └── web/                    # React frontend application
├── packages/
│   ├── api-handlers/           # Lambda function handlers
│   ├── shared/                 # Shared types, utilities, constants
│   └── ui/                     # Shared UI components (future)
├── infra/                      # AWS CDK infrastructure
├── docs/                       # Architecture and design documentation
└── scripts/                    # Build and deployment scripts
```

## Tech Stack

- Frontend: React (hosted on S3 + CloudFront)
- Backend: AWS Lambda + API Gateway (serverless)
- Databases: RDS PostgreSQL (inventory), DynamoDB (logistics, clickstream)
- Search: Amazon OpenSearch
- Auth: Amazon Cognito
- IaC: AWS CDK (TypeScript)

## Prerequisites

- Node.js 18+
- PNPM 8+ (`npm install -g pnpm`)
- AWS CLI configured
- AWS CDK CLI (`pnpm add -g aws-cdk`)

## Setup

```bash
pnpm install
```

## Commands

```bash
pnpm build                 # Build all packages
pnpm test                  # Run all tests
pnpm lint                  # Lint all packages

# Infrastructure
pnpm cdk synth             # Synthesize CloudFormation
pnpm cdk diff              # Compare with deployed stack
pnpm cdk deploy            # Deploy to AWS
```

## Documentation

See `docs/` for architecture details and design decisions.
