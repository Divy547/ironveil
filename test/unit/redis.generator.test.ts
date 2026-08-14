import {
  mkdtemp,
  rm,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  afterEach,
  describe,
  expect,
  it,
} from 'vitest';
import { resolveConfig } from '../../src/config/index.js';
import {
  createGenerationContext,
} from '../../src/generators/core/generation-context.js';
import {
  RedisGenerator,
} from '../../src/generators/features/redis/redis.generator.js';
import {
  createTemplateLoader,
} from '../../src/rendering/template-loader.js';
import {
  createTemplateRenderer,
} from '../../src/rendering/template-renderer.js';
import {
  getTemplatesDirectory,
} from '../../src/rendering/template-path.js';
import {
  createFileSystem,
} from '../../src/utils/filesystem.js';

describe('RedisGenerator', () => {
  let temporaryDirectory: string;

  afterEach(async () => {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, {
        recursive: true,
        force: true,
      });
    }
  });

  async function createContext(redis = true): Promise<{
    fs: ReturnType<typeof createFileSystem>;
    context: Awaited<
      ReturnType<typeof createGenerationContext>
    >;
  }> {
    temporaryDirectory = await mkdtemp(
      path.join(
        os.tmpdir(),
        'forgekit-redis-',
      ),
    );

    const fs = createFileSystem();

    const config = resolveConfig({
      projectName: 'test-api',
      redis,
    });

    await fs.writeFile(
      path.join(
        temporaryDirectory,
        'package.json',
      ),
      JSON.stringify({
        name: 'test-api',
        scripts: {},
        dependencies: {},
        devDependencies: {},
      }),
    );

    const loader = createTemplateLoader(
      getTemplatesDirectory(),
      fs,
    );

    const renderer = createTemplateRenderer();

    const context = createGenerationContext(
      config,
      temporaryDirectory,
      fs,
      loader,
      renderer,
    );

    return {
      fs,
      context,
    };
  }

  it('has the redis generator contract', () => {
    const generator = new RedisGenerator();

    const configEnabled = resolveConfig({
      projectName: 'test-api',
      redis: true,
    });

    const configDisabled = resolveConfig({
      projectName: 'test-api',
      redis: false,
    });

    expect(generator.name).toBe('redis');
    expect(generator.shouldRun(configEnabled)).toBe(true);
    expect(generator.shouldRun(configDisabled)).toBe(false);
  });

  it('generates Redis module and service files', async () => {
    const { fs, context } = await createContext(true);

    const generator = new RedisGenerator();

    await generator.generate(context);

    expect(
      await fs.exists(
        path.join(
          temporaryDirectory,
          'src',
          'infrastructure',
          'redis',
          'redis.module.ts',
        ),
      ),
    ).toBe(true);

    expect(
      await fs.exists(
        path.join(
          temporaryDirectory,
          'src',
          'infrastructure',
          'redis',
          'redis.service.ts',
        ),
      ),
    ).toBe(true);
  });

  it('generates expected RedisModule content', async () => {
    const { fs, context } = await createContext(true);

    const generator = new RedisGenerator();

    await generator.generate(context);

    const moduleContent = await fs.readFile(
      path.join(
        temporaryDirectory,
        'src',
        'infrastructure',
        'redis',
        'redis.module.ts',
      ),
    );

    expect(moduleContent).toContain('@Global()');
    expect(moduleContent).toContain('export class RedisModule {}');
    expect(moduleContent).toContain('providers: [RedisService]');
    expect(moduleContent).toContain('exports: [RedisService]');
  });

  it('generates expected RedisService content', async () => {
    const { fs, context } = await createContext(true);

    const generator = new RedisGenerator();

    await generator.generate(context);

    const serviceContent = await fs.readFile(
      path.join(
        temporaryDirectory,
        'src',
        'infrastructure',
        'redis',
        'redis.service.ts',
      ),
    );

    expect(serviceContent).toContain('import Redis from \'ioredis\';');
    expect(serviceContent).toContain('export class RedisService');
    expect(serviceContent).toContain('extends Redis');
    expect(serviceContent).toContain('implements OnModuleInit, OnModuleDestroy');
    expect(serviceContent).toContain('configService.get<string>(\'redis.url\')');
    expect(serviceContent).toContain('lazyConnect: true');
    expect(serviceContent).toContain('await this.connect()');
    expect(serviceContent).toContain('await this.quit()');
  });

  it('adds ioredis dependency to package.json', async () => {
    const { fs, context } = await createContext(true);

    const generator = new RedisGenerator();

    await generator.generate(context);

    const packageJson = JSON.parse(
      await fs.readFile(
        path.join(
          temporaryDirectory,
          'package.json',
        ),
      ),
    ) as {
      dependencies?: Record<string, string>;
    };

    expect(packageJson.dependencies?.ioredis).toBe('5.6.0');
  });
});
