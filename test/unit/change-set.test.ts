import { execFileSync } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditError, addModuleImport } from '../../src/editing/index.js';
import {
  DirtyWorkingTreeError,
  SafetyError,
  applyChanges,
  createChangeSet,
} from '../../src/safety/index.js';

describe('ChangeSet', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'ironveil-change-set-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const read = (relative: string) => readFile(path.join(root, relative), 'utf8');

  describe('planning', () => {
    it('plans a new file without touching the disk', async () => {
      const changes = createChangeSet(root);

      await changes.write('src/new.ts', 'export {};\n');

      expect(changes.changes).toEqual([
        { path: 'src/new.ts', kind: 'create', before: null, after: 'export {};\n' },
      ]);
      expect(await readdir(root)).toEqual([]);
    });

    it('plans a modification of an existing file', async () => {
      await writeFile(path.join(root, 'a.txt'), 'old\n');
      const changes = createChangeSet(root);

      await changes.write('a.txt', 'new\n');

      expect(changes.changes).toEqual([
        { path: 'a.txt', kind: 'modify', before: 'old\n', after: 'new\n' },
      ]);
      expect(await read('a.txt')).toBe('old\n');
    });

    it('records nothing when the content is identical, so re-running is a no-op', async () => {
      await writeFile(path.join(root, 'a.txt'), 'same\n');
      const changes = createChangeSet(root);

      await changes.write('a.txt', 'same\n');

      expect(changes.isEmpty).toBe(true);
      expect(changes.changes).toEqual([]);
    });

    it('keeps one change per file; the last write wins but "before" stays the disk content', async () => {
      await writeFile(path.join(root, 'a.txt'), 'disk\n');
      const changes = createChangeSet(root);

      await changes.write('a.txt', 'first\n');
      await changes.write('a.txt', 'second\n');

      expect(changes.changes).toEqual([
        { path: 'a.txt', kind: 'modify', before: 'disk\n', after: 'second\n' },
      ]);
    });

    it('drops a planned change when a later write puts the file back as it was', async () => {
      await writeFile(path.join(root, 'a.txt'), 'disk\n');
      const changes = createChangeSet(root);

      await changes.write('a.txt', 'other\n');
      await changes.write('a.txt', 'disk\n');

      expect(changes.isEmpty).toBe(true);
    });

    it('normalises paths to forward slashes and relative form', async () => {
      const changes = createChangeSet(root);

      await changes.write('./src//deep/file.ts', 'x\n');

      expect(changes.changes[0]?.path).toBe('src/deep/file.ts');
    });

    it.each(['../outside.txt', 'a/../../outside.txt', '/etc/passwd', ''])(
      'refuses the path %j, which is not inside the project',
      async (unsafe) => {
        const changes = createChangeSet(root);

        await expect(changes.write(unsafe, 'x')).rejects.toBeInstanceOf(
          SafetyError,
        );
      },
    );
  });

  describe('edit', () => {
    it('transforms the current file content', async () => {
      await writeFile(path.join(root, 'a.txt'), 'hello\n');
      const changes = createChangeSet(root);

      await changes.edit('a.txt', (text) => text.toUpperCase());

      expect(changes.changes[0]?.after).toBe('HELLO\n');
    });

    it('reads through earlier planned edits, so several editors compose', async () => {
      await writeFile(path.join(root, 'a.txt'), 'a\n');
      const changes = createChangeSet(root);

      await changes.edit('a.txt', (text) => `${text}b\n`);
      await changes.edit('a.txt', (text) => `${text}c\n`);

      expect(changes.changes).toEqual([
        { path: 'a.txt', kind: 'modify', before: 'a\n', after: 'a\nb\nc\n' },
      ]);
    });

    it('can edit a file that is only planned, not yet on disk', async () => {
      const changes = createChangeSet(root);

      await changes.write('new.txt', 'a\n');
      await changes.edit('new.txt', (text) => `${text}b\n`);

      expect(changes.changes).toEqual([
        { path: 'new.txt', kind: 'create', before: null, after: 'a\nb\n' },
      ]);
    });

    it('throws an EditError when the file does not exist', async () => {
      const changes = createChangeSet(root);

      await expect(
        changes.edit('missing.txt', (text) => text),
      ).rejects.toBeInstanceOf(EditError);
      await expect(
        changes.edit('missing.txt', (text) => text),
      ).rejects.toThrow('missing.txt');
    });

    it('lets the editors from the editing layer plug straight in (and stay idempotent)', async () => {
      await mkdir(path.join(root, 'src'));
      await writeFile(
        path.join(root, 'src/app.module.ts'),
        "import { Module } from '@nestjs/common';\n\n@Module({\n  imports: [],\n})\nexport class AppModule {}\n",
      );
      const apply = (changes: ReturnType<typeof createChangeSet>) =>
        changes.edit('src/app.module.ts', (text) =>
          addModuleImport(text, {
            moduleName: 'CatsModule',
            importPath: './cats/cats.module',
          }),
        );

      const first = createChangeSet(root);
      await apply(first);
      expect(first.changes[0]?.after).toContain('CatsModule');

      await applyChanges(first, { force: true });

      const second = createChangeSet(root);
      await apply(second);
      expect(second.isEmpty).toBe(true);
    });
  });

  describe('renderDiff', () => {
    it('is empty when there is nothing to change', () => {
      expect(createChangeSet(root).renderDiff()).toBe('');
    });

    it('shows every planned file as a unified diff', async () => {
      await writeFile(path.join(root, 'a.txt'), 'old\n');
      const changes = createChangeSet(root);
      await changes.write('a.txt', 'new\n');
      await changes.write('b.txt', 'brand new\n');

      const diff = changes.renderDiff();

      expect(diff).toContain('--- a/a.txt\n+++ b/a.txt');
      expect(diff).toContain('-old\n+new\n');
      expect(diff).toContain('--- /dev/null\n+++ b/b.txt');
      expect(diff).toContain('+brand new\n');
    });
  });

  describe('apply', () => {
    it('writes created and modified files, creating directories as needed', async () => {
      await writeFile(path.join(root, 'a.txt'), 'old\n');
      const changes = createChangeSet(root);
      await changes.write('a.txt', 'new\n');
      await changes.write('src/deep/b.ts', 'export {};\n');

      const written = await changes.apply();

      expect(written).toEqual(['a.txt', 'src/deep/b.ts']);
      expect(await read('a.txt')).toBe('new\n');
      expect(await read('src/deep/b.ts')).toBe('export {};\n');
    });

    it('writes nothing for an empty change set', async () => {
      const written = await createChangeSet(root).apply();

      expect(written).toEqual([]);
      expect(await readdir(root)).toEqual([]);
    });

    it('rolls every file back when one write fails', async () => {
      await writeFile(path.join(root, 'a.txt'), 'original\n');
      await writeFile(path.join(root, 'blocker'), 'i am a file\n');
      const changes = createChangeSet(root);
      await changes.write('a.txt', 'changed\n');
      await changes.write('created.txt', 'new\n');
      // "blocker" is a file, so a path below it can never be written.
      await changes.write('blocker/child.txt', 'x\n');

      await expect(changes.apply()).rejects.toThrow();

      expect(await read('a.txt')).toBe('original\n');
      expect(await readdir(root)).toEqual(['a.txt', 'blocker']);
    });
  });
});

describe('applyChanges', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'ironveil-apply-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function git(...args: string[]): void {
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test@example.com',
        '-c',
        'commit.gpgsign=false',
        ...args,
      ],
      { cwd: root, stdio: 'ignore' },
    );
  }

  async function makeDirtyRepo(): Promise<void> {
    git('init', '-q');
    await writeFile(path.join(root, 'tracked.txt'), 'one\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'init');
    await writeFile(path.join(root, 'tracked.txt'), 'edited by the user\n');
  }

  async function plan() {
    const changes = createChangeSet(root);
    await changes.write('added.txt', 'hello\n');
    return changes;
  }

  it('writes the files in a non-git directory', async () => {
    const result = await applyChanges(await plan());

    expect(result).toMatchObject({ applied: true, dryRun: false, files: ['added.txt'] });
    expect(await readFile(path.join(root, 'added.txt'), 'utf8')).toBe('hello\n');
  });

  it('writes the files on a clean git tree', async () => {
    git('init', '-q');
    await writeFile(path.join(root, 'tracked.txt'), 'one\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'init');

    const result = await applyChanges(await plan());

    expect(result.applied).toBe(true);
  });

  it('refuses a dirty tree and writes nothing', async () => {
    await makeDirtyRepo();

    await expect(applyChanges(await plan())).rejects.toBeInstanceOf(
      DirtyWorkingTreeError,
    );
    expect(
      await readFile(path.join(root, 'tracked.txt'), 'utf8'),
    ).toBe('edited by the user\n');
    await expect(readFile(path.join(root, 'added.txt'))).rejects.toThrow();
  });

  it('writes on a dirty tree when force is set', async () => {
    await makeDirtyRepo();

    const result = await applyChanges(await plan(), { force: true });

    expect(result.applied).toBe(true);
    expect(await readFile(path.join(root, 'added.txt'), 'utf8')).toBe('hello\n');
  });

  it('with dryRun returns the diff and writes nothing', async () => {
    const result = await applyChanges(await plan(), { dryRun: true });

    expect(result.applied).toBe(false);
    expect(result.dryRun).toBe(true);
    expect(result.files).toEqual(['added.txt']);
    expect(result.diff).toContain('+++ b/added.txt');
    expect(result.diff).toContain('+hello');
    await expect(readFile(path.join(root, 'added.txt'))).rejects.toThrow();
  });

  it('with dryRun does not need a clean tree, because nothing is written', async () => {
    await makeDirtyRepo();

    const result = await applyChanges(await plan(), { dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.diff).toContain('+hello');
  });

  it('reports an empty change set as nothing to do, even on a dirty tree', async () => {
    await makeDirtyRepo();

    const result = await applyChanges(createChangeSet(root));

    expect(result).toEqual({ applied: false, dryRun: false, files: [], diff: '' });
  });
});
