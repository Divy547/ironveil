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

const DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/forgekit-ci-e2e?schema=public';

const JWT_SECRET =
  'forgekit-ci-e2e-super-secret-key-2026';

describe('ForgeKit CI E2E', () => {
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
    'Case 1: generates and executes CI workflow steps on disk when CI, Prisma, and testing are enabled',
    async () => {
      project = await createGeneratedProject(
        resolveConfig({
          projectName: 'ci-full-api',
          ci: true,
          database: 'postgres',
          orm: 'prisma',
          testing: true,
          auth: 'jwt',
          swagger: true,
        }),
        'forgekit-ci-full-e2e',
      );

      // 1. Verify workflow file exists
      const workflowPath = `${project.root}/.github/workflows/ci.yml`;
      expect(
        await project.fs.exists(workflowPath),
      ).toBe(true);

      // 2. Verify workflow contents
      const workflowContent = await project.fs.readFile(workflowPath);
      expect(workflowContent).toContain('name: CI');
      expect(workflowContent).toContain('branches: [main, master]');
      expect(workflowContent).toContain('permissions:\n  contents: read');
      expect(workflowContent).toContain('actions/checkout@v4');
      expect(workflowContent).toContain('actions/setup-node@v4');
      expect(workflowContent).toContain("node-version: '22'");
      expect(workflowContent).toContain("cache: 'npm'");
      expect(workflowContent).toContain('run: npm install');
      expect(workflowContent).toContain('Generate Prisma Client');
      expect(workflowContent).toContain('run: npx prisma generate');
      expect(workflowContent).toContain('run: npm run typecheck');
      expect(workflowContent).toContain('Run unit tests');
      expect(workflowContent).toContain('run: npm test');
      expect(workflowContent).toContain('run: npm run build');
      expect(workflowContent).not.toContain('npm ci');
      expect(workflowContent).not.toContain('forgekit');
      expect(workflowContent).not.toContain('ForgeKit');

      // 3. Verify package.json contains typecheck script
      const packageJsonContent = await project.fs.readFile(
        `${project.root}/package.json`,
      );
      const packageJson = JSON.parse(packageJsonContent) as {
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      expect(packageJson.scripts?.['typecheck']).toBe('tsc --noEmit');
      expect(packageJson.dependencies?.forgekit).toBeUndefined();
      expect(packageJson.devDependencies?.forgekit).toBeUndefined();

      // 4. Actually execute the CI workflow steps on disk
      await project.writeEnv({
        databaseUrl: DATABASE_URL,
        jwtSecret: JWT_SECRET,
      });

      // Step: install
      await project.install();

      // Step: prisma generate
      await project.prismaGenerate();

      // Step: typecheck
      await execFileAsync('npm', ['run', 'typecheck'], {
        cwd: project.root,
      });

      // Step: unit tests
      await execFileAsync('npm', ['test'], {
        cwd: project.root,
      });

      // Step: build
      await project.build();

      expect(
        await project.fs.exists(`${project.root}/dist/main.js`),
      ).toBe(true);
    },
    180_000,
  );

  it(
    'Case 2: generates workflow omitting test step when testing is disabled',
    async () => {
      project = await createGeneratedProject(
        resolveConfig({
          projectName: 'ci-no-test-api',
          ci: true,
          testing: false,
        }),
        'forgekit-ci-no-test-e2e',
      );

      const workflowPath = `${project.root}/.github/workflows/ci.yml`;
      expect(
        await project.fs.exists(workflowPath),
      ).toBe(true);

      const workflowContent = await project.fs.readFile(workflowPath);
      expect(workflowContent).toContain('run: npm run typecheck');
      expect(workflowContent).toContain('run: npm run build');
      expect(workflowContent).not.toContain('Run unit tests');
      expect(workflowContent).not.toContain('run: npm test');

      await project.writeEnv({
        databaseUrl: DATABASE_URL,
      });

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

  it(
    'Case 3: generates no CI artifacts when ci is disabled',
    async () => {
      project = await createGeneratedProject(
        resolveConfig({
          projectName: 'ci-disabled-api',
          ci: false,
        }),
        'forgekit-ci-disabled-e2e',
      );

      expect(
        await project.fs.exists(`${project.root}/.github`),
      ).toBe(false);

      const packageJsonContent = await project.fs.readFile(
        `${project.root}/package.json`,
      );
      const packageJson = JSON.parse(packageJsonContent) as {
        scripts?: Record<string, string>;
      };

      // Base project retains developer typecheck script
      expect(packageJson.scripts?.['typecheck']).toBe('tsc --noEmit');
    },
    120_000,
  );
});
