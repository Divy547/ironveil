import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveConfig } from '../../src/config/index.js';
import { createGenerationContext } from '../../src/generators/core/generation-context.js';
import { QueueGenerator } from '../../src/generators/features/queue/queue.generator.js';
import { createTemplateLoader } from '../../src/rendering/template-loader.js';
import { createTemplateRenderer } from '../../src/rendering/template-renderer.js';
import { getTemplatesDirectory } from '../../src/rendering/template-path.js';
import { createFileSystem } from '../../src/utils/filesystem.js';

type BullConnection = {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
  tls?: object;
};

describe('QueueGenerator', () => {
  let dir: string | undefined;

  afterEach(async () => {
    if (dir) {
      await rm(dir, { recursive: true, force: true });
      dir = undefined;
    }
  });

  async function generate() {
    // Inside the repo so the generated connection helper can be imported.
    dir = await mkdtemp(path.join(process.cwd(), 'test', '.tmp-queue-'));

    const fs = createFileSystem();
    const config = resolveConfig({ projectName: 'test-api', redis: true, queue: true });

    await fs.writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'test-api', scripts: {}, dependencies: {}, devDependencies: {} }),
    );

    await new QueueGenerator().generate(
      createGenerationContext(
        config,
        dir,
        fs,
        createTemplateLoader(getTemplatesDirectory(), fs),
        createTemplateRenderer(),
      ),
    );

    const read = (relative: string) => readFile(path.join(dir as string, relative), 'utf8');
    return { read };
  }

  it('has the queue generator contract', () => {
    const generator = new QueueGenerator();

    expect(generator.name).toBe('queue');
    expect(
      generator.shouldRun(resolveConfig({ projectName: 'test-api', redis: true, queue: true })),
    ).toBe(true);
    expect(generator.shouldRun(resolveConfig({ projectName: 'test-api', redis: true }))).toBe(false);
    expect(generator.shouldRun(resolveConfig({ projectName: 'test-api' }))).toBe(false);
  });

  it('writes the queue module and the connection helper', async () => {
    const { read } = await generate();

    expect(await read('src/infrastructure/queue/queue.module.ts')).toContain('QueueModule');
    expect(await read('src/infrastructure/queue/redis-connection.ts')).toContain('toBullConnection');
  });

  it('builds the BullMQ connection from the same REDIS_URL setting as Redis', async () => {
    const { read } = await generate();
    const source = await read('src/infrastructure/queue/queue.module.ts');

    expect(source).toContain("import { BullModule } from '@nestjs/bullmq';");
    expect(source).toContain('BullModule.forRootAsync');
    expect(source).toContain("configService.get<string>('redis.url')");
    expect(source).toContain('toBullConnection(url)');
    expect(source).toContain('export class QueueModule {}');
  });

  it('fails fast when REDIS_URL is missing instead of connecting to a default', async () => {
    const { read } = await generate();
    const source = await read('src/infrastructure/queue/queue.module.ts');

    expect(source).toContain('REDIS_URL is required when the queue is enabled.');
  });

  it('retries failed jobs with backoff and does not keep finished jobs forever', async () => {
    const { read } = await generate();
    const source = await read('src/infrastructure/queue/queue.module.ts');

    expect(source).toContain('defaultJobOptions');
    expect(source).toContain('attempts: 3');
    expect(source).toContain("type: 'exponential'");
    expect(source).toMatch(/removeOnComplete:/);
    expect(source).toMatch(/removeOnFail:/);
  });

  it('adds @nestjs/bullmq and bullmq to package.json at the pinned versions', async () => {
    await generate();
    const packageJson = JSON.parse(
      await readFile(path.join(dir as string, 'package.json'), 'utf8'),
    ) as { dependencies: Record<string, string> };

    expect(packageJson.dependencies['@nestjs/bullmq']).toBe('11.0.5');
    expect(packageJson.dependencies.bullmq).toBe('5.81.5');
  });

  describe('the generated connection helper', () => {
    async function load(): Promise<(url: string) => BullConnection> {
      await generate();
      const loaded = (await import(
        /* @vite-ignore */ pathToFileURL(
          path.join(dir as string, 'src/infrastructure/queue/redis-connection.ts'),
        ).href
      )) as { toBullConnection: (url: string) => BullConnection };
      return loaded.toBullConnection;
    }

    it('reads host and port, defaulting the port to 6379', async () => {
      const toBullConnection = await load();

      expect(toBullConnection('redis://cache.internal:6380')).toEqual({
        host: 'cache.internal',
        port: 6380,
      });
      expect(toBullConnection('redis://localhost')).toEqual({ host: 'localhost', port: 6379 });
    });

    it('reads credentials, decoding percent escapes', async () => {
      const toBullConnection = await load();

      expect(toBullConnection('redis://app:p%40ss%2Fword@redis.example.com:6379')).toEqual({
        host: 'redis.example.com',
        port: 6379,
        username: 'app',
        password: 'p@ss/word',
      });
    });

    it('accepts a password with no username, as in redis://:secret@host', async () => {
      const toBullConnection = await load();

      expect(toBullConnection('redis://:secret@localhost:6379')).toEqual({
        host: 'localhost',
        port: 6379,
        password: 'secret',
      });
    });

    it('reads the database number from the path', async () => {
      const toBullConnection = await load();

      expect(toBullConnection('redis://localhost:6379/2').db).toBe(2);
      expect(toBullConnection('redis://localhost:6379/').db).toBeUndefined();
    });

    it('turns on TLS for rediss://', async () => {
      const toBullConnection = await load();

      expect(toBullConnection('rediss://cache.example.com:6380').tls).toEqual({});
      expect(toBullConnection('redis://cache.example.com:6380').tls).toBeUndefined();
    });

    it('unwraps an IPv6 host', async () => {
      const toBullConnection = await load();

      expect(toBullConnection('redis://[::1]:6379').host).toBe('::1');
    });

    it('rejects a URL that is not redis:// or rediss://', async () => {
      const toBullConnection = await load();

      expect(() => toBullConnection('http://localhost:6379')).toThrow(/redis:\/\/ or rediss:\/\//);
      expect(() => toBullConnection('not a url')).toThrow(/REDIS_URL/);
    });
  });
});
