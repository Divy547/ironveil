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
  recordResourceInManifest,
  serializeManifest,
  setFeatureInManifest,
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
        queue: false,
        mail: false,
        otel: false,
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
      queue: false,
      mail: false,
      otel: false,
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
    { redis: true, queue: true },
    { mail: true },
    { otel: true },
    { auth: 'jwt', redis: true, queue: true, mail: true, otel: true },
    { auth: 'jwt', redis: true, queue: true, mail: true },
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

describe('resources in the manifest', () => {
  const base = () => serializeManifest(buildManifest(config({ auth: 'jwt' }), '1.0.0'));

  it('is optional: a manifest without resources stays valid and has none', () => {
    expect(parseManifest(base()).resources).toBeUndefined();
  });

  it('records a resource and its auth policy', () => {
    const text = recordResourceInManifest(base(), 'product', { auth: 'admin-writes' });

    expect(parseManifest(text).resources).toEqual({
      product: { auth: 'admin-writes' },
    });
  });

  it('adds resources side by side and replaces a resource of the same name', () => {
    let text = recordResourceInManifest(base(), 'product', { auth: 'user' });
    text = recordResourceInManifest(text, 'blog-post', { auth: 'admin' });
    text = recordResourceInManifest(text, 'product', { auth: 'public-read' });

    expect(parseManifest(text).resources).toEqual({
      product: { auth: 'public-read' },
      'blog-post': { auth: 'admin' },
    });
  });

  it('keeps the existing layout and unknown keys, and ends with a newline', () => {
    const original = JSON.parse(base()) as Record<string, unknown>;
    original.somethingNew = { keep: true };
    const text = recordResourceInManifest(JSON.stringify(original), 'product', {});

    const parsed = JSON.parse(text) as Record<string, unknown>;
    expect(parsed.somethingNew).toEqual({ keep: true });
    expect(parsed.projectName).toBe('test-api');
    expect(text.endsWith('\n')).toBe(true);
    expect(Object.keys(parsed).at(-1)).toBe('resources');
  });

  it('rejects an unknown auth policy', () => {
    const text = JSON.stringify({
      ...JSON.parse(base()),
      resources: { product: { auth: 'everyone' } },
    });

    expect(() => parseManifest(text)).toThrow(/resources\.product\.auth/);
  });

  it('refuses to edit a manifest that is not valid', () => {
    expect(() => recordResourceInManifest('{', 'product', {})).toThrow(ManifestError);
  });
});

describe('setFeatureInManifest', () => {
  const text = serializeManifest(buildManifest(config({ ci: false, ai: 'none' }), '1.2.3'));

  it('flips one feature and leaves every other byte alone', () => {
    const result = setFeatureInManifest(text, 'ci', true);

    expect(result).toBe(text.replace('"ci": false', '"ci": true'));
  });

  it('sets the ai mode', () => {
    expect(parseManifest(setFeatureInManifest(text, 'ai', 'all')).features.ai).toBe('all');
  });

  it('keeps the recorded resources and keys from a newer Ironveil', () => {
    const raw = JSON.parse(text) as Record<string, unknown>;
    raw.resources = { product: { auth: 'admin' } };
    raw.somethingNew = { keep: true };

    const result = JSON.parse(
      setFeatureInManifest(`${JSON.stringify(raw, null, 2)}\n`, 'docker', false),
    ) as Record<string, unknown>;

    expect(result.resources).toEqual({ product: { auth: 'admin' } });
    expect(result.somethingNew).toEqual({ keep: true });
    expect((result.features as Record<string, unknown>).docker).toBe(false);
  });

  it('does not touch ironveilVersion: it records what created the project', () => {
    expect(parseManifest(setFeatureInManifest(text, 'ci', true)).ironveilVersion).toBe('1.2.3');
  });

  it('refuses a value the manifest would reject', () => {
    expect(() => setFeatureInManifest(text, 'ai', 'everything')).toThrow(ManifestError);
    expect(() => setFeatureInManifest(text, 'ci', 'yes')).toThrow(ManifestError);
  });

  it('refuses a feature that does not exist', () => {
    expect(() => setFeatureInManifest(text, 'banana' as never, true)).toThrow(ManifestError);
  });

  it('can set a feature the manifest predates, such as queue in a v0.3.0 manifest', () => {
    const old = JSON.parse(text) as { features: Record<string, unknown> };
    delete old.features.queue;
    const oldText = `${JSON.stringify(old, null, 2)}\n`;

    const result = setFeatureInManifest(oldText, 'queue', true);

    expect(parseManifest(result).features.queue).toBe(true);
  });
});

describe('a manifest written before otel existed', () => {
  const old = () => {
    const raw = JSON.parse(
      serializeManifest(buildManifest(config({ redis: true, mail: true }), '0.3.0')),
    ) as { features: Record<string, unknown> };
    delete raw.features.otel;
    return JSON.stringify(raw);
  };

  it('still parses, with otel off', () => {
    expect(parseManifest(old()).features.otel).toBe(false);
  });

  it('gives back a config with otel off', () => {
    expect(manifestToConfig(parseManifest(old())).otel).toBe(false);
  });

  it('can have otel switched on, without needing Redis', () => {
    expect(parseManifest(setFeatureInManifest(old(), 'otel', true)).features.otel).toBe(true);
  });

  it('records otel in a new manifest', () => {
    expect(buildManifest(config({ otel: true }), '0.3.0').features.otel).toBe(true);
  });
});

describe('a manifest written before mail existed', () => {
  const old = () => {
    const raw = JSON.parse(
      serializeManifest(buildManifest(config({ redis: true, queue: true }), '0.3.0')),
    ) as { features: Record<string, unknown> };
    delete raw.features.mail;
    return JSON.stringify(raw);
  };

  it('still parses, with mail off', () => {
    expect(parseManifest(old()).features.mail).toBe(false);
  });

  it('gives back a config with mail off', () => {
    expect(manifestToConfig(parseManifest(old())).mail).toBe(false);
  });

  it('can have mail switched on, without needing Redis', () => {
    expect(parseManifest(setFeatureInManifest(old(), 'mail', true)).features.mail).toBe(true);
  });
});

describe('a manifest written before the queue existed', () => {
  const old = () => {
    const raw = JSON.parse(
      serializeManifest(buildManifest(config({ redis: true }), '0.3.0')),
    ) as { features: Record<string, unknown> };
    delete raw.features.queue;
    return JSON.stringify(raw);
  };

  it('still parses, with the queue off', () => {
    expect(parseManifest(old()).features.queue).toBe(false);
  });

  it('gives back a config with the queue off', () => {
    expect(manifestToConfig(parseManifest(old())).queue).toBe(false);
  });

  it('refuses a manifest that turns the queue on without Redis', () => {
    const bad = JSON.parse(old()) as { features: Record<string, unknown> };
    bad.features.redis = false;
    bad.features.queue = true;

    expect(() => manifestToConfig(parseManifest(JSON.stringify(bad)))).toThrow(
      ManifestError,
    );
  });
});
