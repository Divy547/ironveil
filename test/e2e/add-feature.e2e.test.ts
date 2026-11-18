import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { planAdd } from '../../src/adding/index.js';
import { resolveConfig } from '../../src/config/index.js';
import { applyChanges } from '../../src/safety/index.js';
import { parseFields, planResource } from '../../src/scaffolding/index.js';
import { createGeneratedProject } from './helpers/generated-project.js';
import {
  assertBootsAndShutsDownCleanly,
  prepareProject,
} from './helpers/runtime-checks.js';

// A fresh database per run: `migrate deploy` creates it.
const DATABASE_URL = `postgresql://postgres:postgres@localhost:5432/ironveil-add-e2e-${Date.now()}?schema=public`;
const SWAGGER_REDIS_DATABASE_URL = `postgresql://postgres:postgres@localhost:5432/ironveil-add-sr-e2e-${Date.now()}?schema=public`;
const AUTH_DATABASE_URL = `postgresql://postgres:postgres@localhost:5432/ironveil-add-auth-e2e-${Date.now()}?schema=public`;
const JWT_SECRET = 'ironveil-add-e2e-super-secret-key-2026-change-me';
const REDIS_URL = 'redis://localhost:6379';

const execFileAsync = promisify(execFile);

describe('Ironveil add E2E', () => {
  let project: Awaited<ReturnType<typeof createGeneratedProject>> | undefined;

  afterEach(async () => {
    await project?.cleanup();
    project = undefined;
  });

  it(
    'a project created without testing, docker, CI and AI files gains them, then installs, lints, builds, passes its tests and boots',
    async () => {
      project = await createGeneratedProject(
        resolveConfig({
          projectName: 'generated-add-api',
          testing: false,
          docker: false,
          ci: false,
          ai: 'none',
        }),
        'ironveil-add-e2e',
      );
      const root = project.root;

      // The user has been working: a resource and a dependency of their own,
      // so `add` has real edits to merge around.
      const resource = await planResource({
        root,
        name: 'product',
        fields: parseFields('name:string price:decimal'),
      });
      await applyChanges(resource.changeSet);
      const manifestPath = path.join(root, 'package.json');
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
        dependencies: Record<string, string>;
      };
      manifest.dependencies.dayjs = '1.11.13';
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

      // Order matters: CI first, so adding testing has to merge into its workflow.
      for (const [feature, mode] of [
        ['ci', undefined],
        ['testing', undefined],
        ['docker', undefined],
        ['ai', 'all'],
      ] as const) {
        const plan = await planAdd({ root, feature, mode });
        expect(plan.alreadyEnabled).toBe(false);
        await applyChanges(plan.changeSet);
      }

      // The user's own dependency survived the merge.
      const merged = JSON.parse(await readFile(manifestPath, 'utf8')) as {
        dependencies: Record<string, string>;
        scripts: Record<string, string>;
      };
      expect(merged.dependencies.dayjs).toBe('1.11.13');
      expect(merged.scripts.test).toBe('jest');
      expect(merged.scripts['docker:up']).toBeDefined();

      await prepareProject(project, { databaseUrl: DATABASE_URL });

      // Jest, ts-jest and the specs `add testing` wrote must really run.
      await project.test();
      await project.testE2e();

      await assertBootsAndShutsDownCleanly(project, { redis: false });
    },
    900_000,
  );

  it(
    'a project created without Swagger and Redis gains them next to an existing resource, then builds, passes its tests, serves /api/docs and reports Redis ready',
    async () => {
      project = await createGeneratedProject(
        resolveConfig({
          projectName: 'generated-add-swagger-redis-api',
          swagger: false,
          redis: false,
        }),
        'ironveil-add-sr-e2e',
      );
      const root = project.root;

      const resource = await planResource({
        root,
        name: 'product',
        fields: parseFields('name:string price:decimal'),
      });
      await applyChanges(resource.changeSet);

      for (const feature of ['swagger', 'redis'] as const) {
        const plan = await planAdd({ root, feature });
        expect(plan.alreadyEnabled).toBe(false);
        await applyChanges(plan.changeSet);
      }

      // `add` never edits the user's own .env, so the helper plays the user
      // copying REDIS_URL across, as the next steps tell them to.
      await prepareProject(project, {
        databaseUrl: SWAGGER_REDIS_DATABASE_URL,
        redisUrl: REDIS_URL,
      });

      await project.test();
      await project.testE2e();

      await assertBootsAndShutsDownCleanly(project, {
        redis: true,
        exercise: async (server) => {
          const docs = await fetch(`${server.baseUrl}/api/docs`);
          expect(docs.status).toBe(200);

          const spec = (await (
            await fetch(`${server.baseUrl}/api/docs-json`)
          ).json()) as { paths: Record<string, unknown> };
          // The resource that was generated before Swagger existed is still served.
          expect(Object.keys(spec.paths)).toContain('/products');
        },
      });
    },
    900_000,
  );
  it(
    'a database that already ran its migrations gains auth through an additive migration: the old row survives, the schema has no drift, the resource tests sign in and the guard works',
    async () => {
      project = await createGeneratedProject(
        resolveConfig({ projectName: 'generated-add-auth-api', auth: 'none' }),
        'ironveil-add-auth-e2e',
      );
      const root = project.root;

      const resource = await planResource({
        root,
        name: 'product',
        fields: parseFields('name:string price:decimal'),
      });
      await applyChanges(resource.changeSet);

      // The project is in use: its database has 0001_init and the product
      // migration applied, and a user who signed up before auth existed.
      await project.writeEnv({ databaseUrl: AUTH_DATABASE_URL });
      await project.install();
      await project.prismaGenerate();
      await project.prismaMigrateDeploy();
      const prisma = async (...args: string[]) =>
        execFileAsync('npx', ['prisma', ...args], {
          cwd: root,
          env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' },
        });
      const sqlFile = path.join(root, 'old-user.sql');
      await writeFile(
        sqlFile,
        `INSERT INTO "User" ("id", "email", "passwordHash", "updatedAt") VALUES ('old-1', 'old@example.com', 'x', now());\n`,
      );
      await prisma('db', 'execute', '--file', sqlFile, '--schema', 'prisma/schema.prisma');

      const plan = await planAdd({ root, feature: 'auth' });
      expect(plan.alreadyEnabled).toBe(false);
      expect(plan.migration).toMatch(/^\d{14}_add_auth$/);
      await applyChanges(plan.changeSet);

      // The user's next steps: configure, install, generate, migrate.
      await project.writeEnv({ databaseUrl: AUTH_DATABASE_URL, jwtSecret: JWT_SECRET });
      await project.install();
      await project.prismaGenerate();
      await project.prismaMigrateDeploy();

      // The hand-written SQL must leave the database exactly as the schema
      // says: `migrate diff --exit-code` fails (exit 2) on any difference.
      await prisma(
        'migrate',
        'diff',
        '--from-url',
        AUTH_DATABASE_URL,
        '--to-schema-datamodel',
        'prisma/schema.prisma',
        '--exit-code',
      );

      await project.lint();
      await project.typecheck();
      await project.build();

      // The product spec was generated without a token; `add auth` made it sign in.
      await project.test();
      await project.testE2e();

      await assertBootsAndShutsDownCleanly(project, {
        redis: false,
        exercise: async (server) => {
          const json = { 'Content-Type': 'application/json' };
          const credentials = JSON.stringify({
            email: `new-${process.pid}@example.com`,
            password: 'password123',
          });

          expect((await fetch(`${server.baseUrl}/products`)).status).toBe(401);

          const registered = await fetch(`${server.baseUrl}/auth/register`, {
            method: 'POST',
            headers: json,
            body: credentials,
          });
          expect(registered.status).toBe(201);

          const login = await fetch(`${server.baseUrl}/auth/login`, {
            method: 'POST',
            headers: json,
            body: credentials,
          });
          expect(login.status).toBeLessThan(300);
          const { accessToken } = (await login.json()) as { accessToken: string };

          const products = await fetch(`${server.baseUrl}/products`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          expect(products.status).toBe(200);
        },
      });
    },
    900_000,
  );
});
