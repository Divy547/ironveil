import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  formatEditFailure,
  formatResourceDryRun,
  formatResourceResult,
} from '../../src/cli/output/generate-output.js';
import { resolveConfig } from '../../src/config/index.js';
import { generateProject } from '../../src/generators/generate-project.js';
import { ManifestError } from '../../src/manifest/index.js';
import { DirtyWorkingTreeError, SafetyError, applyChanges } from '../../src/safety/index.js';
import { GenerateError, parseFields, planResource } from '../../src/scaffolding/index.js';

describe('generate output', () => {
  let workspace: string;

  beforeEach(async () => {
    workspace = await mkdtemp(path.join(os.tmpdir(), 'ironveil-gen-output-'));
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  async function planFor(
    overrides: Parameters<typeof resolveConfig>[0] = {},
    name = 'blog-post',
  ) {
    const project = await generateProject(
      resolveConfig({ projectName: 'shop-api', ...overrides }),
      workspace,
    );
    return planResource({
      root: project.destination,
      name,
      fields: parseFields('title:string'),
      now: new Date('2026-11-18T09:30:00Z'),
    });
  }

  describe('formatResourceResult', () => {
    it('lists created and updated files and the next steps', async () => {
      const plan = await planFor({ packageManager: 'pnpm' });
      const result = await applyChanges(plan.changeSet);

      const output = formatResourceResult(plan, result);

      expect(output).toContain('Generated resource BlogPost');
      expect(output).toContain('created  src/modules/blog-posts/blog-posts.module.ts');
      expect(output).toContain('updated  src/app.module.ts');
      expect(output).toContain('updated  prisma/schema.prisma');
      expect(output).toContain('Next steps:');
      expect(output).toContain('pnpm run db:generate');
      expect(output).toContain('pnpm run db:migrate');
      expect(output).toContain('20261118093000_create_blog_posts');
    });

    it('uses the project package manager in the next steps', async () => {
      const plan = await planFor({ packageManager: 'yarn' });
      const result = await applyChanges(plan.changeSet);

      const output = formatResourceResult(plan, result);

      expect(output).toContain('yarn db:generate');
      expect(output).not.toContain('pnpm');
    });

    it('lists the routes the resource exposes', async () => {
      const plan = await planFor();
      const result = await applyChanges(plan.changeSet);

      const output = formatResourceResult(plan, result);

      expect(output).toContain('POST   /blog-posts');
      expect(output).toContain('GET    /blog-posts?page=1&limit=20');
      expect(output).toContain('GET    /blog-posts/:id');
      expect(output).toContain('PATCH  /blog-posts/:id');
      expect(output).toContain('DELETE /blog-posts/:id');
    });

    it('says there is nothing to do when the resource already exists', async () => {
      const plan = await planFor();
      await applyChanges(plan.changeSet);
      const again = await planResource({
        root: plan.changeSet.root,
        name: 'blog-post',
        fields: parseFields('title:string'),
      });
      const result = await applyChanges(again.changeSet);

      const output = formatResourceResult(again, result);

      expect(output).toMatch(/already (generated|exists)/i);
      expect(output).not.toContain('Next steps');
    });
  });

  describe('formatResourceDryRun', () => {
    it('shows the planned files and diff and states nothing was written', async () => {
      const plan = await planFor();
      const result = await applyChanges(plan.changeSet, { dryRun: true });

      const output = formatResourceDryRun(plan, result);

      expect(output).toMatch(/dry run/i);
      expect(output).toContain('create  src/modules/blog-posts/blog-posts.module.ts');
      expect(output).toContain('modify  src/app.module.ts');
      expect(output).toContain('+++ b/src/modules/blog-posts/blog-posts.module.ts');
      expect(output).toContain('+export class BlogPostsModule {}');
      expect(output).toMatch(/no files were written/i);
      expect(output).not.toContain('Next steps');
    });
  });

  describe('formatEditFailure', () => {
    it.each([
      ['GenerateError', new GenerateError('bad name')],
      ['SafetyError', new SafetyError('unsafe')],
      ['ManifestError', new ManifestError('not a project')],
    ])('shows the message of a %s and says nothing was changed', (_name, error) => {
      const output = formatEditFailure(error);

      expect(output).toContain(error.message);
      expect(output).toMatch(/no files were changed/i);
    });

    it('keeps the dirty-tree message intact, --force hint included', () => {
      const output = formatEditFailure(new DirtyWorkingTreeError(['a.txt']));

      expect(output).toContain('a.txt');
      expect(output).toContain('--force');
    });

    it('prints an unexpected error without claiming nothing changed', () => {
      const output = formatEditFailure(new Error('boom'));

      expect(output).toContain('boom');
      expect(output).not.toMatch(/no files were changed/i);
    });
  });
});
