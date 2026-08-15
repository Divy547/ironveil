import type { GenerationResult } from '../../generators/generate-project.js';
import { GenerationError } from '../../generators/core/generation-error.js';
import { ConfigError } from '../../config/resolve.js';
import { getPackageManagerSpec } from '../../utils/package-manager.js';

export function getFeatureSummaries(config: GenerationResult['config']): string[] {
  const features: string[] = [];

  if (config.database === 'postgres' && config.orm === 'prisma') {
    features.push('PostgreSQL + Prisma ORM');
  }

  if (config.auth === 'jwt') {
    features.push('JWT Authentication');
  }

  if (config.swagger) {
    features.push('Swagger API Documentation');
  }

  if (config.redis) {
    features.push('Redis Infrastructure');
  }

  if (config.docker) {
    features.push('Docker & Docker Compose');
  }

  if (config.testing) {
    features.push('Jest Unit & E2E Testing');
  }

  if (config.ci) {
    features.push('GitHub Actions CI');
  }

  return features;
}

export function getNextSteps(result: GenerationResult): string[] {
  const pmSpec = getPackageManagerSpec(result.config.packageManager);
  const steps: string[] = [
    `cd ${result.projectName}`,
    'cp .env.example .env',
  ];

  if (result.config.database === 'postgres' && result.config.orm === 'prisma') {
    steps.push(pmSpec.install, pmSpec.prisma('generate'));
  } else {
    steps.push(pmSpec.install);
  }

  steps.push(pmSpec.run('start:dev'));

  return steps;
}

export function formatSuccessOutput(result: GenerationResult): string {
  const features = getFeatureSummaries(result.config);
  const nextSteps = getNextSteps(result);

  const lines: string[] = [
    'Project created successfully.',
    '',
    `Project:  ${result.projectName}`,
    `Location: ${result.destination}`,
    '',
    'Features:',
    ...features.map((f) => `  • ${f}`),
    '',
    `Files generated: ${result.files.length}`,
    '',
    'Next steps:',
    ...nextSteps.map((step) => `  ${step}`),
  ];

  return lines.join('\n');
}

export function formatDryRunOutput(result: GenerationResult): string {
  const features = getFeatureSummaries(result.config);

  const lines: string[] = [
    'Dry run completed.',
    '',
    `Project:     ${result.projectName}`,
    `Destination: ${result.destination}`,
    '',
    'Planned Features:',
    ...features.map((f) => `  • ${f}`),
    '',
    'Planned Generators:',
    `  ${result.generators.join(', ')}`,
    '',
    `Files to generate: ${result.files.length}`,
    '',
    'Note: Dry run complete. No project was created on disk.',
  ];

  return lines.join('\n');
}

export function formatFailureOutput(error: unknown): string {
  if (error instanceof GenerationError) {
    const lines = ['Generation failed', ''];
    if (error.projectName) {
      lines.push(`Project:   ${error.projectName}`);
    }
    if (error.generatorName) {
      lines.push(`Generator: ${error.generatorName}`);
    }
    lines.push(`Reason:    ${error.message}`);
    if (
      error.cause &&
      error.cause instanceof Error &&
      error.cause.message !== error.message
    ) {
      lines.push(`Original:  ${error.cause.message}`);
    }
    return lines.join('\n');
  }

  if (error instanceof ConfigError) {
    return `Invalid configuration\n\nReason:\n  ${error.message.split('\n').join('\n  ')}`;
  }

  return `Generation failed\n\nReason: ${error instanceof Error ? error.message : String(error)}`;
}
