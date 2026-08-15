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
  DockerGenerator,
} from '../../src/generators/features/docker/docker.generator.js';
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

describe('DockerGenerator', () => {
  let temporaryDirectory: string;

  afterEach(async () => {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, {
        recursive: true,
        force: true,
      });
    }
  });

  async function createContext(
    overrides: Record<string, unknown> = {},
  ): Promise<{
    fs: ReturnType<typeof createFileSystem>;
    context: ReturnType<typeof createGenerationContext>;
  }> {
    temporaryDirectory = await mkdtemp(
      path.join(
        os.tmpdir(),
        'forgekit-docker-',
      ),
    );

    const fs = createFileSystem();

    const config = resolveConfig({
      projectName: 'test-api',
      docker: true,
      ...overrides,
    });

    await fs.writeFile(
      path.join(temporaryDirectory, 'package.json'),
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

    return { fs, context };
  }

  // ── 1. Contract ──────────────────────────────────────────────────────────

  it('has the docker generator contract name', () => {
    const generator = new DockerGenerator();
    expect(generator.name).toBe('docker');
  });

  // ── 2. shouldRun ─────────────────────────────────────────────────────────

  it('shouldRun returns true when docker is enabled', () => {
    const generator = new DockerGenerator();
    const config = resolveConfig({
      projectName: 'test-api',
      docker: true,
    });
    expect(generator.shouldRun(config)).toBe(true);
  });

  it('shouldRun returns false when docker is disabled', () => {
    const generator = new DockerGenerator();
    const config = resolveConfig({
      projectName: 'test-api',
      docker: false,
    });
    expect(generator.shouldRun(config)).toBe(false);
  });

  // ── 3–6. File generation ─────────────────────────────────────────────────

  it('generates Dockerfile', async () => {
    const { fs, context } = await createContext();
    const generator = new DockerGenerator();

    await generator.generate(context);

    expect(
      await fs.exists(
        path.join(temporaryDirectory, 'Dockerfile'),
      ),
    ).toBe(true);
  });

  it('generates docker-compose.yml', async () => {
    const { fs, context } = await createContext();
    const generator = new DockerGenerator();

    await generator.generate(context);

    expect(
      await fs.exists(
        path.join(temporaryDirectory, 'docker-compose.yml'),
      ),
    ).toBe(true);
  });

  it('generates .dockerignore', async () => {
    const { fs, context } = await createContext();
    const generator = new DockerGenerator();

    await generator.generate(context);

    expect(
      await fs.exists(
        path.join(temporaryDirectory, '.dockerignore'),
      ),
    ).toBe(true);
  });

  // ── 7–8. Package scripts ─────────────────────────────────────────────────

  it('adds docker:up script to package.json', async () => {
    const { fs, context } = await createContext();
    const generator = new DockerGenerator();

    await generator.generate(context);

    const pkg = JSON.parse(
      await fs.readFile(
        path.join(temporaryDirectory, 'package.json'),
      ),
    ) as { scripts?: Record<string, string> };

    expect(pkg.scripts?.['docker:up']).toBe('docker compose up --build');
  });

  it('adds docker:down script to package.json', async () => {
    const { fs, context } = await createContext();
    const generator = new DockerGenerator();

    await generator.generate(context);

    const pkg = JSON.parse(
      await fs.readFile(
        path.join(temporaryDirectory, 'package.json'),
      ),
    ) as { scripts?: Record<string, string> };

    expect(pkg.scripts?.['docker:down']).toBe('docker compose down');
  });

  // ── 9. Postgres service ───────────────────────────────────────────────────

  it('includes postgres service in docker-compose.yml', async () => {
    const { fs, context } = await createContext();
    const generator = new DockerGenerator();

    await generator.generate(context);

    const compose = await fs.readFile(
      path.join(temporaryDirectory, 'docker-compose.yml'),
    );

    expect(compose).toContain('postgres:');
    expect(compose).toContain('postgres:16-alpine');
    expect(compose).toContain('pg_isready');
    expect(compose).toContain('postgres_data:');
  });

  // ── 10. Redis service: conditional ───────────────────────────────────────

  it('includes redis service when redis is enabled', async () => {
    const { fs, context } = await createContext({ redis: true });
    const generator = new DockerGenerator();

    await generator.generate(context);

    const compose = await fs.readFile(
      path.join(temporaryDirectory, 'docker-compose.yml'),
    );

    expect(compose).toContain('redis:');
    expect(compose).toContain('redis:7-alpine');
    expect(compose).toContain('redis-cli');
    expect(compose).toContain('ping');
    expect(compose).toContain('redis_data:');
  });

  it('does not include redis service when redis is disabled', async () => {
    const { fs, context } = await createContext({ redis: false });
    const generator = new DockerGenerator();

    await generator.generate(context);

    const compose = await fs.readFile(
      path.join(temporaryDirectory, 'docker-compose.yml'),
    );

    expect(compose).not.toContain('redis:7-alpine');
    expect(compose).not.toContain('redis-cli');
    expect(compose).not.toContain('redis_data:');
  });

  // ── 11. DATABASE_URL uses postgres hostname ───────────────────────────────

  it('sets DATABASE_URL to postgres service hostname, not localhost', async () => {
    const { fs, context } = await createContext();
    const generator = new DockerGenerator();

    await generator.generate(context);

    const compose = await fs.readFile(
      path.join(temporaryDirectory, 'docker-compose.yml'),
    );

    expect(compose).toContain('@postgres:5432/');
    expect(compose).not.toContain('@localhost:5432/');
  });

  // ── 12. REDIS_URL uses redis hostname ─────────────────────────────────────

  it('sets REDIS_URL to redis service hostname, not localhost', async () => {
    const { fs, context } = await createContext({ redis: true });
    const generator = new DockerGenerator();

    await generator.generate(context);

    const compose = await fs.readFile(
      path.join(temporaryDirectory, 'docker-compose.yml'),
    );

    expect(compose).toContain('redis://redis:6379');
    expect(compose).not.toContain('redis://localhost:6379');
  });

  // ── 13. Prisma migration command ─────────────────────────────────────────

  it('includes npx prisma migrate deploy in api command', async () => {
    const { fs, context } = await createContext();
    const generator = new DockerGenerator();

    await generator.generate(context);

    const compose = await fs.readFile(
      path.join(temporaryDirectory, 'docker-compose.yml'),
    );

    expect(compose).toContain('npx prisma migrate deploy');
    expect(compose).toContain('node dist/main.js');
  });

  // ── 14. depends_on postgres ────────────────────────────────────────────────

  it('api depends_on postgres with service_healthy condition', async () => {
    const { fs, context } = await createContext();
    const generator = new DockerGenerator();

    await generator.generate(context);

    const compose = await fs.readFile(
      path.join(temporaryDirectory, 'docker-compose.yml'),
    );

    expect(compose).toContain('depends_on:');
    expect(compose).toContain('postgres:');
    expect(compose).toContain('condition: service_healthy');
  });

  // ── 15. depends_on redis when enabled ────────────────────────────────────

  it('api depends_on redis when redis is enabled', async () => {
    const { fs, context } = await createContext({ redis: true });
    const generator = new DockerGenerator();

    await generator.generate(context);

    const compose = await fs.readFile(
      path.join(temporaryDirectory, 'docker-compose.yml'),
    );

    expect(compose).toContain('depends_on:');
    expect(compose).toContain('redis:');
    expect(compose).toContain('condition: service_healthy');
  });

  // ── 16. Docker disabled → no artifacts ────────────────────────────────────

  it('does not generate Docker files when docker is disabled', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'forgekit-docker-'),
    );

    const fs = createFileSystem();

    const config = resolveConfig({
      projectName: 'test-api',
      docker: false,
    });

    await fs.writeFile(
      path.join(temporaryDirectory, 'package.json'),
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

    const generator = new DockerGenerator();

    // Generator should not run — but even if it did, we test shouldRun
    expect(generator.shouldRun(config)).toBe(false);

    // Verify nothing was written
    expect(
      await fs.exists(path.join(temporaryDirectory, 'Dockerfile')),
    ).toBe(false);

    expect(
      await fs.exists(path.join(temporaryDirectory, 'docker-compose.yml')),
    ).toBe(false);

    expect(
      await fs.exists(path.join(temporaryDirectory, '.dockerignore')),
    ).toBe(false);

    const pkg = JSON.parse(
      await fs.readFile(
        path.join(temporaryDirectory, 'package.json'),
      ),
    ) as { scripts?: Record<string, string> };

    expect(pkg.scripts?.['docker:up']).toBeUndefined();
    expect(pkg.scripts?.['docker:down']).toBeUndefined();
  });

  // ── Dockerfile content ────────────────────────────────────────────────────

  it('Dockerfile uses node:22-alpine and multi-stage build', async () => {
    const { fs, context } = await createContext();
    const generator = new DockerGenerator();

    await generator.generate(context);

    const dockerfile = await fs.readFile(
      path.join(temporaryDirectory, 'Dockerfile'),
    );

    expect(dockerfile).toContain('FROM node:22-alpine AS builder');
    expect(dockerfile).toContain('FROM node:22-alpine AS runner');
    expect(dockerfile).toContain('RUN npm install');
    expect(dockerfile).not.toContain('npm ci');
    expect(dockerfile).toContain('RUN npx prisma generate');
    expect(dockerfile).toContain('RUN npm run build');
    expect(dockerfile).toContain('CMD ["node", "dist/main.js"]');
    expect(dockerfile).not.toContain('forgekit');
    expect(dockerfile).not.toContain('ForgeKit');
  });

  it('Dockerfile uses corepack enable for pnpm', async () => {
    const { fs, context } = await createContext({
      packageManager: 'pnpm',
      database: 'postgres',
      orm: 'prisma',
    });
    const generator = new DockerGenerator();

    await generator.generate(context);

    const dockerfile = await fs.readFile(
      path.join(temporaryDirectory, 'Dockerfile'),
    );

    expect(dockerfile).toContain('RUN corepack enable && pnpm install');
    expect(dockerfile).toContain('RUN pnpm exec prisma generate');
    expect(dockerfile).toContain('RUN pnpm run build');
    expect(dockerfile).not.toContain('RUN npm install');
    expect(dockerfile).not.toContain('RUN npx prisma');
  });

  it('Dockerfile uses corepack enable for yarn', async () => {
    const { fs, context } = await createContext({
      packageManager: 'yarn',
      database: 'postgres',
      orm: 'prisma',
    });
    const generator = new DockerGenerator();

    await generator.generate(context);

    const dockerfile = await fs.readFile(
      path.join(temporaryDirectory, 'Dockerfile'),
    );

    expect(dockerfile).toContain('RUN corepack enable && yarn install');
    expect(dockerfile).toContain('RUN yarn prisma generate');
    expect(dockerfile).toContain('RUN yarn build');
    expect(dockerfile).not.toContain('RUN npm install');
    expect(dockerfile).not.toContain('RUN npx prisma');
  });

  // ── .dockerignore content ─────────────────────────────────────────────────

  it('.dockerignore excludes node_modules and dist', async () => {
    const { fs, context } = await createContext();
    const generator = new DockerGenerator();

    await generator.generate(context);

    const dockerignore = await fs.readFile(
      path.join(temporaryDirectory, '.dockerignore'),
    );

    expect(dockerignore).toContain('node_modules');
    expect(dockerignore).toContain('dist');
    expect(dockerignore).toContain('.env');
  });
});
