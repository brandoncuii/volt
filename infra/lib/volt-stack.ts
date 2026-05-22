import { Stack, StackProps, Duration, CfnOutput, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Runtime, Architecture } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { HttpApi, CorsHttpMethod, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class VoltStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Edge-weight cache. Driving distance/time between charger pairs is
    // expensive to compute (Distance Matrix API call) and immutable in
    // practice — keep entries indefinitely.
    const edgeCache = new Table(this, 'EdgeCache', {
      partitionKey: { name: 'pk', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY, // ok for v1; switch to RETAIN before any real traffic
    });

    const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!googleMapsApiKey) {
      throw new Error(
        'GOOGLE_MAPS_API_KEY must be set when synthing/deploying. ' +
          'Set it in your shell env before running cdk synth/deploy.',
      );
    }

    const api = new NodejsFunction(this, 'ApiFunction', {
      entry: join(__dirname, '..', '..', 'server', 'src', 'lambda.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_20_X,
      architecture: Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.seconds(15),
      bundling: {
        format: OutputFormat.ESM,
        target: 'node20',
        minify: true,
        sourceMap: true,
        externalModules: ['@aws-sdk/*'], // provided by the Lambda runtime
        // superchargers.json is imported at runtime via fs.readFileSync,
        // not a TS import, so esbuild won't bundle it automatically.
        // The loader uses __dirname-relative resolution; after bundling
        // everything collapses to the bundle root, so the JSON has to land
        // next to index.mjs (not in a data/ subdir).
        commandHooks: {
          beforeBundling: () => [],
          beforeInstall: () => [],
          afterBundling: (inputDir: string, outputDir: string) => [
            `cp ${inputDir}/server/src/data/superchargers.json ${outputDir}/superchargers.json`,
          ],
        },
        banner:
          // serverless-http is CJS; ESM bundle needs require shim
          "import{createRequire as topLevelCreateRequire}from'module';const require=topLevelCreateRequire(import.meta.url);",
      },
      environment: {
        EDGE_CACHE_TABLE: edgeCache.tableName,
        GOOGLE_MAPS_API_KEY: googleMapsApiKey,
        // Stay on Haversine in prod for v1: the Distance Matrix path needs
        // a pre-warmed cache to be feasible inside Lambda's response budget.
        // Flip back to 'false' after writing an offline cache-fill script.
        USE_HAVERSINE_EDGES: 'true',
        NODE_OPTIONS: '--enable-source-maps',
      },
    });

    edgeCache.grantReadWriteData(api);

    const httpApi = new HttpApi(this, 'VoltHttpApi', {
      corsPreflight: {
        allowOrigins: ['*'], // tighten to the Vercel URL after first deploy
        allowMethods: [
          CorsHttpMethod.GET,
          CorsHttpMethod.POST,
          CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['content-type'],
      },
    });

    httpApi.addRoutes({
      path: '/{proxy+}',
      methods: [HttpMethod.ANY],
      integration: new HttpLambdaIntegration('ApiIntegration', api),
    });

    new CfnOutput(this, 'ApiUrl', {
      value: httpApi.apiEndpoint,
      description: 'Public HTTPS endpoint. Set VITE_API_URL in client/.env to this',
    });

    new CfnOutput(this, 'EdgeCacheTableName', {
      value: edgeCache.tableName,
    });
  }
}
