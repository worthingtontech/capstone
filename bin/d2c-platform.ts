#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { D2cPlatformStack } from '../lib/d2c-platform-stack';

const app = new cdk.App();

new D2cPlatformStack(app, 'D2cPlatformStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  }
});
