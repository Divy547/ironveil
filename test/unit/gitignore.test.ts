import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveConfig } from '../../src/config/index.js';
import { generateProject } from '../../src/generators/generate-project.js';
import { createFileSystem } from '../../src/utils/filesystem.js';

describe('generated .gitignore', () => {
  let temporaryDirectory: string;

  afterEach(async () => {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  async function generate(
    overrides: Parameters<typeof resolveConfig>[0] = {},
  ) {
    temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'ironveil-gitignore-'),
    );
    return generateProject(
      resolveConfig({ projectName: 'test-api', ...overrides }),
      temporaryDirectory,
    );
  }

  function isIgnored(destination: string, file: string): boolean {
    try {
      execFileSync('git', ['check-ignore', '-q', file], {
        cwd: destination,
        stdio: 'ignore',
      });
      return true;
    } catch {
      return false;
    }
  }

  it('is generated for every project, including a minimal one', async () => {
    for (const overrides of [
      {},
      { auth: 'jwt' as const, redis: true },
      { swagger: false, docker: false, ci: false, testing: false },
    ]) {
      const { destination, files } = await generate(overrides);
      expect(files).toContain('.gitignore');
      expect(
        await createFileSystem().exists(path.join(destination, '.gitignore')),
      ).toBe(true);
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it('ignores secrets, dependencies and build output, but keeps .env.example', async () => {
    const { destination } = await generate();
    execFileSync('git', ['init', '-q'], { cwd: destination });

    for (const file of [
      '.env',
      '.env.local',
      '.env.production',
      'node_modules/pkg/index.js',
      'dist/main.js',
      'coverage/lcov.info',
      'src/generated/prisma/client.ts',
      'npm-debug.log',
      '.DS_Store',
    ]) {
      expect(isIgnored(destination, file), `${file} should be ignored`).toBe(
        true,
      );
    }

    for (const file of [
      '.env.example',
      'package.json',
      'prisma/schema.prisma',
      'prisma/migrations/0001_init/migration.sql',
      'src/main.ts',
      'AGENTS.md',
      '.gitignore',
      '.dockerignore',
      '.github/workflows/ci.yml',
    ]) {
      expect(isIgnored(destination, file), `${file} must not be ignored`).toBe(
        false,
      );
    }
  });

  it('never ignores a file the generator itself wrote', async () => {
    const { destination, files } = await generate({
      auth: 'jwt',
      redis: true,
    });
    execFileSync('git', ['init', '-q'], { cwd: destination });

    const ignored = files.filter((file) => isIgnored(destination, file));
    expect(ignored).toEqual([]);
  });
});
