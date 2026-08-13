import * as p from '@clack/prompts';
import type { Auth } from '../../config/index.js';
import type { CreateCommandOptions } from '../options/create.options.js';

export async function promptCreateOptions(): Promise<CreateCommandOptions> {
  const redis = await p.confirm({
    message: 'Enable Redis?',
    initialValue: false,
  });

  if (p.isCancel(redis)) {
    p.cancel('Operation cancelled.');
    process.exit(130);
  }

  const auth = await p.select<Auth>({
    message: 'Authentication',
    options: [
      {
        value: 'none',
        label: 'None',
      },
      {
        value: 'jwt',
        label: 'JWT',
      },
    ],
    initialValue: 'none',
  });

  if (p.isCancel(auth)) {
    p.cancel('Operation cancelled.');
    process.exit(130);
  }

  const swagger = await p.confirm({
    message: 'Include Swagger?',
    initialValue: true,
  });

  if (p.isCancel(swagger)) {
    p.cancel('Operation cancelled.');
    process.exit(130);
  }

  const docker = await p.confirm({
    message: 'Include Docker?',
    initialValue: true,
  });

  if (p.isCancel(docker)) {
    p.cancel('Operation cancelled.');
    process.exit(130);
  }

  const ci = await p.confirm({
    message: 'Include GitHub Actions?',
    initialValue: true,
  });

  if (p.isCancel(ci)) {
    p.cancel('Operation cancelled.');
    process.exit(130);
  }

  const testing = await p.confirm({
    message: 'Include testing?',
    initialValue: true,
  });

  if (p.isCancel(testing)) {
    p.cancel('Operation cancelled.');
    process.exit(130);
  }

  return {
    redis,
    auth,
    swagger,
    docker,
    ci,
    testing,
  };
}