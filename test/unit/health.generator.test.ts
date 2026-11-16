import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveConfig } from '../../src/config/index.js';
import { generateProject } from '../../src/generators/generate-project.js';
import { HealthGenerator } from '../../src/generators/features/health/health.generator.js';
import { createFileSystem } from '../../src/utils/filesystem.js';

describe('HealthGenerator', () => {
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
      path.join(os.tmpdir(), 'ironveil-health-'),
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
    const generator = new HealthGenerator();
    expect(generator.name).toBe('health');
    expect(generator.shouldRun(resolveConfig({ projectName: 'a' }))).toBe(true);
    expect(
      generator.shouldRun(resolveConfig({ projectName: 'a', redis: true })),
    ).toBe(true);
  });

  it('generates liveness and readiness endpoints without Redis', async () => {
    const { fs, destination, read } = await generate({ redis: false });

    const controller = await read('src/modules/health/health.controller.ts');
    expect(controller).toContain("@Controller('health')");
    expect(controller).toContain("@Get('ready')");
    expect(controller).toContain("this.prisma.isHealthy('database')");
    expect(controller).not.toContain('Redis');
    expect(controller).not.toContain('{{');

    const healthModule = await read('src/modules/health/health.module.ts');
    expect(healthModule).toContain('TerminusModule');
    expect(healthModule).not.toContain('Redis');
    expect(healthModule).not.toContain('{{');

    expect(
      await fs.exists(path.join(destination, 'src/modules/health/redis.health.ts')),
    ).toBe(false);

    const appModule = await read('src/app.module.ts');
    expect(appModule).toContain("import { HealthModule } from './modules/health/health.module';");
    expect(appModule).toContain('HealthModule,');
  });

  it('adds a Redis check to readiness when Redis is enabled', async () => {
    const { fs, destination, read } = await generate({ redis: true });

    const controller = await read('src/modules/health/health.controller.ts');
    expect(controller).toContain("import { RedisHealthIndicator } from './redis.health';");
    expect(controller).toContain("this.redis.isHealthy('redis')");

    const healthModule = await read('src/modules/health/health.module.ts');
    expect(healthModule).toContain('RedisHealthIndicator,');

    expect(
      await fs.exists(path.join(destination, 'src/modules/health/redis.health.ts')),
    ).toBe(true);
  });

  it('adds @nestjs/terminus to package.json', async () => {
    const { read } = await generate();
    const pkg = JSON.parse(await read('package.json')) as {
      dependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.['@nestjs/terminus']).toBe('^11.1.1');
  });

  it('points the Docker HEALTHCHECK at /health', async () => {
    const { read } = await generate({ docker: true });
    const dockerfile = await read('Dockerfile');
    expect(dockerfile).toContain('HEALTHCHECK');
    expect(dockerfile).toContain('/health');
  });

  it('exercises the health endpoints in the generated e2e test', async () => {
    const { read } = await generate({ testing: true, redis: true });
    const e2e = await read('test/app.e2e-spec.ts');
    expect(e2e).toContain("get('/health')");
    expect(e2e).toContain("get('/health/ready')");
    expect(e2e).toContain('$queryRaw');
    expect(e2e).toContain('ping');
  });
});
