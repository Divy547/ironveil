import { readdir } from 'node:fs/promises';
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
import {
  startTestServer,
  type TestServer,
} from './helpers/test-server.js';

const execFileAsync = promisify(execFile);

const DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/forgekit-matrix-e2e?schema=public';

const JWT_SECRET =
  'forgekit-matrix-e2e-super-secret-key-32chars';

const REDIS_URL = 'redis://localhost:6379';

describe('ForgeKit Generated-Project E2E Matrix', () => {
  let project:
    | Awaited<
        ReturnType<
          typeof createGeneratedProject
        >
      >
    | undefined;

  let server: TestServer | undefined;

  afterEach(async () => {
    server?.stop();
    server = undefined;

    await project?.cleanup();
    project = undefined;
  });

  // =========================================================================
  // Case 1 — Default Project (Tier 2 Lifecycle)
  // =========================================================================
  it(
    'Case 1: generates, validates defaults, installs, and builds the default project',
    async () => {
      const config = resolveConfig({
        projectName: 'matrix-default-api',
      });

      // Verify actual resolveConfig defaults
      expect(config.database).toBe('postgres');
      expect(config.orm).toBe('prisma');
      expect(config.redis).toBe(false);
      expect(config.auth).toBe('none');
      expect(config.swagger).toBe(true);
      expect(config.docker).toBe(true);
      expect(config.ci).toBe(true);
      expect(config.testing).toBe(true);
      expect(config.packageManager).toBe('npm');

      project = await createGeneratedProject(
        config,
        'forgekit-matrix-default',
      );

      // Verify default artifacts
      expect(
        await project.fs.exists(`${project.root}/prisma/schema.prisma`),
      ).toBe(true);
      expect(
        await project.fs.exists(
          `${project.root}/src/infrastructure/swagger/swagger.setup.ts`,
        ),
      ).toBe(true);
      expect(
        await project.fs.exists(`${project.root}/Dockerfile`),
      ).toBe(true);
      expect(
        await project.fs.exists(
          `${project.root}/.github/workflows/ci.yml`,
        ),
      ).toBe(true);
      expect(
        await project.fs.exists(`${project.root}/jest.config.ts`),
      ).toBe(true);

      // Verify non-default artifacts are absent
      expect(
        await project.fs.exists(
          `${project.root}/src/infrastructure/redis`,
        ),
      ).toBe(false);
      expect(
        await project.fs.exists(
          `${project.root}/src/modules/auth`,
        ),
      ).toBe(false);

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

  // =========================================================================
  // Case 2 — Prisma (Tier 1/2 Matrix Verification)
  // =========================================================================
  it(
    'Case 2: generates Prisma infrastructure and verifies native engine packaging',
    async () => {
      project = await createGeneratedProject(
        resolveConfig({
          projectName: 'matrix-prisma-api',
          database: 'postgres',
          orm: 'prisma',
        }),
        'forgekit-matrix-prisma',
      );

      expect(
        await project.fs.exists(`${project.root}/prisma/schema.prisma`),
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

      const pkg = JSON.parse(
        await project.fs.readFile(`${project.root}/package.json`),
      ) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };

      expect(pkg.dependencies?.['@prisma/client']).toBeDefined();
      expect(pkg.devDependencies?.prisma).toBeDefined();

      await project.writeEnv({
        databaseUrl: DATABASE_URL,
      });

      await project.install();
      await project.prismaGenerate();
      await project.build();

      expect(
        await project.fs.exists(
          `${project.root}/src/generated/prisma/client.ts`,
        ),
      ).toBe(true);

      const distPrismaFiles = await readdir(
        `${project.root}/dist/generated/prisma`,
      );
      const hasEngineBinary = distPrismaFiles.some((file) =>
        file.endsWith('.node'),
      );
      expect(hasEngineBinary).toBe(true);
    },
    180_000,
  );

  // =========================================================================
  // Case 3 — JWT (Tier 1/2 Matrix Verification)
  // =========================================================================
  it(
    'Case 3: generates and compiles JWT authentication infrastructure',
    async () => {
      project = await createGeneratedProject(
        resolveConfig({
          projectName: 'matrix-jwt-api',
          auth: 'jwt',
        }),
        'forgekit-matrix-jwt',
      );

      expect(
        await project.fs.exists(
          `${project.root}/src/modules/auth/auth.module.ts`,
        ),
      ).toBe(true);
      expect(
        await project.fs.exists(
          `${project.root}/src/modules/auth/auth.service.ts`,
        ),
      ).toBe(true);
      expect(
        await project.fs.exists(
          `${project.root}/src/modules/auth/auth.controller.ts`,
        ),
      ).toBe(true);
      expect(
        await project.fs.exists(
          `${project.root}/src/modules/auth/strategies/jwt.strategy.ts`,
        ),
      ).toBe(true);

      const pkg = JSON.parse(
        await project.fs.readFile(`${project.root}/package.json`),
      ) as { dependencies?: Record<string, string> };

      expect(pkg.dependencies?.['@nestjs/jwt']).toBeDefined();
      expect(pkg.dependencies?.['@nestjs/passport']).toBeDefined();
      expect(pkg.dependencies?.passport).toBeDefined();
      expect(pkg.dependencies?.['passport-jwt']).toBeDefined();
      expect(pkg.dependencies?.bcrypt).toBeDefined();

      await project.writeEnv({
        databaseUrl: DATABASE_URL,
        jwtSecret: JWT_SECRET,
      });

      await project.install();
      await project.prismaGenerate();

      await execFileAsync('npm', ['run', 'typecheck'], {
        cwd: project.root,
      });

      await project.build();

      expect(
        await project.fs.exists(
          `${project.root}/dist/modules/auth/auth.module.js`,
        ),
      ).toBe(true);
    },
    180_000,
  );

  // =========================================================================
  // Case 4 — Prisma + JWT (Tier 3 Cross-feature Composition)
  // =========================================================================
  it(
    'Case 4: verifies cross-feature composition between Prisma ORM and JWT Auth at runtime',
    async () => {
      project = await createGeneratedProject(
        resolveConfig({
          projectName: 'matrix-prisma-jwt-api',
          database: 'postgres',
          orm: 'prisma',
          auth: 'jwt',
        }),
        'forgekit-matrix-prisma-jwt',
      );

      await project.writeEnv({
        databaseUrl: DATABASE_URL,
        jwtSecret: JWT_SECRET,
      });

      await project.install();
      await project.prismaGenerate();
      await project.prismaMigrateDeploy();

      await execFileAsync('npm', ['run', 'typecheck'], {
        cwd: project.root,
      });

      await project.build();

      server = await startTestServer(
        project.root,
        project.baseUrl,
      );

      const email = `matrix-${process.pid}-${Date.now()}@example.com`;
      const password = 'MatrixPassword123!';

      // 1. Register User
      const registerRes = await fetch(
        `${project.baseUrl}/auth/register`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        },
      );
      expect(registerRes.status).toBe(201);
      const user = (await registerRes.json()) as {
        id: string;
        email: string;
      };
      expect(user.email).toBe(email);

      // 2. Login User
      const loginRes = await fetch(
        `${project.baseUrl}/auth/login`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        },
      );
      expect(loginRes.status).toBe(201);
      const loginData = (await loginRes.json()) as {
        accessToken: string;
      };
      expect(typeof loginData.accessToken).toBe('string');

      // 3. Authenticated Request
      const meRes = await fetch(
        `${project.baseUrl}/auth/me`,
        {
          headers: {
            Authorization: `Bearer ${loginData.accessToken}`,
          },
        },
      );
      expect(meRes.status).toBe(200);
      const meData = (await meRes.json()) as {
        sub: string;
        email: string;
      };
      expect(meData.sub).toBe(user.id);
      expect(meData.email).toBe(email);
    },
    180_000,
  );

  // =========================================================================
  // Case 5 — Redis (Tier 2 Matrix Verification)
  // =========================================================================
  it(
    'Case 5: generates and compiles Redis infrastructure without external daemon dependency',
    async () => {
      project = await createGeneratedProject(
        resolveConfig({
          projectName: 'matrix-redis-api',
          redis: true,
        }),
        'forgekit-matrix-redis',
      );

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

      const pkg = JSON.parse(
        await project.fs.readFile(`${project.root}/package.json`),
      ) as { dependencies?: Record<string, string> };

      expect(pkg.dependencies?.ioredis).toBe('5.6.0');

      await project.writeEnv({
        databaseUrl: DATABASE_URL,
        redisUrl: REDIS_URL,
      });

      await project.install();
      await project.prismaGenerate();

      await execFileAsync('npm', ['run', 'typecheck'], {
        cwd: project.root,
      });

      await project.build();

      expect(
        await project.fs.exists(
          `${project.root}/dist/infrastructure/redis/redis.module.js`,
        ),
      ).toBe(true);
    },
    180_000,
  );

  // =========================================================================
  // Case 6 — Docker (Tier 2 Matrix Verification)
  // =========================================================================
  it(
    'Case 6: generates Docker packaging assets and verifies build compatibility',
    async () => {
      project = await createGeneratedProject(
        resolveConfig({
          projectName: 'matrix-docker-api',
          docker: true,
          redis: true,
          auth: 'jwt',
        }),
        'forgekit-matrix-docker',
      );

      expect(
        await project.fs.exists(`${project.root}/Dockerfile`),
      ).toBe(true);
      expect(
        await project.fs.exists(
          `${project.root}/docker-compose.yml`,
        ),
      ).toBe(true);
      expect(
        await project.fs.exists(`${project.root}/.dockerignore`),
      ).toBe(true);

      const composeContent = await project.fs.readFile(
        `${project.root}/docker-compose.yml`,
      );
      expect(composeContent).toContain('services:');
      expect(composeContent).toContain('api:');
      expect(composeContent).toContain('postgres:');
      expect(composeContent).toContain('redis:');

      const pkg = JSON.parse(
        await project.fs.readFile(`${project.root}/package.json`),
      ) as { scripts?: Record<string, string> };

      expect(pkg.scripts?.['docker:up']).toBe(
        'docker compose up --build',
      );
      expect(pkg.scripts?.['docker:down']).toBe(
        'docker compose down',
      );

      await project.writeEnv({
        databaseUrl: DATABASE_URL,
        redisUrl: REDIS_URL,
        jwtSecret: JWT_SECRET,
      });

      await project.install();
      await project.prismaGenerate();
      await project.build();

      expect(
        await project.fs.exists(`${project.root}/dist/main.js`),
      ).toBe(true);
    },
    180_000,
  );

  // =========================================================================
  // Case 7 — CI (Tier 1/2 Matrix Verification)
  // =========================================================================
  it(
    'Case 7: generates GitHub Actions workflow and references valid project scripts',
    async () => {
      project = await createGeneratedProject(
        resolveConfig({
          projectName: 'matrix-ci-api',
          ci: true,
          testing: true,
        }),
        'forgekit-matrix-ci',
      );

      const workflowPath = `${project.root}/.github/workflows/ci.yml`;
      expect(
        await project.fs.exists(workflowPath),
      ).toBe(true);

      const workflow = await project.fs.readFile(workflowPath);
      expect(workflow).toContain('actions/checkout@v4');
      expect(workflow).toContain('actions/setup-node@v4');
      expect(workflow).toContain("node-version: '22'");
      expect(workflow).toContain('run: npm install');
      expect(workflow).toContain('Generate Prisma Client');
      expect(workflow).toContain('run: npm run typecheck');
      expect(workflow).toContain('Run unit tests');
      expect(workflow).toContain('run: npm test');
      expect(workflow).toContain('run: npm run build');

      const pkg = JSON.parse(
        await project.fs.readFile(`${project.root}/package.json`),
      ) as { scripts?: Record<string, string> };

      expect(pkg.scripts?.['typecheck']).toBe('tsc --noEmit');
      expect(pkg.scripts?.['test']).toBe('jest');
      expect(pkg.scripts?.['build']).toBe('nest build');
    },
    120_000,
  );

  // =========================================================================
  // Case 8 — Testing Enabled (Tier 1/2 Matrix Verification)
  // =========================================================================
  it(
    'Case 8: generates complete unit and E2E testing infrastructure',
    async () => {
      project = await createGeneratedProject(
        resolveConfig({
          projectName: 'matrix-testing-api',
          testing: true,
        }),
        'forgekit-matrix-testing',
      );

      expect(
        await project.fs.exists(`${project.root}/jest.config.ts`),
      ).toBe(true);
      expect(
        await project.fs.exists(
          `${project.root}/test/jest-e2e.json`,
        ),
      ).toBe(true);
      expect(
        await project.fs.exists(
          `${project.root}/src/app.module.spec.ts`,
        ),
      ).toBe(true);
      expect(
        await project.fs.exists(
          `${project.root}/test/app.e2e-spec.ts`,
        ),
      ).toBe(true);

      const pkg = JSON.parse(
        await project.fs.readFile(`${project.root}/package.json`),
      ) as {
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
      expect(pkg.devDependencies?.['ts-jest']).toBeDefined();
      expect(pkg.devDependencies?.['supertest']).toBeDefined();
    },
    120_000,
  );

  // =========================================================================
  // Case 9 — Full-Feature Project (Tier 3 Complete Lifecycle)
  // =========================================================================
  it(
    'Case 9: generates and executes complete lifecycle for full-feature matrix configuration',
    async () => {
      const fullConfig = resolveConfig({
        projectName: 'matrix-full-feature-api',
        database: 'postgres',
        orm: 'prisma',
        redis: true,
        auth: 'jwt',
        swagger: true,
        docker: true,
        ci: true,
        testing: true,
        packageManager: 'npm',
      });

      project = await createGeneratedProject(
        fullConfig,
        'forgekit-matrix-full',
      );

      // Verify presence of all feature artifacts
      expect(
        await project.fs.exists(`${project.root}/prisma/schema.prisma`),
      ).toBe(true);
      expect(
        await project.fs.exists(
          `${project.root}/src/infrastructure/redis/redis.module.ts`,
        ),
      ).toBe(true);
      expect(
        await project.fs.exists(
          `${project.root}/src/modules/auth/auth.module.ts`,
        ),
      ).toBe(true);
      expect(
        await project.fs.exists(
          `${project.root}/src/infrastructure/swagger/swagger.setup.ts`,
        ),
      ).toBe(true);
      expect(
        await project.fs.exists(`${project.root}/Dockerfile`),
      ).toBe(true);
      expect(
        await project.fs.exists(
          `${project.root}/.github/workflows/ci.yml`,
        ),
      ).toBe(true);
      expect(
        await project.fs.exists(`${project.root}/jest.config.ts`),
      ).toBe(true);
      expect(
        await project.fs.exists(
          `${project.root}/test/jest-e2e.json`,
        ),
      ).toBe(true);

      // Execute full lifecycle
      await project.writeEnv({
        databaseUrl: DATABASE_URL,
        redisUrl: REDIS_URL,
        jwtSecret: JWT_SECRET,
      });

      await project.install();
      await project.prismaGenerate();

      // Step: typecheck
      await execFileAsync('npm', ['run', 'typecheck'], {
        cwd: project.root,
      });

      // Step: unit tests
      await execFileAsync('npm', ['test'], {
        cwd: project.root,
      });

      // Step: E2E tests (deterministic provider overrides)
      await execFileAsync('npm', ['run', 'test:e2e'], {
        cwd: project.root,
      });

      // Step: build
      await project.build();

      expect(
        await project.fs.exists(`${project.root}/dist/main.js`),
      ).toBe(true);

      // Verify Prisma Query Engine native binary is bundled in dist/generated/prisma
      const distPrismaFiles = await readdir(
        `${project.root}/dist/generated/prisma`,
      );
      const hasEngineBinary = distPrismaFiles.some((file) =>
        file.endsWith('.node'),
      );
      expect(hasEngineBinary).toBe(true);
    },
    240_000,
  );
});
