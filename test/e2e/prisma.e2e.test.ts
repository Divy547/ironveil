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
  'postgresql://postgres:postgres@localhost:5432/forgekit-auth-e2e?schema=public';

describe('ForgeKit Prisma E2E', () => {
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
    'generates and builds Prisma infrastructure',
    async () => {
      project =
        await createGeneratedProject(
          resolveConfig({
            projectName:
              'generated-prisma-api',
          }),
          'forgekit-prisma-e2e',
        );

      expect(
        await project.fs.exists(
          `${project.root}/prisma/schema.prisma`,
        ),
      ).toBe(true);

      expect(
        await project.fs.exists(
          `${project.root}/src/infrastructure/prisma/prisma.module.ts`,
        ),
      ).toBe(true);

      expect(
        await project.fs.exists(
          `${project.root}/src/infrastructure/prisma/prisma.service.ts`,
        ),
      ).toBe(true);

      await project.writeEnv({
        databaseUrl:
          DATABASE_URL,
      });

      await project.install();
      await project.prismaGenerate();
      await project.prismaMigrateDeploy();
      await project.build();

      expect(
        await project.fs.exists(
          `${project.root}/src/generated/prisma/client.ts`,
        ),
      ).toBe(true);

      expect(
        await project.fs.exists(
          `${project.root}/dist/infrastructure/prisma/prisma.service.js`,
        ),
      ).toBe(true);

      // Verify Prisma Query Engine native binary is bundled into dist
      const { readdir, rm } = await import('node:fs/promises');
      const distPrismaFiles = await readdir(
        `${project.root}/dist/generated/prisma`,
      );
      const hasEngineBinary = distPrismaFiles.some((file) =>
        file.endsWith('.node'),
      );
      expect(hasEngineBinary).toBe(true);

      // Verify PrismaClient initializes in isolated runtime without src directory
      await rm(`${project.root}/src`, { recursive: true, force: true });
      const { PrismaClient } = await import(
        `${project.root}/dist/generated/prisma/client.js`
      );
      const client = new PrismaClient();
      expect(client).toBeDefined();
      await client.$disconnect();
    },
    120_000,
  );
});