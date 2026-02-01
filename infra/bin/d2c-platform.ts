#!/usr/bin/env node
import 'source-map-support/register';
import { App } from 'aws-cdk-lib';
import { D2cPlatformDevStack, D2cPlatformStack } from '../src/stacks';

const app = new App();

new D2cPlatformStack(app, 'D2cPlatformStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

new D2cPlatformDevStack(app, 'D2cPlatformDevStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
