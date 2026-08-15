import { mkdtemp, rm, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { resolveConfig } from '../../src/config/index.js';
import { generateProject } from '../../src/generators/generate-project.js';
import { createFileSystem } from '../../src/utils/filesystem.js';
import { GenerationError } from '../../src/generators/core/generation-error.js';
import { createGenerators } from '../../src/generators/core/generator-registry.js';
import type { Generator } from '../../src/generators/core/generator.js';
import { PackageValidationError } from '../../src/validation/index.js';
import { createPackageManifest } from '../../src/utils/package-manifest.js';

describe('Generation Pipeline Validation Integration', () => {
  let temporaryDirectory: string;

  afterEach(async () => {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, {
        recursive: true,
        force: true,
      });
    }
  });

  it('valid project generation passes validation and creates destination', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'forgekit-val-success-'),
    );

    const config = resolveConfig({
      projectName: 'val-success-api',
    });

    const { destination } = await generateProject(
      config,
      temporaryDirectory,
    );

    const fs = createFileSystem();
    expect(await fs.exists(destination)).toBe(true);
    expect(await fs.exists(path.join(destination, 'package.json'))).toBe(true);

    const dirEntries = await readdir(temporaryDirectory);
    const stagingEntries = dirEntries.filter((entry) =>
      entry.startsWith('.val-success-api-staging-'),
    );
    expect(stagingEntries.length).toBe(0);
    expect(dirEntries).toEqual(['val-success-api']);
  });

  it('aborts generation, deletes staging, and leaves destination untouched on package validation failure', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'forgekit-val-fail-'),
    );

    const destination = path.join(temporaryDirectory, 'val-fail-api');

    // Rogue generator injecting unauthorized dependency
    const corruptingGenerator: Generator = {
      name: 'corrupting-generator',
      shouldRun: () => true,
      generate: async (context) => {
        const manifest = createPackageManifest(context.destination, context.fs);
        await manifest.addDependencies({
          ioredis: '5.6.0', // Leaked into non-redis project
        });
      },
    };

    const generatorsWithCorruption = [
      ...createGenerators(),
      corruptingGenerator,
    ];

    const config = resolveConfig({
      projectName: 'val-fail-api',
      redis: false,
    });

    try {
      await generateProject(
        config,
        temporaryDirectory,
        generatorsWithCorruption,
      );
      expect.unreachable('Should have thrown PackageValidationError');
    } catch (error) {
      expect(error).toBeInstanceOf(PackageValidationError);
      const valError = error as PackageValidationError;
      expect(valError.projectName).toBe('val-fail-api');
      expect(valError.generatorName).toBe('package-validator');
      expect(
        valError.issues.some((i) => i.code === 'FEATURE_DEPENDENCY_LEAKAGE'),
      ).toBe(true);

      const fs = createFileSystem();
      // Destination directory MUST NOT exist
      expect(await fs.exists(destination)).toBe(false);

      // No staging directory should remain in temporaryDirectory
      const dirEntries = await readdir(temporaryDirectory);
      expect(dirEntries.length).toBe(0);
    }
  });

  it('aborts generation and cleans up staging when package.json is malformed JSON', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'forgekit-val-json-fail-'),
    );

    const destination = path.join(temporaryDirectory, 'val-json-fail-api');

    const corruptJsonGenerator: Generator = {
      name: 'corrupt-json-generator',
      shouldRun: () => true,
      generate: async (context) => {
        await context.fs.writeFile(
          path.join(context.destination, 'package.json'),
          'MALFORMED_JSON_CONTENT {{{',
        );
      },
    };

    const generatorsWithCorruption = [
      ...createGenerators(),
      corruptJsonGenerator,
    ];

    const config = resolveConfig({
      projectName: 'val-json-fail-api',
    });

    try {
      await generateProject(
        config,
        temporaryDirectory,
        generatorsWithCorruption,
      );
      expect.unreachable('Should have thrown GenerationError');
    } catch (error) {
      expect(error).toBeInstanceOf(GenerationError);
      const genError = error as GenerationError;
      expect(genError.generatorName).toBe('package-validator');
      expect(genError.message).toContain('Failed to parse package.json');

      const fs = createFileSystem();
      expect(await fs.exists(destination)).toBe(false);

      const dirEntries = await readdir(temporaryDirectory);
      expect(dirEntries.length).toBe(0);
    }
  });

  it('aborts generation and cleans up staging when package.json is missing', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'forgekit-val-missing-fail-'),
    );

    const destination = path.join(temporaryDirectory, 'val-missing-fail-api');

    const deleteJsonGenerator: Generator = {
      name: 'delete-json-generator',
      shouldRun: () => true,
      generate: async (context) => {
        await context.fs.remove(
          path.join(context.destination, 'package.json'),
        );
      },
    };

    const generatorsWithCorruption = [
      ...createGenerators(),
      deleteJsonGenerator,
    ];

    const config = resolveConfig({
      projectName: 'val-missing-fail-api',
    });

    try {
      await generateProject(
        config,
        temporaryDirectory,
        generatorsWithCorruption,
      );
      expect.unreachable('Should have thrown GenerationError');
    } catch (error) {
      expect(error).toBeInstanceOf(GenerationError);
      const genError = error as GenerationError;
      expect(genError.generatorName).toBe('package-validator');
      expect(genError.message).toContain('Failed to read package.json');

      const fs = createFileSystem();
      expect(await fs.exists(destination)).toBe(false);

      const dirEntries = await readdir(temporaryDirectory);
      expect(dirEntries.length).toBe(0);
    }
  });

  it('runs validation during dryRun mode and catches violations', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'forgekit-val-dryrun-'),
    );

    const corruptingGenerator: Generator = {
      name: 'corrupting-generator',
      shouldRun: () => true,
      generate: async (context) => {
        const manifest = createPackageManifest(context.destination, context.fs);
        await manifest.addDependencies({
          ioredis: '5.6.0',
        });
      },
    };

    const generatorsWithCorruption = [
      ...createGenerators(),
      corruptingGenerator,
    ];

    const config = resolveConfig({
      projectName: 'val-dryrun-api',
      redis: false,
    });

    await expect(
      generateProject(config, temporaryDirectory, generatorsWithCorruption, {
        dryRun: true,
      }),
    ).rejects.toThrow(PackageValidationError);
  });
});
