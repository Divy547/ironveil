import {
  mkdtemp,
  rm,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  afterEach,
  describe,
  expect,
  it,
} from 'vitest';
import {
  createPackageManifest,
} from '../../src/utils/package-manifest.js';
import {
  createFileSystem,
} from '../../src/utils/filesystem.js';

describe('PackageManifest', () => {
  let temporaryDirectory: string;

  afterEach(async () => {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, {
        recursive: true,
        force: true,
      });
    }
  });

  async function createManifest() {
    temporaryDirectory = await mkdtemp(
      path.join(
        os.tmpdir(),
        'forgekit-package-',
      ),
    );

    const fs = createFileSystem();

    await fs.writeFile(
      path.join(
        temporaryDirectory,
        'package.json',
      ),
      JSON.stringify({
        name: 'test-api',
        version: '0.1.0',
        scripts: {
          build: 'nest build',
        },
        dependencies: {
          '@nestjs/common': '^11.0.0',
        },
      }),
    );

    return {
      fs,
      manifest: createPackageManifest(
        temporaryDirectory,
        fs,
      ),
    };
  }

  it('reads package.json', async () => {
    const { manifest } =
      await createManifest();

    const packageJson =
      await manifest.read();

    expect(packageJson.name).toBe(
      'test-api',
    );
  });

  it('adds dependencies', async () => {
    const { manifest } =
      await createManifest();

    await manifest.addDependencies({
      '@prisma/client': '^6.0.0',
    });

    const packageJson =
      await manifest.read();

    expect(
      packageJson.dependencies?.[
        '@nestjs/common'
      ],
    ).toBe('^11.0.0');

    expect(
      packageJson.dependencies?.[
        '@prisma/client'
      ],
    ).toBe('^6.0.0');
  });

  it('adds dev dependencies', async () => {
    const { manifest } =
      await createManifest();

    await manifest.addDevDependencies({
      prisma: '^6.0.0',
    });

    const packageJson =
      await manifest.read();

    expect(
      packageJson.devDependencies?.prisma,
    ).toBe('^6.0.0');
  });

  it('adds scripts', async () => {
    const { manifest } =
      await createManifest();

    await manifest.addScripts({
      'db:generate': 'prisma generate',
    });

    const packageJson =
      await manifest.read();

    expect(
      packageJson.scripts?.build,
    ).toBe('nest build');

    expect(
      packageJson.scripts?.[
        'db:generate'
      ],
    ).toBe('prisma generate');
  });

  it('preserves existing package metadata', async () => {
    const { manifest } =
      await createManifest();

    await manifest.addDependencies({
      zod: '^4.4.3',
    });

    const packageJson =
      await manifest.read();

    expect(packageJson.name).toBe(
      'test-api',
    );

    expect(packageJson.version).toBe(
      '0.1.0',
    );

    expect(packageJson.private).toBeUndefined();
  });

  it('writes valid formatted JSON', async () => {
    const { manifest, fs } =
      await createManifest();

    await manifest.addDependencies({
      zod: '^4.4.3',
    });

    const content = await fs.readFile(
      path.join(
        temporaryDirectory,
        'package.json',
      ),
    );

    expect(content.endsWith('\n')).toBe(
      true,
    );

    expect(() =>
      JSON.parse(content),
    ).not.toThrow();
  });
});