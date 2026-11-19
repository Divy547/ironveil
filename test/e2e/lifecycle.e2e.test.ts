import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveConfig } from '../../src/config/index.js';
import {
  adoptGeneratedProject,
  type GeneratedProject,
} from './helpers/generated-project.js';
import {
  assertBootsAndShutsDownCleanly,
  prepareProject,
} from './helpers/runtime-checks.js';

const execFileAsync = promisify(execFile);

const cliPath = path.resolve('dist/src/index.js');

// A fresh database per run: `migrate deploy` creates it.
const DATABASE_URL = `postgresql://postgres:postgres@localhost:5432/ironveil-lifecycle-e2e-${Date.now()}?schema=public`;
const REDIS_URL = 'redis://localhost:6379';

/**
 * The whole point of the editing commands: a user runs them one after another
 * on one project, and it must still migrate, lint, build and pass its tests.
 * Everything here goes through the real, built CLI in a real git repository,
 * so the dirty-tree protection, the manifest and the merge engine are all in
 * play, not just the planners the other e2e files call directly.
 */
describe('Ironveil project lifecycle E2E', () => {
  let workspace: string | undefined;
  let project: GeneratedProject | undefined;

  afterEach(async () => {
    await project?.cleanup();
    project = undefined;
    if (workspace !== undefined) {
      await rm(workspace, { recursive: true, force: true });
      workspace = undefined;
    }
  });

  it(
    'create, then two resources, then add redis: the project migrates without drift, builds, passes all its tests, boots, serves both resources and doctor finds nothing wrong',
    async () => {
      workspace = await mkdtemp(path.join(os.tmpdir(), 'ironveil-lifecycle-e2e-'));
      const root = path.join(workspace, 'lifecycle-api');

      const iron = async (...args: string[]) => {
        const { stdout } = await execFileAsync('node', [cliPath, ...args], {
          cwd: root,
        });
        return stdout;
      };
      const git = (...args: string[]) =>
        execFileAsync(
          'git',
          [
            '-c', 'user.name=Ironveil E2E',
            '-c', 'user.email=e2e@example.com',
            '-c', 'commit.gpgsign=false',
            ...args,
          ],
          { cwd: root },
        );
      const commit = async (message: string) => {
        await git('add', '-A');
        await git('commit', '-q', '-m', message);
      };

      await execFileAsync('node', [cliPath, 'create', 'lifecycle-api', '--yes'], {
        cwd: workspace,
      });
      await git('init', '-q');
      await commit('create');

      // Each command starts from a clean tree, as a careful user's would.
      await iron('generate', 'resource', 'product', '--fields', 'name:string price:decimal stock:int', '--yes');
      await commit('generate product');
      await iron('generate', 'resource', 'blog-post', '--fields', 'title:string body:text?', '--yes');
      await commit('generate blog-post');

      // The safety net works on the real thing: with an uncommitted change in
      // the tree, the next command refuses and writes nothing.
      await execFileAsync('node', ['-e', `require('fs').appendFileSync('README.md', '\\nnotes\\n')`], {
        cwd: root,
      });
      await expect(iron('add', 'redis')).rejects.toMatchObject({
        stderr: expect.stringContaining('uncommitted changes'),
      });
      await git('checkout', '--', 'README.md');

      const added = await iron('add', 'redis');
      expect(added).toContain('Added redis.');
      await commit('add redis');

      const config = resolveConfig({ projectName: 'lifecycle-api', redis: true });
      project = adoptGeneratedProject(root, config, workspace);

      // The user copies REDIS_URL across, as `add redis` tells them to.
      await prepareProject(project, {
        databaseUrl: DATABASE_URL,
        redisUrl: REDIS_URL,
      });

      // Both generated migrations, applied after 0001_init, must describe
      // exactly the schema: any difference exits with code 2.
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

      await project.test();
      await project.testE2e();

      await assertBootsAndShutsDownCleanly(project, {
        redis: true,
        exercise: async (server) => {
          const json = { 'Content-Type': 'application/json' };

          const product = await fetch(`${server.baseUrl}/products`, {
            method: 'POST',
            headers: json,
            body: JSON.stringify({ name: 'Widget', price: 9.99, stock: 5 }),
          });
          expect(product.status).toBe(201);

          const post = await fetch(`${server.baseUrl}/blog-posts`, {
            method: 'POST',
            headers: json,
            body: JSON.stringify({ title: 'Hello' }),
          });
          expect(post.status).toBe(201);

          for (const route of ['products', 'blog-posts']) {
            const list = await fetch(`${server.baseUrl}/${route}`);
            expect(list.status).toBe(200);
            const body = (await list.json()) as { data: unknown[] };
            expect(body.data).toHaveLength(1);
          }
        },
      });

      // After all of that, the project agrees with its manifest: --strict
      // turns any warning (unregistered module, missing file, drift) into a
      // failure, and its output says what is wrong if it does not.
      const doctor = await iron('doctor', '--strict');
      expect(doctor).toContain('No problems found');
    },
    1_200_000,
  );
});
