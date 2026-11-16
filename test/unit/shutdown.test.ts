import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveConfig } from '../../src/config/index.js';
import { generateProject } from '../../src/generators/generate-project.js';
import { createFileSystem } from '../../src/utils/filesystem.js';

describe('clean shutdown', () => {
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
      path.join(os.tmpdir(), 'ironveil-shutdown-'),
    );
    const { destination } = await generateProject(
      resolveConfig({ projectName: 'test-api', ...overrides }),
      temporaryDirectory,
    );
    const fs = createFileSystem();
    const read = (...segments: string[]) =>
      fs.readFile(path.join(destination, ...segments));
    return { read };
  }

  it('enables shutdown hooks in main.ts before listening', async () => {
    const { read } = await generate();
    const main = await read('src/main.ts');

    expect(main).toContain('app.enableShutdownHooks();');
    expect(main.indexOf('app.enableShutdownHooks()')).toBeLessThan(
      main.indexOf('app.listen('),
    );
  });

  it('disconnects Prisma on module destroy', async () => {
    const { read } = await generate();
    const service = await read('src/infrastructure/prisma/prisma.service.ts');

    expect(service).toContain('onModuleDestroy');
    expect(service).toContain('await this.$disconnect()');
  });

  it('closes Redis gracefully and never blocks shutdown on a dead connection', async () => {
    const { read } = await generate({ redis: true });
    const service = await read('src/infrastructure/redis/redis.service.ts');

    expect(service).toContain('onModuleDestroy');
    expect(service).toContain("this.status === 'end'");
    expect(service).toContain('await this.quit()');
    expect(service).toContain('this.disconnect()');
  });

  it('runs node as PID 1 in docker-compose so SIGTERM reaches the app', async () => {
    const { read } = await generate({ docker: true });
    const compose = await read('docker-compose.yml');
    const dockerfile = await read('Dockerfile');

    expect(compose).toContain('exec node dist/main.js');
    expect(dockerfile).toContain('CMD ["node", "dist/main.js"]');
  });
});
