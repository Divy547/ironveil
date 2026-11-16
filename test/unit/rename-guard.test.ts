import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..');
const targets = ['src', 'test', 'scripts', 'README.md', 'CONTRIBUTING.md'];
const skippedDirs = new Set(['node_modules', 'dist', '.git']);

// Built from parts so this file does not match its own pattern.
const legacyName = new RegExp(['forge', '-?', 'kit'].join(''), 'i');

function collectFiles(path: string): string[] {
  let stats;
  try {
    stats = statSync(path);
  } catch {
    return [];
  }
  if (stats.isFile()) return [path];
  return readdirSync(path).flatMap((entry) =>
    skippedDirs.has(entry) ? [] : collectFiles(join(path, entry)),
  );
}

describe('rename guard', () => {
  it('leaves no references to the legacy project name', () => {
    const offenders = targets
      .flatMap((target) => collectFiles(join(root, target)))
      .filter((file) => legacyName.test(readFileSync(file, 'utf8')))
      .map((file) => relative(root, file));

    expect(offenders).toEqual([]);
  });
});
