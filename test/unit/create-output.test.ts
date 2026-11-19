import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../../src/config/index.js';
import type { GenerationResult } from '../../src/generators/generate-project.js';
import { GenerationError } from '../../src/generators/core/generation-error.js';
import { ConfigError } from '../../src/config/resolve.js';
import {
  formatSuccessOutput,
  formatDryRunOutput,
  formatFailureOutput,
  getFeatureSummaries,
  getNextSteps,
} from '../../src/cli/output/create-output.js';

describe('create-output', () => {
  it('formats success output correctly for default configuration', () => {
    const config = resolveConfig({
      projectName: 'my-api',
    });

    const result: GenerationResult = {
      projectName: 'my-api',
      destination: '/path/to/my-api',
      config,
      generators: ['base', 'config', 'prisma', 'swagger', 'testing', 'docker', 'ci'],
      files: ['package.json', 'src/main.ts', 'prisma/schema.prisma'],
    };

    const output = formatSuccessOutput(result);

    expect(output).toContain('Project created successfully.');
    expect(output).toContain('Project:  my-api');
    expect(output).toContain('Location: /path/to/my-api');
    expect(output).toContain('• PostgreSQL + Prisma ORM');
    expect(output).toContain('• Swagger API Documentation');
    expect(output).toContain('• Docker & Docker Compose');
    expect(output).toContain('• Jest Unit & E2E Testing');
    expect(output).toContain('• GitHub Actions CI');
    expect(output).not.toContain('Redis Infrastructure');
    expect(output).not.toContain('JWT Authentication');
    expect(output).toContain('Files generated: 3');
    expect(output).toContain('cd my-api');
    expect(output).toContain('cp .env.example .env');
    expect(output).toContain('npx prisma generate');
    expect(output).toContain('npm run start:dev');
  });

  it('formats success output correctly for full-feature configuration', () => {
    const config = resolveConfig({
      projectName: 'full-api',
      database: 'postgres',
      orm: 'prisma',
      redis: true,
      auth: 'jwt',
      swagger: true,
      docker: true,
      ci: true,
      testing: true,
    });

    const result: GenerationResult = {
      projectName: 'full-api',
      destination: '/path/to/full-api',
      config,
      generators: ['base', 'config', 'prisma', 'redis', 'auth', 'swagger', 'testing', 'docker', 'ci'],
      files: ['package.json', 'src/main.ts'],
    };

    const output = formatSuccessOutput(result);

    expect(output).toContain('• PostgreSQL + Prisma ORM');
    expect(output).toContain('• JWT Authentication');
    expect(output).toContain('• Swagger API Documentation');
    expect(output).toContain('• Redis Infrastructure');
    expect(output).not.toContain('Background job queue');
    expect(output).toContain('• Docker & Docker Compose');
    expect(output).toContain('• Jest Unit & E2E Testing');
    expect(output).toContain('• GitHub Actions CI');
  });

  it('lists email when it is enabled, and not otherwise', () => {
    const withMail = formatSuccessOutput({
      projectName: 'm-api',
      destination: '/path/to/m-api',
      config: resolveConfig({ projectName: 'm-api', mail: true }),
      generators: ['base', 'mail'],
      files: ['package.json'],
    });
    const without = formatSuccessOutput({
      projectName: 'm-api',
      destination: '/path/to/m-api',
      config: resolveConfig({ projectName: 'm-api' }),
      generators: ['base'],
      files: ['package.json'],
    });

    expect(withMail).toContain('• Email (SMTP via nodemailer)');
    expect(without).not.toContain('Email');
  });

  it('lists the job queue right after Redis when it is enabled', () => {
    const config = resolveConfig({ projectName: 'q-api', redis: true, queue: true });

    const output = formatSuccessOutput({
      projectName: 'q-api',
      destination: '/path/to/q-api',
      config,
      generators: ['base', 'redis', 'queue'],
      files: ['package.json'],
    });

    const lines = output.split('\n').map((line) => line.trim());
    const redis = lines.indexOf('• Redis Infrastructure');
    expect(redis).toBeGreaterThan(-1);
    expect(lines[redis + 1]).toBe('• Background job queue (BullMQ)');
  });

  it('formats dry-run output correctly', () => {
    const config = resolveConfig({
      projectName: 'dry-api',
      redis: true,
    });

    const result: GenerationResult = {
      projectName: 'dry-api',
      destination: '/path/to/dry-api',
      config,
      generators: ['base', 'config', 'prisma', 'redis', 'swagger', 'testing', 'docker', 'ci'],
      files: ['package.json', 'src/main.ts'],
    };

    const output = formatDryRunOutput(result);

    expect(output).toContain('Dry run completed.');
    expect(output).toContain('Project:     dry-api');
    expect(output).toContain('Destination: /path/to/dry-api');
    expect(output).toContain('Planned Features:');
    expect(output).toContain('• Redis Infrastructure');
    expect(output).toContain('Planned Generators:');
    expect(output).toContain('base, config, prisma, redis, swagger, testing, docker, ci');
    expect(output).toContain('Files to generate: 2');
    expect(output).toContain('Note: Dry run complete. No project was created on disk.');
  });

  it('formats GenerationError correctly with generator and cause', () => {
    const original = new Error('Disk full');
    const genError = new GenerationError('Write operation failed', {
      projectName: 'err-api',
      generatorName: 'prisma',
      destination: '/path/to/err-api',
      cause: original,
    });

    const output = formatFailureOutput(genError);

    expect(output).toContain('Generation failed');
    expect(output).toContain('Project:   err-api');
    expect(output).toContain('Generator: prisma');
    expect(output).toContain('Reason:    Write operation failed');
    expect(output).toContain('Original:  Disk full');
    expect(output).not.toContain('at Object.');
  });

  it('formats ConfigError correctly', () => {
    const configError = new ConfigError('projectName: Project name is invalid');
    const output = formatFailureOutput(configError);

    expect(output).toContain('Invalid configuration');
    expect(output).toContain('Reason:');
    expect(output).toContain('projectName: Project name is invalid');
  });

  it('formats unknown errors safely', () => {
    const output = formatFailureOutput('Unexpected fatal error');
    expect(output).toContain('Generation failed');
    expect(output).toContain('Reason: Unexpected fatal error');
  });

  it('formats next steps correctly for pnpm with and without prisma', () => {
    const pnpmPrismaConfig = resolveConfig({
      projectName: 'pnpm-api',
      packageManager: 'pnpm',
      database: 'postgres',
      orm: 'prisma',
    });
    const pnpmPrismaResult: GenerationResult = {
      projectName: 'pnpm-api',
      destination: '/path/to/pnpm-api',
      config: pnpmPrismaConfig,
      generators: ['base', 'config', 'prisma'],
      files: ['package.json'],
    };
    expect(getNextSteps(pnpmPrismaResult)).toEqual([
      'cd pnpm-api',
      'cp .env.example .env',
      'pnpm install',
      'pnpm exec prisma generate',
      'pnpm run start:dev',
    ]);
  });

  it('formats next steps correctly for yarn with and without prisma', () => {
    const yarnPrismaConfig = resolveConfig({
      projectName: 'yarn-api',
      packageManager: 'yarn',
      database: 'postgres',
      orm: 'prisma',
    });
    const yarnPrismaResult: GenerationResult = {
      projectName: 'yarn-api',
      destination: '/path/to/yarn-api',
      config: yarnPrismaConfig,
      generators: ['base', 'config', 'prisma'],
      files: ['package.json'],
    };
    expect(getNextSteps(yarnPrismaResult)).toEqual([
      'cd yarn-api',
      'cp .env.example .env',
      'yarn install',
      'yarn prisma generate',
      'yarn start:dev',
    ]);
  });

  describe('AI agent files summary', () => {
    it('lists AGENTS.md and CLAUDE.md for ai=agents', () => {
      const config = resolveConfig({ projectName: 'a', ai: 'agents' });

      expect(getFeatureSummaries(config)).toContain(
        'AI agent files (AGENTS.md, CLAUDE.md)',
      );
    });

    it('also lists Cursor rules and Copilot instructions for ai=all', () => {
      const config = resolveConfig({ projectName: 'a', ai: 'all' });

      expect(getFeatureSummaries(config)).toContain(
        'AI agent files (AGENTS.md, CLAUDE.md, Cursor rules, Copilot instructions)',
      );
    });

    it('lists nothing for ai=none', () => {
      const config = resolveConfig({ projectName: 'a', ai: 'none' });

      expect(
        getFeatureSummaries(config).some((f) => f.includes('AI agent files')),
      ).toBe(false);
    });
  });
});
