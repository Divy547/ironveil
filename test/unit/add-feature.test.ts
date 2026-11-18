import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AddError,
  ADDABLE_FEATURES,
  planAdd,
} from '../../src/adding/index.js';
import { resolveConfig } from '../../src/config/index.js';
import { generateProject } from '../../src/generators/generate-project.js';
import { ManifestError, readManifest } from '../../src/manifest/index.js';
import { parseFields, planResource } from '../../src/scaffolding/index.js';
import { IRONVEIL_VERSION } from '../../src/version.js';

type Overrides = Parameters<typeof resolveConfig>[0];

async function readTree(root: string, directory = ''): Promise<Map<string, string>> {
  const tree = new Map<string, string>();
  for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
    const relative = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) {
      for (const [file, text] of await readTree(root, relative)) tree.set(file, text);
    } else {
      tree.set(relative, await readFile(path.join(root, relative), 'utf8'));
    }
  }
  return tree;
}

describe('planAdd', () => {
  let workspace: string;
  let counter = 0;

  beforeEach(async () => {
    workspace = await mkdtemp(path.join(os.tmpdir(), 'ironveil-add-'));
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  async function makeProject(overrides: Overrides = {}): Promise<string> {
    counter += 1;
    const parent = path.join(workspace, `p${counter}`);
    await mkdir(parent);
    const result = await generateProject(
      resolveConfig({ projectName: 'shop-api', ...overrides }),
      parent,
    );
    return result.destination;
  }

  const read = (root: string, relative: string) =>
    readFile(path.join(root, relative), 'utf8');
  const write = (root: string, relative: string, text: string) =>
    writeFile(path.join(root, relative), text);

  async function add(root: string, feature: string, mode?: string) {
    const plan = await planAdd({ root, feature, mode });
    await plan.changeSet.apply();
    return plan;
  }

  it('offers exactly the features this version can add', () => {
    expect([...ADDABLE_FEATURES]).toEqual(['ci', 'ai', 'docker', 'testing']);
  });

  describe('adding gives the same project as creating with the feature', () => {
    const others: ReadonlyArray<readonly [string, Overrides]> = [
      ['defaults', {}],
      ['jwt + redis', { auth: 'jwt', redis: true }],
      ['no swagger, pnpm', { swagger: false, packageManager: 'pnpm' }],
      ['yarn, everything else off', {
        packageManager: 'yarn',
        swagger: false,
        docker: false,
        ci: false,
        testing: false,
        ai: 'none',
      }],
    ];

    const features: ReadonlyArray<{
      label: string;
      feature: string;
      mode?: string;
      off: Overrides;
      on: Overrides;
    }> = [
      { label: 'ci', feature: 'ci', off: { ci: false }, on: { ci: true } },
      { label: 'docker', feature: 'docker', off: { docker: false }, on: { docker: true } },
      { label: 'testing', feature: 'testing', off: { testing: false }, on: { testing: true } },
      { label: 'ai (agents)', feature: 'ai', off: { ai: 'none' }, on: { ai: 'agents' } },
      { label: 'ai agents -> all', feature: 'ai', mode: 'all', off: { ai: 'agents' }, on: { ai: 'all' } },
      { label: 'ai none -> all', feature: 'ai', mode: 'all', off: { ai: 'none' }, on: { ai: 'all' } },
    ];

    for (const { label, feature, mode, off, on } of features) {
      for (const [othersLabel, base] of others) {
        // The feature under test comes from `off` / `on`, not from the others.
        const rest = Object.fromEntries(
          Object.entries(base).filter(([key]) => !(key in off)),
        ) as Overrides;

        it(`${label} (${othersLabel})`, async () => {
          const added = await makeProject({ ...rest, ...off });
          await add(added, feature, mode);

          const created = await makeProject({ ...rest, ...on });

          const expected = await readTree(created);
          const actual = await readTree(added);
          expect([...actual.keys()].sort()).toEqual([...expected.keys()].sort());
          for (const [file, text] of expected) {
            expect(actual.get(file), file).toBe(text);
          }
        });
      }
    }
  });

  describe('what it plans', () => {
    it('writes nothing while planning', async () => {
      const root = await makeProject({ ci: false });
      const before = await readTree(root);

      const plan = await planAdd({ root, feature: 'ci' });

      expect(plan.changeSet.changes.map((change) => change.path)).toContain(
        '.github/workflows/ci.yml',
      );
      expect(await readTree(root)).toEqual(before);
    });

    it('lists new files and edited ones, and says before and after', async () => {
      const root = await makeProject({ testing: false });

      const plan = await planAdd({ root, feature: 'testing' });

      const changes = Object.fromEntries(
        plan.changeSet.changes.map((change) => [change.path, change.kind]),
      );
      expect(changes['jest.config.ts']).toBe('create');
      expect(changes['package.json']).toBe('modify');
      expect(changes['.github/workflows/ci.yml']).toBe('modify');
      expect(changes['ironveil.json']).toBe('modify');
      expect(plan.before.testing).toBe(false);
      expect(plan.after.testing).toBe(true);
      expect(plan.dependenciesChanged).toBe(true);
      expect(plan.alreadyEnabled).toBe(false);
    });

    it('does not flag dependencies when package.json is not touched', async () => {
      const root = await makeProject({ ci: false });

      expect((await planAdd({ root, feature: 'ci' })).dependenciesChanged).toBe(false);
    });

    it('records the new feature in ironveil.json', async () => {
      const root = await makeProject({ ci: false });

      await add(root, 'ci');

      expect((await readManifest(root)).features.ci).toBe(true);
    });

    it('is a no-op when the feature is already enabled', async () => {
      const root = await makeProject();

      const plan = await planAdd({ root, feature: 'docker' });

      expect(plan.alreadyEnabled).toBe(true);
      expect(plan.changeSet.changes).toEqual([]);
    });

    it('is a no-op for ai when the project already has that mode or more', async () => {
      const root = await makeProject({ ai: 'all' });

      const plan = await planAdd({ root, feature: 'ai', mode: 'agents' });

      expect(plan.alreadyEnabled).toBe(true);
      expect(plan.changeSet.changes).toEqual([]);
    });

    it('defaults ai to agents', async () => {
      const root = await makeProject({ ai: 'none' });

      const plan = await planAdd({ root, feature: 'ai' });

      expect(plan.after.ai).toBe('agents');
    });

    it('is a no-op the second time', async () => {
      const root = await makeProject({ testing: false });
      await add(root, 'testing');

      expect((await planAdd({ root, feature: 'testing' })).alreadyEnabled).toBe(true);
    });
  });

  describe('input errors', () => {
    it('rejects an unknown feature and names the ones that exist', async () => {
      const root = await makeProject();

      const failure = planAdd({ root, feature: 'banana' });

      await expect(failure).rejects.toBeInstanceOf(AddError);
      await expect(failure).rejects.toThrow(/Unknown feature "banana".*ci, ai, docker, testing/s);
    });

    it.each(['redis', 'auth', 'swagger'])(
      'says %s is known but not available yet',
      async (feature) => {
        const root = await makeProject();

        await expect(planAdd({ root, feature })).rejects.toThrow(/not available yet/);
      },
    );

    it('rejects a mode for a feature that has none', async () => {
      const root = await makeProject({ docker: false });

      await expect(planAdd({ root, feature: 'docker', mode: 'x' })).rejects.toThrow(
        /docker.*no mode/i,
      );
    });

    it('rejects an invalid ai mode', async () => {
      const root = await makeProject({ ai: 'none' });

      await expect(planAdd({ root, feature: 'ai', mode: 'everything' })).rejects.toThrow(
        /agents, all/,
      );
    });

    it('fails outside an Ironveil project', async () => {
      await expect(planAdd({ root: workspace, feature: 'ci' })).rejects.toBeInstanceOf(
        ManifestError,
      );
    });
  });

  describe('a project the user has changed', () => {
    it('merges its own edits with the feature in a workflow it edited elsewhere', async () => {
      const root = await makeProject({ testing: false });
      const workflow = (await read(root, '.github/workflows/ci.yml')).replace(
        'branches: [main, master]\n  pull_request',
        'branches: [main, master, develop]\n  pull_request',
      );
      await write(root, '.github/workflows/ci.yml', workflow);

      await add(root, 'testing');

      const merged = await read(root, '.github/workflows/ci.yml');
      expect(merged).toContain('branches: [main, master, develop]');
      expect(merged).toContain('run: npm test');
    });

    it('aborts, listing the file, when both changed the same place, and writes nothing', async () => {
      const root = await makeProject({ testing: false });
      const workflow = (await read(root, '.github/workflows/ci.yml')).replace(
        '      - name: Run build',
        '      - name: Run my own step\n        run: echo mine\n      - name: Run build',
      );
      await write(root, '.github/workflows/ci.yml', workflow);
      const before = await readTree(root);

      const failure = planAdd({ root, feature: 'testing' });

      await expect(failure).rejects.toBeInstanceOf(AddError);
      await expect(failure).rejects.toThrow(/\.github\/workflows\/ci\.yml/);
      await expect(failure).rejects.toThrow(/conflict/i);
      expect(await readTree(root)).toEqual(before);
    });

    it('keeps the user-added dependencies and scripts in package.json', async () => {
      const root = await makeProject({ testing: false });
      const manifest = JSON.parse(await read(root, 'package.json')) as {
        dependencies: Record<string, string>;
        scripts: Record<string, string>;
      };
      manifest.dependencies.dayjs = '1.11.0';
      manifest.scripts.seed = 'ts-node prisma/seed.ts';
      await write(root, 'package.json', `${JSON.stringify(manifest, null, 2)}\n`);

      await add(root, 'testing');

      const merged = JSON.parse(await read(root, 'package.json')) as typeof manifest & {
        devDependencies: Record<string, string>;
      };
      expect(merged.dependencies.dayjs).toBe('1.11.0');
      expect(merged.scripts.seed).toBe('ts-node prisma/seed.ts');
      expect(merged.scripts.test).toBe('jest');
      expect(merged.devDependencies.jest).toBeDefined();
    });

    it('aborts when package.json already defines a different script of the same name', async () => {
      const root = await makeProject({ testing: false });
      const manifest = JSON.parse(await read(root, 'package.json')) as {
        scripts: Record<string, string>;
      };
      manifest.scripts.test = 'vitest';
      await write(root, 'package.json', `${JSON.stringify(manifest, null, 2)}\n`);

      const failure = planAdd({ root, feature: 'testing' });

      await expect(failure).rejects.toThrow(/package\.json/);
      await expect(failure).rejects.toThrow(/scripts\.test/);
    });

    it('never overwrites a file the feature would create when it already differs', async () => {
      const root = await makeProject({ testing: false });
      await write(root, 'jest.config.ts', '// my own jest config\n');

      const failure = planAdd({ root, feature: 'testing' });

      await expect(failure).rejects.toThrow(/jest\.config\.ts/);
      await expect(failure).rejects.toThrow(/never overwrites/i);
      expect(await read(root, 'jest.config.ts')).toBe('// my own jest config\n');
    });

    it('accepts a file the feature would create when it is already there, identical', async () => {
      const root = await makeProject({ testing: false });
      const reference = await makeProject({ projectName: 'shop-api', testing: true });
      await write(root, 'jest.config.ts', await read(reference, 'jest.config.ts'));

      const plan = await planAdd({ root, feature: 'testing' });

      expect(plan.changeSet.changes.map((change) => change.path)).not.toContain(
        'jest.config.ts',
      );
    });

    it('leaves README.md alone, with a note, instead of aborting when it cannot be merged', async () => {
      const root = await makeProject({ docker: false });
      await write(root, 'README.md', 'Completely my own readme.\n');

      const plan = await add(root, 'docker');

      expect(await read(root, 'README.md')).toBe('Completely my own readme.\n');
      expect(plan.notes.join('\n')).toMatch(/README\.md/);
      expect(await read(root, 'Dockerfile')).toContain('FROM');
    });

    it('skips, with a note, a file the user deleted', async () => {
      const root = await makeProject({ testing: false });
      await rm(path.join(root, '.github/workflows/ci.yml'));

      const plan = await add(root, 'testing');

      expect(plan.notes.join('\n')).toMatch(/\.github\/workflows\/ci\.yml.*(deleted|not found)/s);
      expect(await readFile(path.join(root, 'jest.config.ts'), 'utf8')).toContain('export');
    });

    it('keeps CRLF line endings in a file that uses them', async () => {
      const root = await makeProject({ testing: false });
      const workflow = (await read(root, '.github/workflows/ci.yml')).replace(/\n/g, '\r\n');
      await write(root, '.github/workflows/ci.yml', workflow);

      await add(root, 'testing');

      const merged = await read(root, '.github/workflows/ci.yml');
      expect(merged).toContain('run: npm test');
      expect(merged.replace(/\r\n/g, '')).not.toContain('\n');
    });

    it('keeps the resources recorded by generate resource', async () => {
      const root = await makeProject({ testing: false });
      const resource = await planResource({
        root,
        name: 'product',
        fields: parseFields('name:string'),
      });
      await resource.changeSet.apply();

      await add(root, 'testing');

      const manifest = await readManifest(root);
      expect(manifest.resources).toEqual({ product: {} });
      expect(manifest.features.testing).toBe(true);
      expect(await read(root, 'src/app.module.ts')).toContain('ProductsModule');
    });

    it('notes when the project was created by another Ironveil version', async () => {
      const root = await makeProject({ ci: false });
      const manifest = (await read(root, 'ironveil.json')).replace(
        `"ironveilVersion": "${IRONVEIL_VERSION}"`,
        '"ironveilVersion": "0.0.1"',
      );
      await write(root, 'ironveil.json', manifest);

      const plan = await planAdd({ root, feature: 'ci' });

      const notes = plan.notes.join('\n');
      expect(notes).toContain('0.0.1');
      expect(notes).toContain(IRONVEIL_VERSION);
    });

    it('has no notes for a project made by this version', async () => {
      const root = await makeProject({ ci: false });

      expect((await planAdd({ root, feature: 'ci' })).notes).toEqual([]);
    });
  });
});
