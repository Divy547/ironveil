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
  'postgresql://postgres:postgres@localhost:5432/forgekit-docker-e2e?schema=public';

const JWT_SECRET =
  'forgekit-docker-e2e-super-secret-key-2026';

describe('Ironveil Docker E2E', () => {
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
    'generates, installs, and builds a Docker-enabled project independently with full stack and published host ports',
    async () => {
      project = await createGeneratedProject(
        resolveConfig({
          projectName: 'docker-enabled-api',
          docker: true,
          redis: true,
          auth: 'jwt',
          swagger: true,
        }),
        'forgekit-docker-enabled-e2e',
      );

      // 1. Verify Docker files exist
      expect(
        await project.fs.exists(`${project.root}/Dockerfile`),
      ).toBe(true);
      expect(
        await project.fs.exists(`${project.root}/docker-compose.yml`),
      ).toBe(true);
      expect(
        await project.fs.exists(`${project.root}/.dockerignore`),
      ).toBe(true);

      // 2. Verify Dockerfile content
      const dockerfile = await project.fs.readFile(
        `${project.root}/Dockerfile`,
      );
      expect(dockerfile).toContain('FROM node:22-alpine AS builder');
      expect(dockerfile).toContain('FROM node:22-alpine AS runner');
      expect(dockerfile).toContain('npm install');
      expect(dockerfile).not.toContain('npm ci');
      expect(dockerfile).toContain('npx prisma generate');
      expect(dockerfile).toContain('npm run build');
      expect(dockerfile).toContain('CMD ["node", "dist/main.js"]');
      expect(dockerfile).not.toContain('forgekit');
      expect(dockerfile).not.toContain('ForgeKit');

      // 3. Verify .dockerignore content
      const dockerignore = await project.fs.readFile(
        `${project.root}/.dockerignore`,
      );
      expect(dockerignore).toContain('node_modules');
      expect(dockerignore).toContain('dist');
      expect(dockerignore).toContain('.env');

      // 4. Verify docker-compose.yml content & service matrix
      const compose = await project.fs.readFile(
        `${project.root}/docker-compose.yml`,
      );
      expect(compose).toContain('services:');
      expect(compose).toContain('api:');
      expect(compose).toContain('postgres:');
      expect(compose).toContain('redis:');
      expect(compose).toContain('postgres:16-alpine');
      expect(compose).toContain('redis:7-alpine');

      // Verify port publishing for API, PostgreSQL, and Redis
      expect(compose).toContain('"3000:3000"');
      expect(compose).toContain('"5432:5432"');
      expect(compose).toContain('"6379:6379"');

      // 5. Verify Docker environment values (internal container network hostnames)
      expect(compose).toContain('DATABASE_URL');
      expect(compose).toContain('@postgres:5432/docker-enabled-api');
      expect(compose).toContain('REDIS_URL: "redis://redis:6379"');
      expect(compose).toContain('JWT_SECRET: "${JWT_SECRET}"');
      expect(compose).toContain('./node_modules/.bin/prisma migrate deploy');
      expect(compose).toContain('depends_on:');
      expect(compose).toContain('condition: service_healthy');
      expect(compose).toContain('postgres_data:');
      expect(compose).toContain('redis_data:');
      expect(compose).not.toContain('forgekit');
      expect(compose).not.toContain('ForgeKit');

      // 6. Verify package.json scripts
      const packageJsonContent = await project.fs.readFile(
        `${project.root}/package.json`,
      );
      const packageJson = JSON.parse(packageJsonContent) as {
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };

      expect(packageJson.scripts?.['docker:up']).toBe('docker compose up --build');
      expect(packageJson.scripts?.['docker:down']).toBe('docker compose down');
      expect(packageJson.dependencies?.forgekit).toBeUndefined();
      expect(packageJson.devDependencies?.forgekit).toBeUndefined();

      // 7. Verify generated README contains both host-based and containerized workflows
      const readme = await project.fs.readFile(
        `${project.root}/README.md`,
      );
      expect(readme).toContain('docker compose up -d postgres redis');
      expect(readme).toContain('npx prisma migrate dev');
      expect(readme).toContain('npm run start:dev');
      expect(readme).toContain('npm run docker:up');

      // 8. Verify project installs and builds independently
      await project.writeEnv({
        databaseUrl: DATABASE_URL,
        jwtSecret: JWT_SECRET,
      });

      await project.install();
      await project.prismaGenerate();
      await project.build();

      expect(
        await project.fs.exists(`${project.root}/dist/main.js`),
      ).toBe(true);

      // Verify Prisma query engine is copied into dist/generated/prisma as a build asset
      const { readdir } = await import('node:fs/promises');
      const distPrismaFiles = await readdir(
        `${project.root}/dist/generated/prisma`,
      );
      const hasEngineBinary = distPrismaFiles.some((file) =>
        file.endsWith('.node'),
      );
      expect(hasEngineBinary).toBe(true);
    },
    360_000,
  );

  it(
    'generates no Docker artifacts when docker is disabled',
    async () => {
      project = await createGeneratedProject(
        resolveConfig({
          projectName: 'docker-disabled-api',
          docker: false,
          redis: false,
        }),
        'forgekit-docker-disabled-e2e',
      );

      expect(
        await project.fs.exists(`${project.root}/Dockerfile`),
      ).toBe(false);
      expect(
        await project.fs.exists(`${project.root}/docker-compose.yml`),
      ).toBe(false);
      expect(
        await project.fs.exists(`${project.root}/.dockerignore`),
      ).toBe(false);

      const packageJsonContent = await project.fs.readFile(
        `${project.root}/package.json`,
      );
      const packageJson = JSON.parse(packageJsonContent) as {
        scripts?: Record<string, string>;
      };

      expect(packageJson.scripts?.['docker:up']).toBeUndefined();
      expect(packageJson.scripts?.['docker:down']).toBeUndefined();
    },
    120_000,
  );
});
