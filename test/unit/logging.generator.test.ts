import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveConfig } from '../../src/config/index.js';
import { generateProject } from '../../src/generators/generate-project.js';
import { LoggingGenerator } from '../../src/generators/features/logging/logging.generator.js';
import { createFileSystem } from '../../src/utils/filesystem.js';

describe('LoggingGenerator', () => {
  let temporaryDirectory: string;

  afterEach(async () => {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  async function generate(
    overrides: Parameters<typeof resolveConfig>[0] = {},
  ) {
    temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'ironveil-logging-'),
    );
    const { destination } = await generateProject(
      resolveConfig({ projectName: 'test-api', ...overrides }),
      temporaryDirectory,
    );
    const fs = createFileSystem();
    const read = (...segments: string[]) =>
      fs.readFile(path.join(destination, ...segments));
    return { fs, destination, read };
  }

  it('always runs', () => {
    const generator = new LoggingGenerator();
    expect(generator.name).toBe('logging');
    expect(generator.shouldRun(resolveConfig({ projectName: 'a' }))).toBe(true);
  });

  it('generates a pino logging module with redaction and request IDs', async () => {
    const { read } = await generate();

    const loggingModule = await read('src/infrastructure/logging/logging.module.ts');
    expect(loggingModule).toContain('LoggerModule.forRootAsync');
    expect(loggingModule).toContain("'req.headers.authorization'");
    expect(loggingModule).toContain("'*.password'");
    expect(loggingModule).toContain('x-request-id');
    expect(loggingModule).toContain('randomUUID');
    expect(loggingModule).toContain("target: 'pino-pretty'");
    expect(loggingModule).toContain("nodeEnv === 'development'");
    expect(loggingModule).not.toContain('{{');
  });

  it('registers the logging module and wires the logger in main.ts', async () => {
    const { read } = await generate();

    const infra = await read('src/infrastructure/infrastructure.module.ts');
    expect(infra).toContain("import { LoggingModule } from './logging/logging.module';");
    expect(infra).toContain('LoggingModule,');

    const main = await read('src/main.ts');
    expect(main).toContain('bufferLogs: true');
    expect(main).toContain('app.useLogger(app.get(Logger))');
  });

  it('adds logging dependencies, with pino-pretty as a dev dependency', async () => {
    const { read } = await generate();
    const pkg = JSON.parse(await read('package.json')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.['nestjs-pino']).toBe('^5.3.1');
    expect(pkg.dependencies?.pino).toBe('^10.4.0');
    expect(pkg.dependencies?.['pino-http']).toBe('^11.0.0');
    expect(pkg.dependencies?.['pino-pretty']).toBeUndefined();
    expect(pkg.devDependencies?.['pino-pretty']).toBe('^13.2.0');
  });

  it('exposes LOG_LEVEL in config, env validation, .env.example and the README', async () => {
    const { read } = await generate();

    expect(await read('.env.example')).toContain('LOG_LEVEL=info');

    const env = await read('src/infrastructure/config/environment.ts');
    expect(env).toContain('LOG_LEVEL: z');
    expect(env).toContain("'silent'");

    const configuration = await read('src/infrastructure/config/configuration.ts');
    expect(configuration).toContain('logLevel: process.env.LOG_LEVEL');

    const readme = await read('README.md');
    expect(readme).toContain('`LOG_LEVEL`');
    expect(readme).toContain('Structured logging');
  });
});
