import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { unifiedDiff } from '../../src/safety/index.js';

const lines = (count: number, prefix = 'line'): string =>
  Array.from({ length: count }, (_, index) => `${prefix} ${index + 1}\n`).join(
    '',
  );

describe('unifiedDiff', () => {
  it('returns an empty string when nothing changed', () => {
    expect(unifiedDiff('a.txt', 'same\n', 'same\n')).toBe('');
  });

  it('renders a single changed line with surrounding context', () => {
    const diff = unifiedDiff(
      'a.txt',
      'one\ntwo\nthree\nfour\nfive\n',
      'one\ntwo\nTHREE\nfour\nfive\n',
    );

    expect(diff).toBe(
      [
        '--- a/a.txt',
        '+++ b/a.txt',
        '@@ -1,5 +1,5 @@',
        ' one',
        ' two',
        '-three',
        '+THREE',
        ' four',
        ' five',
        '',
      ].join('\n'),
    );
  });

  it('renders a new file against /dev/null', () => {
    const diff = unifiedDiff('src/new.ts', null, 'a\nb\n');

    expect(diff).toBe(
      [
        '--- /dev/null',
        '+++ b/src/new.ts',
        '@@ -0,0 +1,2 @@',
        '+a',
        '+b',
        '',
      ].join('\n'),
    );
  });

  it('marks a missing trailing newline like git does', () => {
    const diff = unifiedDiff('a.txt', 'one\ntwo', 'one\ntwo\n');

    expect(diff).toContain('-two\n\\ No newline at end of file\n+two\n');
  });

  it('keeps changes that are far apart in separate hunks', () => {
    const before = lines(40);
    const after = before
      .replace('line 3\n', 'CHANGED 3\n')
      .replace('line 38\n', 'CHANGED 38\n');

    const diff = unifiedDiff('a.txt', before, after);

    expect(diff.match(/^@@ /gm)).toHaveLength(2);
  });

  it('merges changes that are close together into one hunk', () => {
    const before = lines(20);
    const after = before
      .replace('line 8\n', 'CHANGED 8\n')
      .replace('line 11\n', 'CHANGED 11\n');

    const diff = unifiedDiff('a.txt', before, after);

    expect(diff.match(/^@@ /gm)).toHaveLength(1);
  });

  it('uses three lines of context', () => {
    const diff = unifiedDiff(
      'a.txt',
      lines(20),
      lines(20).replace('line 10\n', 'CHANGED\n'),
    );

    expect(diff).toContain('@@ -7,7 +7,7 @@');
    expect(diff).not.toContain(' line 6\n');
    expect(diff).not.toContain(' line 14\n');
  });

  it('counts a pure insertion with an empty old range correctly', () => {
    const diff = unifiedDiff('a.txt', '', 'only\n');

    expect(diff).toContain('@@ -0,0 +1 @@');
    expect(diff).toContain('+only\n');
  });

  it('keeps CRLF line endings intact in the output', () => {
    const diff = unifiedDiff('a.txt', 'a\r\nb\r\n', 'a\r\nB\r\n');

    expect(diff).toContain('-b\r\n');
    expect(diff).toContain('+B\r\n');
  });

  describe('is a valid patch (verified with `git apply`)', () => {
    let directory: string;

    beforeEach(async () => {
      directory = await mkdtemp(path.join(os.tmpdir(), 'ironveil-diff-'));
    });

    afterEach(async () => {
      await rm(directory, { recursive: true, force: true });
    });

    const cases: Array<[string, string | null, string]> = [
      ['one line changed', lines(10), lines(10).replace('line 5', 'five')],
      ['lines inserted in the middle', lines(10), `${lines(5)}new\nnew2\n${lines(5, 'tail')}`],
      ['lines removed', lines(12), lines(3) + lines(3, 'later')],
      ['everything replaced', lines(6), lines(4, 'other')],
      ['appended at the end', lines(8), `${lines(8)}extra\n`],
      ['prepended at the start', lines(8), `first\n${lines(8)}`],
      ['trailing newline added', 'a\nb', 'a\nb\n'],
      ['trailing newline removed', 'a\nb\n', 'a\nb'],
      ['two distant edits', lines(60), lines(60).replace('line 4\n', 'x\n').replace('line 55\n', 'y\n')],
      ['empty to content', '', lines(3)],
      ['a new file', null, lines(4)],
    ];

    it.each(cases)('%s', async (_name, before, after) => {
      const target = path.join(directory, 'file.txt');
      if (before !== null) {
        await writeFile(target, before);
      }
      const patchPath = path.join(directory, 'change.patch');
      await writeFile(patchPath, unifiedDiff('file.txt', before, after));

      execFileSync('git', ['apply', '--unsafe-paths', 'change.patch'], {
        cwd: directory,
      });

      expect(await readFile(target, 'utf8')).toBe(after);
    });
  });
});
