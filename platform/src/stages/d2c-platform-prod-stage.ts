import { Stage, StageProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { D2cPlatformStack } from '@d2c-platform/infra';

export interface D2cPlatformProdStageProps extends StageProps {
  readonly stackName?: string;
}

export class D2cPlatformProdStage extends Stage {
  public readonly platformStack: D2cPlatformStack;

  constructor(scope: Construct, id: string, props: D2cPlatformProdStageProps = {}) {
    super(scope, id, props);

    this.platformStack = new D2cPlatformStack(this, props.stackName ?? 'D2cPlatformStack', {
      env: props.env,
    });
  }
}
