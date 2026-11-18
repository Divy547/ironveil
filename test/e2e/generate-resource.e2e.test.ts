import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveConfig } from '../../src/config/index.js';
import { applyChanges } from '../../src/safety/index.js';
import { parseFields, planResource } from '../../src/scaffolding/index.js';
import { createGeneratedProject } from './helpers/generated-project.js';
import {
  assertBootsAndShutsDownCleanly,
  prepareProject,
} from './helpers/runtime-checks.js';

const execFileAsync = promisify(execFile);

// A fresh database per run: the CRUD checks count rows, the database is created
// by `migrate deploy`, and nothing here may run destructive Prisma commands.
const DATABASE_URL = `postgresql://postgres:postgres@localhost:5432/ironveil-resource-e2e-${Date.now()}?schema=public`;
const REDIS_URL = 'redis://localhost:6379';
const JWT_SECRET = 'ironveil-resource-e2e-super-secret-key-32chars';

describe('Ironveil generate resource E2E', () => {
  let project:
    | Awaited<ReturnType<typeof createGeneratedProject>>
    | undefined;

  afterEach(async () => {
    await project?.cleanup();
    project = undefined;
  });

  it(
    'generates two resources that migrate, lint, build, pass their own tests and serve real CRUD',
    async () => {
      project = await createGeneratedProject(
        resolveConfig({
          projectName: 'generated-resource-api',
          auth: 'jwt',
          redis: true,
        }),
        'ironveil-resource-e2e',
      );
      const root = project.root;

      for (const [name, fields] of [
        [
          'product',
          'name:string description:text? price:decimal stock:int rating:float? active:boolean publishedAt:datetime?',
        ],
        ['blog-post', 'title:string body:text?'],
      ] as const) {
        const plan = await planResource({
          root,
          name,
          fields: parseFields(fields),
        });
        await applyChanges(plan.changeSet);
      }

      // Installs, `prisma generate`, `migrate deploy` (so the generated
      // migration SQL must be valid), lint, typecheck and build.
      await prepareProject(project, {
        databaseUrl: DATABASE_URL,
        redisUrl: REDIS_URL,
        jwtSecret: JWT_SECRET,
      });

      // The hand-written migration must describe exactly the model Prisma
      // would have migrated to: diffing the migrated database against the
      // schema must report no difference (exit code 0; 2 means drift).
      await execFileAsync(
        'npx',
        [
          'prisma',
          'migrate',
          'diff',
          '--from-url',
          DATABASE_URL,
          '--to-schema-datamodel',
          'prisma/schema.prisma',
          '--exit-code',
        ],
        { cwd: root },
      );

      // The generated unit specs and HTTP-level e2e specs pass in the project.
      await project.test();
      await project.testE2e();

      await assertBootsAndShutsDownCleanly(project, {
        redis: true,
        exercise: async () => {
          const base = project!.baseUrl;
          const json = { 'Content-Type': 'application/json' };

          const email = `resource-${process.pid}-${Date.now()}@example.com`;
          await fetch(`${base}/auth/register`, {
            method: 'POST',
            headers: json,
            body: JSON.stringify({ email, password: 'password123' }),
          });
          const login = await fetch(`${base}/auth/login`, {
            method: 'POST',
            headers: json,
            body: JSON.stringify({ email, password: 'password123' }),
          });
          const { accessToken } = (await login.json()) as {
            accessToken: string;
          };
          const auth = { ...json, Authorization: `Bearer ${accessToken}` };

          // Protected like every other route.
          expect((await fetch(`${base}/products`)).status).toBe(401);

          const payload = {
            name: 'Widget',
            price: 9.99,
            stock: 5,
            active: true,
            publishedAt: '2026-01-01T00:00:00.000Z',
          };

          const created = await fetch(`${base}/products`, {
            method: 'POST',
            headers: auth,
            body: JSON.stringify(payload),
          });
          expect(created.status).toBe(201);
          const product = (await created.json()) as Record<string, unknown>;
          expect(product).toMatchObject({
            name: 'Widget',
            stock: 5,
            active: true,
            description: null,
            rating: null,
          });
          // Prisma serialises a Decimal column as a string.
          expect(Number(product.price)).toBeCloseTo(9.99);
          expect(product.id).toBeTypeOf('string');

          // Validation and the whitelist are active in the real app.
          const invalid = await fetch(`${base}/products`, {
            method: 'POST',
            headers: auth,
            body: JSON.stringify({ name: 'x', stock: 'many' }),
          });
          expect(invalid.status).toBe(400);
          const extra = await fetch(`${base}/products`, {
            method: 'POST',
            headers: auth,
            body: JSON.stringify({ ...payload, admin: true }),
          });
          expect(extra.status).toBe(400);

          for (let index = 0; index < 2; index += 1) {
            await fetch(`${base}/products`, {
              method: 'POST',
              headers: auth,
              body: JSON.stringify({ ...payload, name: `Extra ${index}` }),
            });
          }

          const page = await fetch(`${base}/products?page=2&limit=2`, {
            headers: auth,
          });
          expect(page.status).toBe(200);
          const pageBody = (await page.json()) as {
            data: unknown[];
            meta: Record<string, number>;
          };
          expect(pageBody.data).toHaveLength(1);
          expect(pageBody.meta).toEqual({
            total: 3,
            page: 2,
            limit: 2,
            totalPages: 2,
          });

          const byId = await fetch(`${base}/products/${String(product.id)}`, {
            headers: auth,
          });
          expect(byId.status).toBe(200);

          const patched = await fetch(`${base}/products/${String(product.id)}`, {
            method: 'PATCH',
            headers: auth,
            body: JSON.stringify({ name: 'Renamed', rating: 4.5 }),
          });
          expect(patched.status).toBe(200);
          expect(await patched.json()).toMatchObject({
            name: 'Renamed',
            rating: 4.5,
          });

          // A required column can be left out of a PATCH but never nulled.
          const nulled = await fetch(`${base}/products/${String(product.id)}`, {
            method: 'PATCH',
            headers: auth,
            body: JSON.stringify({ name: null }),
          });
          expect(nulled.status).toBe(400);

          // Real Prisma P2025 -> 404 through the global filter.
          const missingPatch = await fetch(`${base}/products/nope`, {
            method: 'PATCH',
            headers: auth,
            body: JSON.stringify({ name: 'x' }),
          });
          expect(missingPatch.status).toBe(404);
          const missingGet = await fetch(`${base}/products/nope`, {
            headers: auth,
          });
          expect(missingGet.status).toBe(404);

          const removed = await fetch(`${base}/products/${String(product.id)}`, {
            method: 'DELETE',
            headers: auth,
          });
          expect(removed.status).toBe(204);
          expect(
            (
              await fetch(`${base}/products/${String(product.id)}`, {
                headers: auth,
              })
            ).status,
          ).toBe(404);

          // The second resource is wired up independently.
          const post = await fetch(`${base}/blog-posts`, {
            method: 'POST',
            headers: auth,
            body: JSON.stringify({ title: 'Hello' }),
          });
          expect(post.status).toBe(201);
          expect(await post.json()).toMatchObject({
            title: 'Hello',
            body: null,
          });

          // Swagger picked the routes and DTOs up.
          const docs = (await (await fetch(`${base}/api/docs-json`)).json()) as {
            paths: Record<string, unknown>;
            components: { schemas: Record<string, unknown> };
          };
          expect(Object.keys(docs.paths)).toEqual(
            expect.arrayContaining([
              '/products',
              '/products/{id}',
              '/blog-posts',
              '/blog-posts/{id}',
            ]),
          );
          expect(Object.keys(docs.components.schemas)).toEqual(
            expect.arrayContaining(['CreateProductDto', 'UpdateBlogPostDto']),
          );
        },
      });
    },
    15 * 60 * 1000,
  );
});
