import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DirtyWorkingTreeError,
  assertSafeToModify,
  getGitStatus,
} from '../../src/safety/index.js';

function git(cwd: string, ...args: string[]): void {
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
    { cwd, stdio: 'ignore' },
  );
}

describe('git working tree guard', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'ironveil-git-state-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  async function initCommittedRepo(): Promise<void> {
    git(directory, 'init', '-q');
    await writeFile(path.join(directory, 'a.txt'), 'one\n');
    await writeFile(path.join(directory, '.gitignore'), 'ignored.log\n');
    git(directory, 'add', '-A');
    git(directory, 'commit', '-q', '-m', 'init');
  }

  describe('getGitStatus', () => {
    it('reports a directory outside any repository as not a repository', async () => {
      const status = await getGitStatus(directory);

      expect(status.isRepository).toBe(false);
      expect(status.isClean).toBe(true);
      expect(status.dirtyFiles).toEqual([]);
    });

    it('reports a committed repository as clean', async () => {
      await initCommittedRepo();

      const status = await getGitStatus(directory);

      expect(status).toEqual({
        isRepository: true,
        isClean: true,
        dirtyFiles: [],
      });
    });

    it('reports a modified tracked file as dirty', async () => {
      await initCommittedRepo();
      await writeFile(path.join(directory, 'a.txt'), 'two\n');

      const status = await getGitStatus(directory);

      expect(status.isClean).toBe(false);
      expect(status.dirtyFiles).toEqual(['a.txt']);
    });

    it('reports an untracked file as dirty', async () => {
      await initCommittedRepo();
      await writeFile(path.join(directory, 'new.txt'), 'x\n');

      const status = await getGitStatus(directory);

      expect(status.isClean).toBe(false);
      expect(status.dirtyFiles).toEqual(['new.txt']);
    });

    it('reports a staged new file as dirty', async () => {
      await initCommittedRepo();
      await writeFile(path.join(directory, 'staged.txt'), 'x\n');
      git(directory, 'add', 'staged.txt');

      const status = await getGitStatus(directory);

      expect(status.dirtyFiles).toEqual(['staged.txt']);
    });

    it('ignores files matched by .gitignore', async () => {
      await initCommittedRepo();
      await writeFile(path.join(directory, 'ignored.log'), 'noise\n');

      const status = await getGitStatus(directory);

      expect(status.isClean).toBe(true);
    });

    it('lists the new path of a renamed file', async () => {
      await initCommittedRepo();
      git(directory, 'mv', 'a.txt', 'b.txt');

      const status = await getGitStatus(directory);

      expect(status.dirtyFiles).toEqual(['b.txt']);
    });

    it('handles file names with spaces and non-ASCII characters', async () => {
      await initCommittedRepo();
      await writeFile(path.join(directory, 'my file é.txt'), 'x\n');

      const status = await getGitStatus(directory);

      expect(status.dirtyFiles).toEqual(['my file é.txt']);
    });

    it('only looks at the project directory when it is inside a larger repository', async () => {
      await initCommittedRepo();
      const project = path.join(directory, 'apps', 'api');
      await mkdir(project, { recursive: true });
      await writeFile(path.join(project, 'keep.txt'), 'x\n');
      git(directory, 'add', '-A');
      git(directory, 'commit', '-q', '-m', 'project');

      // Dirt outside the project does not matter...
      await writeFile(path.join(directory, 'a.txt'), 'changed\n');
      expect((await getGitStatus(project)).isClean).toBe(true);

      // ...dirt inside it does.
      await writeFile(path.join(project, 'keep.txt'), 'changed\n');
      const status = await getGitStatus(project);
      expect(status.isClean).toBe(false);
      expect(status.dirtyFiles).toEqual(['apps/api/keep.txt']);
    });
  });

  describe('assertSafeToModify', () => {
    it('passes outside a git repository', async () => {
      await expect(assertSafeToModify(directory)).resolves.toBeUndefined();
    });

    it('passes on a clean repository', async () => {
      await initCommittedRepo();

      await expect(assertSafeToModify(directory)).resolves.toBeUndefined();
    });

    it('refuses a dirty repository, naming the files and the --force escape hatch', async () => {
      await initCommittedRepo();
      await writeFile(path.join(directory, 'a.txt'), 'two\n');

      const error = await assertSafeToModify(directory).catch(
        (caught: unknown) => caught,
      );

      expect(error).toBeInstanceOf(DirtyWorkingTreeError);
      expect((error as Error).message).toContain('a.txt');
      expect((error as Error).message).toContain('--force');
      expect((error as Error).message).toMatch(/commit or stash/i);
    });

    it('lets --force through a dirty repository', async () => {
      await initCommittedRepo();
      await writeFile(path.join(directory, 'a.txt'), 'two\n');

      await expect(
        assertSafeToModify(directory, { force: true }),
      ).resolves.toBeUndefined();
    });

    it('truncates a long list of dirty files', async () => {
      await initCommittedRepo();
      for (let index = 0; index < 15; index += 1) {
        await writeFile(path.join(directory, `file-${index}.txt`), 'x\n');
      }

      const error = (await assertSafeToModify(directory).catch(
        (caught: unknown) => caught,
      )) as DirtyWorkingTreeError;

      expect(error.dirtyFiles).toHaveLength(15);
      expect(error.message).toContain('and 5 more');
      // git lists files alphabetically, so file-5 .. file-9 are the hidden ones.
      expect(error.message).toContain('file-4.txt');
      expect(error.message).not.toContain('file-5.txt');
      expect(error.message).not.toContain('file-9.txt');
    });
  });
});
