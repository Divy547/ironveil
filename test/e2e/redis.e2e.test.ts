import {
  afterEach,
  describe,
  expect,
  it,
} from 'vitest';
import { resolveConfig } from '../../src/config/index.js';
import {
  createGeneratedProject,
} from './helpers/generated-project.js';

const DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/forgekit-redis-e2e?schema=public';

const JWT_SECRET =
  'forgekit-redis-e2e-super-secret-key-2026';

describe('ForgeKit Redis E2E', () => {
  let project:
    | Awaited<
        ReturnType<
          typeof createGeneratedProject
        >
      >
    | undefined;

  afterEach(async () => {
    await project?.cleanup();
    project = undefined;
  });

  it(
    'generates, installs, and builds a Redis-enabled project independently',
    async () => {
      project = await createGeneratedProject(
        resolveConfig({
          projectName: 'redis-enabled-api',
          redis: true,
          auth: 'jwt',
          swagger: true,
        }),
        'forgekit-redis-enabled-e2e',
      );

      // Verify Redis files exist
      expect(
        await project.fs.exists(
          `${project.root}/src/infrastructure/redis/redis.module.ts`,
        ),
      ).toBe(true);

      expect(
        await project.fs.exists(
          `${project.root}/src/infrastructure/redis/redis.service.ts`,
        ),
      ).toBe(true);

      // Verify package.json contains ioredis
      const packageJsonContent = await project.fs.readFile(
        `${project.root}/package.json`,
      );
      const packageJson = JSON.parse(packageJsonContent) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };

      expect(packageJson.dependencies?.ioredis).toBe('5.6.0');
      expect(packageJson.dependencies?.forgekit).toBeUndefined();
      expect(packageJson.devDependencies?.forgekit).toBeUndefined();

      await project.writeEnv({
        databaseUrl: DATABASE_URL,
        jwtSecret: JWT_SECRET,
      });

      await project.install();
      await project.prismaGenerate();
      await project.build();

      expect(
        await project.fs.exists(
          `${project.root}/dist/infrastructure/redis/redis.service.js`,
        ),
      ).toBe(true);

      expect(
        await project.fs.exists(
          `${project.root}/dist/infrastructure/redis/redis.module.js`,
        ),
      ).toBe(true);
    },
    180_000,
  );
});
