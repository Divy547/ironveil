import path from 'node:path';
import { rm, readdir } from 'node:fs/promises';
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

describe('ForgeKit project generation E2E', () => {
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
    'generates a buildable NestJS project and handles rebuilds even when dist is removed',
    async () => {
      project =
        await createGeneratedProject(
          resolveConfig({
            projectName:
              'generated-api',
          }),
          'forgekit-generation-e2e',
        );

      expect(
        await project.fs.exists(
          `${project.root}/package.json`,
        ),
      ).toBe(true);

      expect(
        await project.fs.exists(
          `${project.root}/tsconfig.json`,
        ),
      ).toBe(true);

      const tsconfig = JSON.parse(
        await project.fs.readFile(`${project.root}/tsconfig.json`),
      );
      expect(tsconfig.compilerOptions?.incremental).toBeUndefined();

      expect(
        await project.fs.exists(
          `${project.root}/nest-cli.json`,
        ),
      ).toBe(true);

      expect(
        await project.fs.exists(
          `${project.root}/src/main.ts`,
        ),
      ).toBe(true);

      expect(
        await project.fs.exists(
          `${project.root}/src/app.module.ts`,
        ),
      ).toBe(true);

      // Verify feature-aware configuration (auth: none, redis: false)
      const envExample = await project.fs.readFile(
        `${project.root}/.env.example`,
      );
      expect(envExample).toContain('DATABASE_URL=');
      expect(envExample).not.toContain('JWT_SECRET');
      expect(envExample).not.toContain('REDIS_URL');

      const environmentTs = await project.fs.readFile(
        `${project.root}/src/infrastructure/config/environment.ts`,
      );
      expect(environmentTs).toContain('DATABASE_URL');
      expect(environmentTs).not.toContain('JWT_SECRET');
      expect(environmentTs).not.toContain('REDIS_URL');

      const configurationTs = await project.fs.readFile(
        `${project.root}/src/infrastructure/config/configuration.ts`,
      );
      expect(configurationTs).not.toContain('auth:');
      expect(configurationTs).not.toContain('JWT_SECRET');
      expect(configurationTs).not.toContain('redis:');
      expect(configurationTs).not.toContain('REDIS_URL');

      await project.install();
      await project.prismaGenerate();

      // 1. Initial build: dist/main.js and Prisma native binary must exist
      await project.build();

      expect(
        await project.fs.exists(
          `${project.root}/dist/main.js`,
        ),
      ).toBe(true);

      const prismaDistDir = path.join(project.root, 'dist', 'generated', 'prisma');
      expect(await project.fs.exists(prismaDistDir)).toBe(true);
      const initialPrismaFiles = await readdir(prismaDistDir);
      const hasNodeBinaryInitial = initialPrismaFiles.some((f) => f.endsWith('.node'));
      expect(hasNodeBinaryInitial).toBe(true);

      // 2. Subsequent build: dist/main.js still exists
      await project.build();
      expect(
        await project.fs.exists(
          `${project.root}/dist/main.js`,
        ),
      ).toBe(true);

      // 3. Remove dist directory while preserving any root build state, then rebuild
      await rm(path.join(project.root, 'dist'), { recursive: true, force: true });
      expect(await project.fs.exists(`${project.root}/dist`)).toBe(false);

      await project.build();

      expect(
        await project.fs.exists(
          `${project.root}/dist/main.js`,
        ),
      ).toBe(true);

      const rebuiltPrismaFiles = await readdir(prismaDistDir);
      const hasNodeBinaryRebuilt = rebuiltPrismaFiles.some((f) => f.endsWith('.node'));
      expect(hasNodeBinaryRebuilt).toBe(true);
    },
    180_000,
  );
});