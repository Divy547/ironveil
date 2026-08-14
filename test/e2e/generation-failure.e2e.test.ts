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

describe('ForgeKit Generation Failure E2E', () => {
  let temporaryDirectory: string;

  afterEach(async () => {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, {
        recursive: true,
        force: true,
      });
    }
  });

  it('preserves existing directory and rejects collision before staging', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'forgekit-e2e-failure-existing-'),
    );

    const destination = path.join(temporaryDirectory, 'existing-project');
    await mkdir(destination);
    const fs = createFileSystem();
    await fs.writeFile(path.join(destination, 'user-data.json'), '{"key":"value"}');

    const config = resolveConfig({
      projectName: 'existing-project',
    });

    await expect(
      generateProject(config, temporaryDirectory),
    ).rejects.toThrow(GenerationError);

    expect(await fs.exists(destination)).toBe(true);
    expect(
      await fs.readFile(path.join(destination, 'user-data.json')),
    ).toBe('{"key":"value"}');

    const entries = await readdir(temporaryDirectory);
    expect(entries).toEqual(['existing-project']);
  });

  it('leaves zero files at destination and removes staging on pipeline error', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'forgekit-e2e-failure-cleanup-'),
    );

    const destination = path.join(temporaryDirectory, 'broken-pipeline-app');
    const failingGenerator: Generator = {
      name: 'failing-test-generator',
      shouldRun: () => true,
      generate: async () => {
        throw new Error('Pipeline error during generation');
      },
    };

    const generatorsWithFailure = [...createGenerators(), failingGenerator];

    const config = resolveConfig({
      projectName: 'broken-pipeline-app',
    });

    try {
      await generateProject(config, temporaryDirectory, generatorsWithFailure);
      expect.unreachable('Should have failed');
    } catch (error) {
      expect(error).toBeInstanceOf(GenerationError);
      const genError = error as GenerationError;
      expect(genError.generatorName).toBe('failing-test-generator');
      expect(genError.projectName).toBe('broken-pipeline-app');

      const fs = createFileSystem();
      expect(await fs.exists(destination)).toBe(false);

      const entries = await readdir(temporaryDirectory);
      expect(entries.length).toBe(0);
    }
  });
});
