import { Stack, StackProps } from 'aws-cdk-lib';
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

    const connectionArn = 'arn:aws:codeconnections:us-east-1:963692744767:connection/4edd5f27-c166-4eb3-8e59-2f5f90442032';
    const repoOwner = this.node.tryGetContext('githubOwner') || 'Cloudmancermedia';
    const repoName = this.node.tryGetContext('githubRepo') || 'capstone';
    const repoBranch = this.node.tryGetContext('githubBranch') || 'main';

    const source = CodePipelineSource.connection(
      `${repoOwner}/${repoName}`,
      repoBranch,
      { connectionArn },
    );

    const pipeline = new CodePipeline(this, 'Pipeline', {
      pipelineName: 'D2cPlatformPipeline',
      crossAccountKeys: true,
      synth: new ShellStep('Synth', {
        input: source,
        commands: [
          'n 24',
          'node --version',
          'corepack enable',
          'corepack prepare pnpm@9.15.0 --activate',
          'if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; else pnpm install; fi',
          'pnpm --filter @d2c-platform/infra build',
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

    // Dev stage - deploys automatically on push to main
    pipeline.addStage(
      new D2cPlatformStage(this, 'Dev', {
        env: {
          account: '963692744767',
          region: 'us-east-1',
        },
        stackName: 'D2cPlatformDevStack',
      }),
    );
  }
}
