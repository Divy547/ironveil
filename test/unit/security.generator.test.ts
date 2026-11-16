import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveConfig } from '../../src/config/index.js';
import { generateProject } from '../../src/generators/generate-project.js';
import { SecurityGenerator } from '../../src/generators/features/security/security.generator.js';
import { createFileSystem } from '../../src/utils/filesystem.js';

describe('SecurityGenerator', () => {
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
      path.join(os.tmpdir(), 'ironveil-security-'),
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
    const generator = new SecurityGenerator();
    expect(generator.name).toBe('security');
    expect(generator.shouldRun(resolveConfig({ projectName: 'a' }))).toBe(true);
  });

  it('generates a global throttler guard driven by config', async () => {
    const { read } = await generate();

    const securityModule = await read('src/infrastructure/security/security.module.ts');
    expect(securityModule).toContain('ThrottlerModule.forRootAsync');
    expect(securityModule).toContain('APP_GUARD');
    expect(securityModule).toContain('ThrottlerGuard');
    expect(securityModule).toContain("'security.throttle.limit'");
    expect(securityModule).toContain("'security.throttle.ttl'");
    expect(securityModule).not.toContain('{{');
  });

  it('applies helmet and env-driven CORS in setupSecurity', async () => {
    const { read } = await generate({ swagger: false });

    const setup = await read('src/infrastructure/security/security.setup.ts');
    expect(setup).toContain("import helmet from 'helmet';");
    expect(setup).toContain('app.use(helmet());');
    expect(setup).toContain("'security.corsOrigins'");
    expect(setup).toContain('app.enableCors');
    expect(setup).not.toContain('express');
    expect(setup).not.toContain('{{');
  });

  it('relaxes the content security policy only for the Swagger docs route', async () => {
    const { read } = await generate({ swagger: true });

    const setup = await read('src/infrastructure/security/security.setup.ts');
    expect(setup).toContain("from 'express'");
    expect(setup).toContain('contentSecurityPolicy: false');
    expect(setup).toContain("req.path.startsWith('/api/docs')");
    expect(setup).not.toContain('{{');
  });

  it('registers the module and calls setupSecurity in main.ts', async () => {
    const { read } = await generate();

    const infra = await read('src/infrastructure/infrastructure.module.ts');
    expect(infra).toContain("import { SecurityModule } from './security/security.module';");
    expect(infra).toContain('SecurityModule,');

    const main = await read('src/main.ts');
    expect(main).toContain("import { setupSecurity } from './infrastructure/security/security.setup';");
    expect(main).toContain('setupSecurity(app);');
  });

  it('exempts health probes from rate limiting', async () => {
    const { read } = await generate();

    const controller = await read('src/modules/health/health.controller.ts');
    expect(controller).toContain("import { SkipThrottle } from '@nestjs/throttler';");
    expect(controller).toContain('@SkipThrottle()');
  });

  it('adds helmet and throttler as dependencies', async () => {
    const { read } = await generate();
    const pkg = JSON.parse(await read('package.json')) as {
      dependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.helmet).toBe('^8.3.0');
    expect(pkg.dependencies?.['@nestjs/throttler']).toBe('^6.8.0');
  });

  it('exposes CORS and throttle settings in config, validation, .env.example and README', async () => {
    const { read } = await generate();

    const env = await read('.env.example');
    expect(env).toContain('CORS_ORIGINS=http://localhost:3000');
    expect(env).toContain('THROTTLE_LIMIT=100');
    expect(env).toContain('THROTTLE_TTL_MS=60000');

    const schema = await read('src/infrastructure/config/environment.ts');
    expect(schema).toContain('CORS_ORIGINS: z.string()');
    expect(schema).toContain('THROTTLE_LIMIT: z.coerce');
    expect(schema).toContain('THROTTLE_TTL_MS: z.coerce');

    const configuration = await read('src/infrastructure/config/configuration.ts');
    expect(configuration).toContain('corsOrigins:');
    expect(configuration).toContain('process.env.THROTTLE_LIMIT');

    const readme = await read('README.md');
    expect(readme).toContain('`CORS_ORIGINS`');
    expect(readme).toContain('`THROTTLE_LIMIT`');
    expect(readme).toContain('Security defaults');
  });
});
