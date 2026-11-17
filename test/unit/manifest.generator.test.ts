import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveConfig } from '../../src/config/index.js';
import { generateProject } from '../../src/generators/generate-project.js';
import { ManifestGenerator } from '../../src/generators/features/manifest/manifest.generator.js';
import {
  MANIFEST_FILE_NAME,
  manifestToConfig,
  readManifest,
} from '../../src/manifest/index.js';
import { IRONVEIL_VERSION } from '../../src/version.js';

type Overrides = Parameters<typeof resolveConfig>[0];

describe('ManifestGenerator', () => {
  let dir: string;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  async function generate(overrides: Overrides = {}) {
    dir = await mkdtemp(path.join(os.tmpdir(), 'ironveil-manifest-gen-'));
    const config = resolveConfig({ projectName: 'test-api', ...overrides });
    const result = await generateProject(config, dir);
    return { config, ...result };
  }

  it('is named "manifest" and always runs, even with every feature off', () => {
    const generator = new ManifestGenerator();
    expect(generator.name).toBe('manifest');

    for (const overrides of [
      {},
      { ai: 'none' as const },
      {
        redis: false,
        swagger: false,
        docker: false,
        ci: false,
        testing: false,
        ai: 'none' as const,
      },
    ]) {
      expect(
        generator.shouldRun(resolveConfig({ projectName: 'a', ...overrides })),
      ).toBe(true);
    }
  });

  it('writes ironveil.json at the project root and reports it', async () => {
    const { destination, files } = await generate();

    expect(files).toContain(MANIFEST_FILE_NAME);
    const text = await readFile(
      path.join(destination, MANIFEST_FILE_NAME),
      'utf8',
    );
    expect(JSON.parse(text).projectName).toBe('test-api');
  });

  it('records the running Ironveil version', async () => {
    const { destination } = await generate();

    expect((await readManifest(destination)).ironveilVersion).toBe(
      IRONVEIL_VERSION,
    );
  });

  it.each([
    { auth: 'jwt' as const, redis: true, packageManager: 'pnpm' as const },
    { ai: 'none' as const, swagger: false, testing: false },
    { ai: 'all' as const, packageManager: 'yarn' as const, docker: false },
  ])('lets the config be rebuilt exactly from the generated project: %j', async (overrides) => {
    const { destination, config } = await generate(overrides);

    expect(manifestToConfig(await readManifest(destination))).toEqual(config);
  });

  it('does not list ironveil.json among the dependencies or scripts', async () => {
    const { destination } = await generate();
    const pkg = JSON.parse(
      await readFile(path.join(destination, 'package.json'), 'utf8'),
    );

    expect(JSON.stringify(pkg)).not.toContain(MANIFEST_FILE_NAME);
  });
});
