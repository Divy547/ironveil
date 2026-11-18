import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MANIFEST_FILE_NAME,
  ManifestError,
  findProjectRoot,
} from '../../src/manifest/index.js';

describe('findProjectRoot', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'ironveil-root-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('returns the directory that holds ironveil.json', async () => {
    await writeFile(path.join(directory, MANIFEST_FILE_NAME), '{}');

    expect(await findProjectRoot(directory)).toBe(directory);
  });

  it('walks up from a nested directory to the project root', async () => {
    await writeFile(path.join(directory, MANIFEST_FILE_NAME), '{}');
    const nested = path.join(directory, 'src', 'modules', 'users');
    await mkdir(nested, { recursive: true });

    expect(await findProjectRoot(nested)).toBe(directory);
  });

  it('prefers the nearest manifest', async () => {
    await writeFile(path.join(directory, MANIFEST_FILE_NAME), '{}');
    const inner = path.join(directory, 'apps', 'api');
    await mkdir(inner, { recursive: true });
    await writeFile(path.join(inner, MANIFEST_FILE_NAME), '{}');

    expect(await findProjectRoot(path.join(inner, 'src'))).toBe(inner);
  });

  it('throws a ManifestError that says it is not an Ironveil project', async () => {
    const error = await findProjectRoot(directory).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(ManifestError);
    expect((error as Error).message).toMatch(/not (inside )?an Ironveil project/i);
    expect((error as Error).message).toContain(MANIFEST_FILE_NAME);
  });
});
