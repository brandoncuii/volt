import serverless from 'serverless-http';
import { createApp } from './app.js';

// AWS Lambda + API Gateway HTTP API entry point. Built by CDK (see
// infra/lib/volt-stack.ts) using esbuild. The handler shape matches
// `aws-cdk-lib/aws-lambda-nodejs` defaults.
const app = createApp();
export const handler = serverless(app);
