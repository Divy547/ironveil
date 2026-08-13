import {
  access,
  readFile,
} from 'node:fs/promises';
import path from 'node:path';
import {
  describe,
  expect,
  it,
} from 'vitest';

const ROOT = process.cwd();

async function exists(
  target: string,
): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

describe('package assets', () => {
  it('contains the CLI entrypoint', async () => {
    expect(
      await exists(
        path.join(
          ROOT,
          'bin',
          'forgekit.js',
        ),
      ),
    ).toBe(true);
  });

  it('contains compiled application code', async () => {
    expect(
      await exists(
        path.join(
          ROOT,
          'dist',
          'src',
          'index.js',
        ),
      ),
    ).toBe(true);
  });

  it('contains packaged base templates', async () => {
    expect(
      await exists(
        path.join(
          ROOT,
          'dist',
          'templates',
          'base',
          'package.json',
        ),
      ),
    ).toBe(true);
  });

  it('contains packaged configuration templates', async () => {
    expect(
      await exists(
        path.join(
          ROOT,
          'dist',
          'templates',
          'config',
          'src',
          'infrastructure',
          'config',
          'configuration.ts.template',
        ),
      ),
    ).toBe(true);
  });

  it('contains the configuration environment template', async () => {
    expect(
      await exists(
        path.join(
          ROOT,
          'dist',
          'templates',
          'config',
          'src',
          'infrastructure',
          'config',
          'environment.ts.template',
        ),
      ),
    ).toBe(true);
  });

  it('package metadata points to the CLI', async () => {
    const packageJson = JSON.parse(
      await readFile(
        path.join(
          ROOT,
          'package.json',
        ),
        'utf8',
      ),
    ) as {
      bin?: {
        forgekit?: string;
      };
    };

    expect(packageJson.bin?.forgekit).toBe(
      './bin/forgekit.js',
    );
  });
});