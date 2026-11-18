import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveConfig } from '../../src/config/index.js';
import { generateProject } from '../../src/generators/generate-project.js';
import { parseFields, planResource } from '../../src/scaffolding/index.js';

// Every file `generate resource` writes or edits, as a readable snapshot per
// configuration, so a change to the generated code shows up as a diff to
// review. After an intended change run
//   pnpm exec vitest run -u test/unit/resource-snapshots.test.ts
// and review the diff.
const COMBINATIONS = [
  {
    name: 'default',
    overrides: {},
    fields: 'name:string description:text? price:decimal stock:int rating:float? active:boolean publishedAt:datetime?',
  },
  {
    name: 'jwt-redis',
    overrides: { auth: 'jwt', redis: true },
    fields: 'title:string body:text?',
  },
  {
    name: 'minimal',
    overrides: { swagger: false, testing: false },
    fields: '',
  },
] as const;

describe('generated resource snapshots', () => {
  let workspace: string;

  beforeEach(async () => {
    workspace = await mkdtemp(path.join(os.tmpdir(), 'ironveil-resource-snap-'));
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  it.each(COMBINATIONS)('$name', async ({ name, overrides, fields }) => {
    const project = await generateProject(
      resolveConfig({ projectName: 'snapshot-api', ...overrides }),
      workspace,
    );
    const plan = await planResource({
      root: project.destination,
      name: 'blog-post',
      fields: parseFields(fields),
      now: new Date('2026-11-18T09:30:00Z'),
    });

    for (const change of plan.changeSet.changes) {
      // Edited files are shown as the diff, so an unrelated template change
      // does not churn these snapshots.
      const content =
        change.kind === 'create'
          ? change.after
          : plan.changeSet
              .renderDiff()
              .split(/^(?=--- )/m)
              .find((part) => part.includes(`+++ b/${change.path}`)) ?? '';

      await expect(content).toMatchFileSnapshot(
        `__snapshots__/resource/${name}/${change.path}${change.kind === 'modify' ? '.diff' : ''}.txt`,
      );
    }
  });
});
