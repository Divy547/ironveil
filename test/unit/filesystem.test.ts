import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createFileSystem,
  type FileSystem,
} from '../../src/utils/filesystem.js';

describe('FileSystem', () => {
  let temporaryDirectory: string;
  let fs: FileSystem;

  afterEach(async () => {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, {
        recursive: true,
        force: true,
      });
    }
  });

  it('creates directories recursively', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'forgekit-fs-'),
    );

    const nestedDirectory = path.join(
      temporaryDirectory,
      'src',
      'infrastructure',
    );

    fs = createFileSystem();

    await fs.ensureDirectory(nestedDirectory);

    expect(
      await fs.exists(nestedDirectory),
    ).toBe(true);
  });

  it('writes and reads files', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'forgekit-fs-'),
    );

    const filePath = path.join(
      temporaryDirectory,
      'nested',
      'test.txt',
    );

    fs = createFileSystem();

    await fs.writeFile(
      filePath,
      'hello forgekit',
    );

    expect(await fs.exists(filePath)).toBe(true);
    expect(await fs.readFile(filePath)).toBe(
      'hello forgekit',
    );
  });
});