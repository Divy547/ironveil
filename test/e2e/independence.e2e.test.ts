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

describe('ForgeKit project independence E2E', () => {
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
    'generates a project independent from ForgeKit',
    async () => {
      project =
        await createGeneratedProject(
          resolveConfig({
            projectName:
              'generated-independent-api',
            auth: 'jwt',
          }),
          'forgekit-independence-e2e',
        );

      const packageJson =
        JSON.parse(
          await project.fs.readFile(
            `${project.root}/package.json`,
          ),
        ) as {
          name?: string;
          dependencies?: Record<
            string,
            string
          >;
          devDependencies?: Record<
            string,
            string
          >;
        };

      expect(
        packageJson.name,
      ).toBe(
        'generated-independent-api',
      );

      expect(
        packageJson.dependencies?.forgekit,
      ).toBeUndefined();

      expect(
        packageJson.devDependencies?.forgekit,
      ).toBeUndefined();

      const packageContents =
        await project.fs.readFile(
          `${project.root}/package.json`,
        );

      expect(
        packageContents,
      ).not.toContain(
        '"forgekit":',
      );

      expect(
        await project.fs.exists(
          `${project.root}/pnpm-workspace.yaml`,
        ),
      ).toBe(false);

      expect(
        await project.fs.exists(
          `${project.root}/src`,
        ),
      ).toBe(true);

      const generatedMain =
        await project.fs.readFile(
          `${project.root}/src/main.ts`,
        );

      expect(
        generatedMain,
      ).not.toContain(
        'forgeKit',
      );

      expect(
        generatedMain,
      ).not.toContain(
        'forgekit',
      );

      await project.writeEnv({
        databaseUrl:
          'postgresql://postgres:postgres@localhost:5432/forgekit-auth-e2e?schema=public',
        jwtSecret:
          'forgekit-e2e-super-secret-key-2026-change-me',
      });

      await project.install();
      await project.prismaGenerate();
      await project.prismaMigrateDeploy();
      await project.build();

      expect(
        await project.fs.exists(
          `${project.root}/dist/main.js`,
        ),
      ).toBe(true);
    },
    120_000,
  );
});