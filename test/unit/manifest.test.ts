import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveConfig } from '../../src/config/index.js';
import {
  MANIFEST_FILE_NAME,
  MANIFEST_VERSION,
  ManifestError,
  buildManifest,
  manifestToConfig,
  parseManifest,
  readManifest,
  serializeManifest,
} from '../../src/manifest/index.js';

type Overrides = Parameters<typeof resolveConfig>[0];

function config(overrides: Overrides = {}) {
  return resolveConfig({ projectName: 'test-api', ...overrides });
}

describe('manifest file name', () => {
  it('is ironveil.json', () => {
    expect(MANIFEST_FILE_NAME).toBe('ironveil.json');
  });
});

describe('buildManifest', () => {
  it('records the version, package manager and every enabled feature', () => {
    const manifest = buildManifest(
      config({ auth: 'jwt', redis: true, packageManager: 'pnpm' }),
      '1.2.3',
    );

    expect(manifest).toEqual({
      manifestVersion: MANIFEST_VERSION,
      ironveilVersion: '1.2.3',
      projectName: 'test-api',
      packageManager: 'pnpm',
      database: 'postgres',
      orm: 'prisma',
      features: {
        redis: true,
        auth: 'jwt',
        swagger: true,
        docker: true,
        ci: true,
        testing: true,
        ai: 'agents',
      },
    });
  });

  it('records disabled features explicitly instead of omitting them', () => {
    const manifest = buildManifest(
      config({
        swagger: false,
        docker: false,
        ci: false,
        testing: false,
        ai: 'none',
      }),
      '1.0.0',
    );

    expect(manifest.features).toEqual({
      redis: false,
      auth: 'none',
      swagger: false,
      docker: false,
      ci: false,
      testing: false,
      ai: 'none',
    });
  });
});

describe('serializeManifest', () => {
  it('is pretty printed JSON with a trailing newline', () => {
    const text = serializeManifest(buildManifest(config(), '1.0.0'));

    expect(text.endsWith('}\n')).toBe(true);
    expect(text).toContain('\n  "manifestVersion": 1,');
    expect(JSON.parse(text).projectName).toBe('test-api');
  });

  it('is deterministic for the same input', () => {
    const a = serializeManifest(buildManifest(config(), '1.0.0'));
    const b = serializeManifest(buildManifest(config(), '1.0.0'));
    expect(a).toBe(b);
  });

  it('lists the project identity before the feature flags', () => {
    const keys = Object.keys(
      JSON.parse(serializeManifest(buildManifest(config(), '1.0.0'))),
    );
    expect(keys).toEqual([
      'manifestVersion',
      'ironveilVersion',
      'projectName',
      'packageManager',
      'database',
      'orm',
      'features',
    ]);
  });
});

describe('round trip', () => {
  const cases: Overrides[] = [
    {},
    { auth: 'jwt' },
    { redis: true },
    { auth: 'jwt', redis: true, packageManager: 'yarn' },
    {
      swagger: false,
      docker: false,
      ci: false,
      testing: false,
      ai: 'none',
      packageManager: 'pnpm',
    },
    { ai: 'all' },
  ];

  it.each(cases)('parse(serialize(build(config))) gives back %j', (overrides) => {
    const original = config(overrides);
    const text = serializeManifest(buildManifest(original, '0.3.0'));
    const restored = manifestToConfig(parseManifest(text));

    expect(restored).toEqual(original);
  });

  it('returns a frozen config like resolveConfig does', () => {
    const restored = manifestToConfig(
      parseManifest(serializeManifest(buildManifest(config(), '0.3.0'))),
    );
    expect(Object.isFrozen(restored)).toBe(true);
  });
});

describe('parseManifest', () => {
  const valid = () =>
    JSON.parse(serializeManifest(buildManifest(config(), '0.3.0')));

  it('reports invalid JSON', () => {
    expect(() => parseManifest('{ nope')).toThrow(ManifestError);
    expect(() => parseManifest('{ nope')).toThrow(/not valid JSON/);
  });

  it('rejects a document that is not an object', () => {
    expect(() => parseManifest('[]')).toThrow(ManifestError);
  });

  it('names the offending field for a bad value', () => {
    const bad = valid();
    bad.features.auth = 'oauth';

    expect(() => parseManifest(JSON.stringify(bad))).toThrow(
      /features\.auth/,
    );
  });

  it('names a missing field', () => {
    const bad = valid();
    delete bad.packageManager;

    expect(() => parseManifest(JSON.stringify(bad))).toThrow(
      /packageManager/,
    );
  });

  it('refuses a manifest written by a newer Ironveil', () => {
    const future = valid();
    future.manifestVersion = MANIFEST_VERSION + 1;

    expect(() => parseManifest(JSON.stringify(future))).toThrow(
      /newer version of Ironveil/,
    );
  });

  it('refuses an invalid project name, like the config schema does', () => {
    const bad = valid();
    bad.projectName = 'Bad Name';

    expect(() => parseManifest(JSON.stringify(bad))).toThrow(/projectName/);
  });

  it('rejects an ironveilVersion that is empty', () => {
    const bad = valid();
    bad.ironveilVersion = '';

    expect(() => parseManifest(JSON.stringify(bad))).toThrow(
      /ironveilVersion/,
    );
  });

  it('ignores unknown extra keys so older CLIs can read newer additions', () => {
    const extra = valid();
    extra.somethingNew = true;

    expect(parseManifest(JSON.stringify(extra)).projectName).toBe('test-api');
  });
});

describe('readManifest', () => {
  let dir: string;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('reads and validates ironveil.json from a project directory', async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'ironveil-manifest-'));
    const manifest = buildManifest(config({ auth: 'jwt' }), '0.3.0');
    await writeFile(
      path.join(dir, MANIFEST_FILE_NAME),
      serializeManifest(manifest),
    );

    expect(await readManifest(dir)).toEqual(manifest);
  });

  it('says the directory is not an Ironveil project when the file is missing', async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'ironveil-manifest-'));

    const attempt = readManifest(dir);

    await expect(attempt).rejects.toThrow(ManifestError);
    await expect(attempt).rejects.toThrow(/not an Ironveil project/);
    await expect(attempt).rejects.toThrow(/ironveil\.json/);
  });

  it('includes the file path when the file is corrupt', async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'ironveil-manifest-'));
    await writeFile(path.join(dir, MANIFEST_FILE_NAME), '{ nope');

    await expect(readManifest(dir)).rejects.toThrow(
      path.join(dir, MANIFEST_FILE_NAME),
    );
  });
});
