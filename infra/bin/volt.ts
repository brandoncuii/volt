#!/usr/bin/env tsx
import { App } from 'aws-cdk-lib';
import { VoltStack } from '../lib/volt-stack.js';

const app = new App();

new VoltStack(app, 'VoltStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  description: 'Volt EV trip planner — Lambda + HTTP API + DynamoDB edge cache',
});
