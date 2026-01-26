import { CfnParameter, Stack, StackProps } from 'aws-cdk-lib';
import { LinuxBuildImage } from 'aws-cdk-lib/aws-codebuild';
import {
  CodePipeline,
  CodePipelineSource,
  ShellStep,
} from 'aws-cdk-lib/pipelines';
import { Construct } from 'constructs';
import { D2cPlatformStage } from '../stages';

export class D2cPlatformPipelineStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const connectionArn = new CfnParameter(this, 'CodeStarConnectionArn', {
      type: 'String',
      description: 'CodeStar connection ARN for GitHub.',
    });
    const repoOwner = new CfnParameter(this, 'GitHubOwner', {
      type: 'String',
      description: 'GitHub organization or user name.',
      default: 'Cloudmancermedia',
    });
    const repoName = new CfnParameter(this, 'GitHubRepo', {
      type: 'String',
      description: 'GitHub repository name.',
      default: 'capstone',
    });
    const repoBranch = new CfnParameter(this, 'GitHubBranch', {
      type: 'String',
      description: 'GitHub branch to track.',
      default: 'main',
    });

    const source = CodePipelineSource.connection(
      `${repoOwner.valueAsString}/${repoName.valueAsString}`,
      repoBranch.valueAsString,
      { connectionArn: connectionArn.valueAsString },
    );

    const pipeline = new CodePipeline(this, 'Pipeline', {
      pipelineName: 'D2cPlatformPipeline',
      synth: new ShellStep('Synth', {
        input: source,
        commands: [
          'corepack enable',
          'corepack prepare pnpm@9.15.0 --activate',
          'if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; else pnpm install; fi',
          'pnpm -r build',
          'pnpm -r test',
          'pnpm --filter @d2c-platform/platform cdk synth',
        ],
      }),
      codeBuildDefaults: {
        buildEnvironment: {
          buildImage: LinuxBuildImage.STANDARD_7_0,
        },
      },
    });

    const prodStage = new D2cPlatformStage(this, 'Production', {
      env: {
        account: Stack.of(this).account,
        region: Stack.of(this).region,
      },
    });

    const deployStage = pipeline.addStage(prodStage);

    deployStage.addPost(
      new ShellStep('DeployFrontend', {
        commands: [
          'corepack enable',
          'corepack prepare pnpm@9.15.0 --activate',
          'if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; else pnpm install; fi',
          'pnpm --filter @d2c-platform/web build',
          'aws s3 sync apps/web/dist s3://$FRONTEND_BUCKET --delete',
          'aws cloudfront create-invalidation --distribution-id $FRONTEND_DISTRIBUTION_ID --paths "/*"',
        ],
        envFromCfnOutputs: {
          FRONTEND_BUCKET: prodStage.platformStack.frontendBucketNameOutput,
          FRONTEND_DISTRIBUTION_ID: prodStage.platformStack.frontendDistributionIdOutput,
        },
      }),
    );
  }
}
