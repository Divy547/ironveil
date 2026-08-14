import { mkdtemp, rm, readdir, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { resolveConfig } from '../../src/config/index.js';
import { generateProject } from '../../src/generators/generate-project.js';
import { createFileSystem } from '../../src/utils/filesystem.js';
import { GenerationError } from '../../src/generators/core/generation-error.js';
import { createGenerators } from '../../src/generators/core/generator-registry.js';
import type { Generator } from '../../src/generators/core/generator.js';

describe('Generation Safety / Staging Lifecycle', () => {
  let temporaryDirectory: string;

  afterEach(async () => {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, {
        recursive: true,
        force: true,
      });
    }
  });

  it('successful generation moves staging to destination and removes staging directory', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'forgekit-safety-success-'),
    );

    const config = resolveConfig({
      projectName: 'safe-api',
    });

    const destination = await generateProject(
      config,
      temporaryDirectory,
    );

    const fs = createFileSystem();
    expect(await fs.exists(destination)).toBe(true);
    expect(await fs.exists(path.join(destination, 'package.json'))).toBe(true);

    // Verify no staging directories remain in the parent directory
    const dirEntries = await readdir(temporaryDirectory);
    const stagingEntries = dirEntries.filter((entry) =>
      entry.startsWith('.safe-api-staging-'),
    );
    expect(stagingEntries.length).toBe(0);
    expect(dirEntries).toEqual(['safe-api']);
  });

  it('rejects existing destination without creating staging directory', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'forgekit-safety-existing-'),
    );

    const destination = path.join(temporaryDirectory, 'existing-api');
    await mkdir(destination);
    const fs = createFileSystem();
    await fs.writeFile(path.join(destination, 'important-user-file.txt'), 'do not delete');

    const config = resolveConfig({
      projectName: 'existing-api',
    });

    await expect(
      generateProject(config, temporaryDirectory),
    ).rejects.toThrow(GenerationError);

    // Destination remains untouched
    expect(await fs.exists(destination)).toBe(true);
    expect(
      await fs.readFile(path.join(destination, 'important-user-file.txt')),
    ).toBe('do not delete');

    // No staging directory was created
    const dirEntries = await readdir(temporaryDirectory);
    expect(dirEntries).toEqual(['existing-api']);
  });

  it('cleans up staging directory on generator failure and leaves destination untouched', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'forgekit-safety-fail-'),
    );

    const destination = path.join(temporaryDirectory, 'failing-api');
    const originalError = new Error('Simulated generator explosion');

    const failingGenerator: Generator = {
      name: 'simulated-failing-generator',
      shouldRun: () => true,
      generate: async () => {
        throw originalError;
      },
    };

    const generatorsWithFailure = [...createGenerators(), failingGenerator];

    const config = resolveConfig({
      projectName: 'failing-api',
    });

    try {
      await generateProject(config, temporaryDirectory, generatorsWithFailure);
      expect.unreachable('Should have thrown GenerationError');
    } catch (error) {
      expect(error).toBeInstanceOf(GenerationError);
      const genError = error as GenerationError;
      expect(genError.generatorName).toBe('simulated-failing-generator');
      expect(genError.projectName).toBe('failing-api');
      expect(genError.cause).toBe(originalError);

      const fs = createFileSystem();

      // Destination directory MUST NOT exist
      expect(await fs.exists(destination)).toBe(false);

      // No staging directory should remain
      const dirEntries = await readdir(temporaryDirectory);
      const stagingEntries = dirEntries.filter((entry) =>
        entry.startsWith('.failing-api-staging-'),
      );
      expect(stagingEntries.length).toBe(0);
      expect(dirEntries.length).toBe(0);
    }
  });

  it('allows immediate retry after a generation failure', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'forgekit-safety-retry-'),
    );

    const failingGenerator: Generator = {
      name: 'intermittent-failing-generator',
      shouldRun: () => true,
      generate: async () => {
        throw new Error('Temporary glitch');
      },
    };

    const generatorsWithFailure = [...createGenerators(), failingGenerator];

    const config = resolveConfig({
      projectName: 'retry-api',
    });

    // First attempt fails
    await expect(
      generateProject(config, temporaryDirectory, generatorsWithFailure),
    ).rejects.toThrow(GenerationError);

    const fs = createFileSystem();
    const destination = path.join(temporaryDirectory, 'retry-api');
    expect(await fs.exists(destination)).toBe(false);

    // Second attempt (retry with normal generators) succeeds cleanly
    const successDestination = await generateProject(
      config,
      temporaryDirectory,
    );

    expect(successDestination).toBe(destination);
    expect(await fs.exists(destination)).toBe(true);
    expect(await fs.exists(path.join(destination, 'package.json'))).toBe(true);
  });
});
