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

  it('removes directories and files recursively and handles missing paths safely', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'forgekit-fs-'),
    );

    const dirPath = path.join(temporaryDirectory, 'to-delete');
    const filePath = path.join(dirPath, 'file.txt');

    fs = createFileSystem();
    await fs.writeFile(filePath, 'delete me');

    expect(await fs.exists(dirPath)).toBe(true);
    await fs.remove(dirPath);
    expect(await fs.exists(dirPath)).toBe(false);

    // Safely removes non-existent path without throwing
    await expect(
      fs.remove(path.join(temporaryDirectory, 'non-existent')),
    ).resolves.toBeUndefined();
  });

  it('moves directories from source to destination successfully', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'forgekit-fs-'),
    );

    const sourceDir = path.join(temporaryDirectory, 'source');
    const destDir = path.join(temporaryDirectory, 'destination');
    const filePath = path.join(sourceDir, 'nested', 'app.ts');

    fs = createFileSystem();
    await fs.writeFile(filePath, 'console.log("moved");');

    await fs.move(sourceDir, destDir);

    expect(await fs.exists(sourceDir)).toBe(false);
    expect(await fs.exists(destDir)).toBe(true);
    expect(await fs.exists(path.join(destDir, 'nested', 'app.ts'))).toBe(true);
    expect(
      await fs.readFile(path.join(destDir, 'nested', 'app.ts')),
    ).toBe('console.log("moved");');
  });
});