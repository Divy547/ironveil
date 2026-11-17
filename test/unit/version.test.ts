import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCli } from '../../src/cli/index.js';
import { IRONVEIL_VERSION, readPackageVersion } from '../../src/version.js';

describe('IRONVEIL_VERSION', () => {
  it('is the version in package.json, the single source of truth', async () => {
    const pkg = JSON.parse(
      await readFile(path.join(process.cwd(), 'package.json'), 'utf8'),
    ) as { version: string };

    expect(IRONVEIL_VERSION).toBe(pkg.version);
  });

  it('looks like a semantic version', () => {
    expect(IRONVEIL_VERSION).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/);
  });

  it('is what the CLI reports', () => {
    expect(createCli().version()).toBe(IRONVEIL_VERSION);
  });
});

describe('readPackageVersion', () => {
  let dir: string;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  async function layout(nested: string, pkg: unknown) {
    dir = await mkdtemp(path.join(os.tmpdir(), 'ironveil-version-'));
    await writeFile(path.join(dir, 'package.json'), JSON.stringify(pkg));
    const start = path.join(dir, nested);
    await mkdir(start, { recursive: true });
    return start;
  }

  it.each(['src', 'dist/src', 'dist/deeper/still'])(
    'finds the package.json above %s (source and built layouts)',
    async (nested) => {
      const start = await layout(nested, { name: 'ironveil', version: '9.8.7' });

      expect(readPackageVersion(start)).toBe('9.8.7');
    },
  );

  it('skips a nested package.json that is not ironveil', async () => {
    const start = await layout('dist/src', { name: 'ironveil', version: '1.0.0' });
    await writeFile(
      path.join(dir, 'dist', 'package.json'),
      JSON.stringify({ name: 'something-else', version: '5.5.5' }),
    );

    expect(readPackageVersion(start)).toBe('1.0.0');
  });

  it('throws a clear error when no ironveil package.json exists above', async () => {
    const start = await layout('src', { name: 'other', version: '1.0.0' });

    expect(() => readPackageVersion(start)).toThrow(/Could not find Ironveil's package\.json/);
  });
});
