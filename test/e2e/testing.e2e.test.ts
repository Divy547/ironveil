import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
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

const execFileAsync = promisify(execFile);

describe('ForgeKit Testing Generator E2E', () => {
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
    'Case 1: generates and executes unit and E2E tests cleanly on disk when testing is enabled',
    async () => {
      project = await createGeneratedProject(
        resolveConfig({
          projectName: 'testing-enabled-api',
          testing: true,
          database: 'postgres',
          orm: 'prisma',
          redis: true,
          auth: 'jwt',
          swagger: true,
        }),
        'forgekit-testing-enabled-e2e',
      );

      // 1. Verify files exist
      expect(
        await project.fs.exists(`${project.root}/jest.config.ts`),
      ).toBe(true);
      expect(
        await project.fs.exists(`${project.root}/test/jest-e2e.json`),
      ).toBe(true);
      expect(
        await project.fs.exists(`${project.root}/src/app.module.spec.ts`),
      ).toBe(true);
      expect(
        await project.fs.exists(`${project.root}/test/app.e2e-spec.ts`),
      ).toBe(true);

      // 2. Verify package.json contents
      const pkgContent = await project.fs.readFile(
        `${project.root}/package.json`,
      );
      const pkg = JSON.parse(pkgContent) as {
        scripts?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };

      expect(pkg.scripts?.['test']).toBe('jest');
      expect(pkg.scripts?.['test:watch']).toBe('jest --watch');
      expect(pkg.scripts?.['test:cov']).toBe('jest --coverage');
      expect(pkg.scripts?.['test:e2e']).toBe(
        'jest --config ./test/jest-e2e.json',
      );
      expect(pkg.devDependencies?.['@nestjs/testing']).toBeDefined();
      expect(pkg.devDependencies?.['jest']).toBeDefined();
      expect(pkg.devDependencies?.['supertest']).toBeDefined();

      // 3. Execute installation, generation, typecheck, tests, and build
      await project.writeEnv({
        databaseUrl:
          'postgresql://postgres:postgres@localhost:5432/forgekit-testing-e2e?schema=public',
        redisUrl: 'redis://localhost:6379',
        jwtSecret: 'forgekit-testing-e2e-super-secret-key-32chars',
      });

      await project.install();
      await project.prismaGenerate();

      await execFileAsync('npm', ['run', 'typecheck'], {
        cwd: project.root,
      });

      // Execute generated unit tests
      await execFileAsync('npm', ['test'], {
        cwd: project.root,
      });

      // Execute generated E2E tests (deterministic, requires no DB/Redis)
      await execFileAsync('npm', ['run', 'test:e2e'], {
        cwd: project.root,
      });

      await project.build();

      expect(
        await project.fs.exists(`${project.root}/dist/main.js`),
      ).toBe(true);
    },
    180_000,
  );

  it(
    'Case 2: generates zero testing infrastructure when testing is disabled',
    async () => {
      project = await createGeneratedProject(
        resolveConfig({
          projectName: 'testing-disabled-api',
          testing: false,
        }),
        'forgekit-testing-disabled-e2e',
      );

      // 1. Verify absence of testing files and directory
      expect(
        await project.fs.exists(`${project.root}/jest.config.ts`),
      ).toBe(false);
      expect(
        await project.fs.exists(`${project.root}/test`),
      ).toBe(false);
      expect(
        await project.fs.exists(`${project.root}/src/app.module.spec.ts`),
      ).toBe(false);

      // 2. Verify absence of testing scripts and devDependencies
      const pkgContent = await project.fs.readFile(
        `${project.root}/package.json`,
      );
      const pkg = JSON.parse(pkgContent) as {
        scripts?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };

      expect(pkg.scripts?.['test']).toBeUndefined();
      expect(pkg.scripts?.['test:e2e']).toBeUndefined();
      expect(pkg.devDependencies?.['@nestjs/testing']).toBeUndefined();
      expect(pkg.devDependencies?.['jest']).toBeUndefined();
      expect(pkg.devDependencies?.['supertest']).toBeUndefined();

      // 3. Execute installation, typecheck, and build
      await project.install();
      await project.prismaGenerate();

      await execFileAsync('npm', ['run', 'typecheck'], {
        cwd: project.root,
      });

      await project.build();

      expect(
        await project.fs.exists(`${project.root}/dist/main.js`),
      ).toBe(true);
    },
    180_000,
  );
});
