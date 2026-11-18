import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
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
});
