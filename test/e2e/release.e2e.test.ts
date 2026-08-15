import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { resolveConfig } from '../../src/config/index.js';
import { createFileSystem } from '../../src/utils/filesystem.js';
import {
  assertProjectManifestMatchesVersions,
  ensurePackageManagerAvailable,
} from './helpers/generated-project.js';
import {
  installPackedForgeKit,
  packForgeKit,
  type InstalledForgeKit,
  type PackResult,
} from './helpers/pack-helper.js';

const execFileAsync = promisify(execFile);
const DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/test?schema=public';
const JWT_SECRET = 'release-e2e-secret-key-12345678901234567890';

describe('F15 — Release & Packaged Artifact Verification', () => {
  let packResult: PackResult;
  let installedKit: InstalledForgeKit;
  let workspaceDir: string;
  const fs = createFileSystem();

  beforeAll(async () => {
    // 1. Pack the repository
    packResult = await packForgeKit();

    // 2. Install the packed tarball into an isolated environment
    installedKit = await installPackedForgeKit(
      packResult.tarballPath,
      'forgekit-release-env',
    );

    // 3. Create a clean workspace for generated projects
    workspaceDir = await mkdtemp(
      path.join(os.tmpdir(), 'forgekit-release-workspace-'),
    );
  }, 300_000);

  afterAll(async () => {
    if (workspaceDir) {
      await rm(workspaceDir, { recursive: true, force: true });
    }
    if (installedKit) {
      await installedKit.cleanup();
    }
    if (packResult) {
      await packResult.cleanup();
    }
  });

  // =========================================================================
  // Test 1: Tarball Contents & Exclusion Policy
  // =========================================================================
  it('pack produces a clean tarball with all required runtime files and no source/test leakage', () => {
    expect(packResult.filename).toMatch(/^ironveil-\d+\.\d+\.\d+\.tgz$/);
    expect(packResult.size).toBeGreaterThan(0);

    const files = packResult.files;

    // 1. Essential runtime binaries and manifests
    expect(files).toContain('bin/ironveil.js');
    expect(files).toContain('package.json');

    // 2. Compiled dist files
    expect(files).toContain('dist/src/index.js');
    expect(files).toContain('dist/src/cli/index.js');
    expect(files).toContain('dist/src/generators/generate-project.js');
    expect(files).toContain('dist/src/validation/package-validator.js');
    expect(files).toContain('dist/src/config/versions.js');

    // 3. Bundled template assets
    expect(files).toContain('dist/templates/base/package.json');
    expect(files).toContain('dist/templates/base/src/main.ts.template');
    expect(files).toContain('dist/templates/base/tsconfig.json');
    expect(files).toContain('dist/templates/prisma/prisma/schema.prisma');
    expect(files).toContain(
      'dist/templates/auth/src/modules/auth/auth.module.ts.template',
    );
    expect(files).toContain(
      'dist/templates/redis/src/infrastructure/redis/redis.module.ts.template',
    );
    expect(files).toContain(
      'dist/templates/swagger/src/infrastructure/swagger/swagger.setup.ts.template',
    );
    expect(files).toContain('dist/templates/docker/Dockerfile.template');
    expect(files).toContain('dist/templates/testing/jest.config.ts.template');
    expect(files).toContain(
      'dist/templates/ci/.github/workflows/ci.yml.template',
    );

    // 4. Strict exclusion policy (No source, test, script, or repo config files)
    const leakedSource = files.filter(
      (f) =>
        f.startsWith('src/') ||
        f.startsWith('test/') ||
        f.startsWith('scripts/') ||
        f.startsWith('.github/') ||
        f === 'tsconfig.json' ||
        f === 'vitest.config.ts' ||
        (f.endsWith('.ts') && !f.endsWith('.d.ts') && !f.includes('templates/')),
    );

    expect(leakedSource).toEqual([]);
  });

  // =========================================================================
  // Test 2: Installed Packaged CLI Execution
  // =========================================================================
  it('executes the installed binary and returns help and version information', async () => {
    const helpResult = await installedKit.runCli(['--help']);
    expect(helpResult.stdout).toContain('Usage: ironveil');
    expect(helpResult.stdout).toContain('create');

    const versionResult = await installedKit.runCli(['--version']);
    expect(versionResult.stdout.trim()).toBe('0.1.0');
  });

  // =========================================================================
  // Test 3: Packaged CLI Project Generation & Lifecycle (npm)
  // =========================================================================
  it(
    'generates a full-feature project using the packaged CLI and executes full npm lifecycle',
    async () => {
      const projectName = 'packaged-npm-app';
      const projectPath = path.join(workspaceDir, projectName);

      const config = resolveConfig({
        projectName,
        database: 'postgres',
        orm: 'prisma',
        auth: 'jwt',
        swagger: true,
        redis: true,
        docker: true,
        ci: true,
        testing: true,
        packageManager: 'npm',
      });

      const { stdout } = await installedKit.runCli(
        [
          'create',
          projectName,
          '--yes',
          '--auth',
          'jwt',
          '--redis',
          '--package-manager',
          'npm',
        ],
        { cwd: workspaceDir },
      );

      expect(stdout).toContain('Project created successfully.');
      expect(stdout).toContain(projectName);
      expect(await fs.exists(projectPath)).toBe(true);

      // Verify template assets were resolved and written from installed package
      expect(
        await fs.exists(path.join(projectPath, 'prisma/schema.prisma')),
      ).toBe(true);
      expect(
        await fs.exists(
          path.join(projectPath, 'src/modules/auth/auth.module.ts'),
        ),
      ).toBe(true);
      expect(
        await fs.exists(
          path.join(
            projectPath,
            'src/infrastructure/redis/redis.module.ts',
          ),
        ),
      ).toBe(true);
      expect(
        await fs.exists(path.join(projectPath, 'Dockerfile')),
      ).toBe(true);
      expect(
        await fs.exists(path.join(projectPath, 'jest.config.ts')),
      ).toBe(true);

      // Validate manifest against FORGEKIT_VERSIONS
      await assertProjectManifestMatchesVersions(projectPath, config, fs);

      // Execute generated project lifecycle
      await writeFile(
        path.join(projectPath, '.env'),
        `DATABASE_URL="${DATABASE_URL}"\nREDIS_URL="redis://localhost:6379"\nJWT_SECRET="${JWT_SECRET}"\nPORT=3300\n`,
      );

      const execEnv = {
        ...process.env,
        COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
      };

      await execFileAsync(
        'npm',
        ['install', '--prefer-offline', '--no-audit', '--no-fund'],
        {
          cwd: projectPath,
          env: execEnv,
        },
      );

      await execFileAsync('npx', ['prisma', 'generate'], {
        cwd: projectPath,
        env: execEnv,
      });

      await execFileAsync('npm', ['run', 'typecheck'], {
        cwd: projectPath,
        env: execEnv,
      });

      await execFileAsync('npm', ['test'], {
        cwd: projectPath,
        env: execEnv,
      });

      await execFileAsync('npm', ['run', 'build'], {
        cwd: projectPath,
        env: execEnv,
      });

      expect(
        await fs.exists(path.join(projectPath, 'dist/main.js')),
      ).toBe(true);
    },
    360_000,
  );

  // =========================================================================
  // Test 4: Packaged CLI Project Generation & Lifecycle (pnpm)
  // =========================================================================
  it(
    'generates a pnpm project using the packaged CLI and executes full pnpm lifecycle',
    async () => {
      await ensurePackageManagerAvailable('pnpm');

      const projectName = 'packaged-pnpm-app';
      const projectPath = path.join(workspaceDir, projectName);

      const config = resolveConfig({
        projectName,
        database: 'postgres',
        orm: 'prisma',
        swagger: true,
        docker: true,
        ci: true,
        testing: true,
        packageManager: 'pnpm',
      });

      await installedKit.runCli(
        [
          'create',
          projectName,
          '--yes',
          '--package-manager',
          'pnpm',
        ],
        { cwd: workspaceDir },
      );

      expect(await fs.exists(projectPath)).toBe(true);

      const pkg = JSON.parse(
        await fs.readFile(path.join(projectPath, 'package.json')),
      ) as { packageManager?: string };
      expect(pkg.packageManager).toBe('pnpm@10.5.2');

      // Assert artifact purity
      expect(
        await fs.exists(path.join(projectPath, 'package-lock.json')),
      ).toBe(false);

      await assertProjectManifestMatchesVersions(projectPath, config, fs);

      await writeFile(
        path.join(projectPath, '.env'),
        `DATABASE_URL="${DATABASE_URL}"\nPORT=3301\n`,
      );

      const execEnv = {
        ...process.env,
        COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
      };

      await execFileAsync('pnpm', ['install', '--prefer-offline'], {
        cwd: projectPath,
        env: execEnv,
      });

      await execFileAsync('pnpm', ['exec', 'prisma', 'generate'], {
        cwd: projectPath,
        env: execEnv,
      });

      await execFileAsync('pnpm', ['run', 'typecheck'], {
        cwd: projectPath,
        env: execEnv,
      });

      await execFileAsync('pnpm', ['test'], {
        cwd: projectPath,
        env: execEnv,
      });

      await execFileAsync('pnpm', ['run', 'build'], {
        cwd: projectPath,
        env: execEnv,
      });

      expect(
        await fs.exists(path.join(projectPath, 'dist/main.js')),
      ).toBe(true);
      expect(
        await fs.exists(path.join(projectPath, 'pnpm-lock.yaml')),
      ).toBe(true);
      expect(
        await fs.exists(path.join(projectPath, 'package-lock.json')),
      ).toBe(false);
    },
    360_000,
  );

  // =========================================================================
  // Test 5: Packaged CLI Project Generation & Lifecycle (yarn)
  // =========================================================================
  it(
    'generates a yarn project using the packaged CLI and executes full yarn lifecycle',
    async () => {
      await ensurePackageManagerAvailable('yarn');

      const projectName = 'packaged-yarn-app';
      const projectPath = path.join(workspaceDir, projectName);

      const config = resolveConfig({
        projectName,
        database: 'postgres',
        orm: 'prisma',
        swagger: true,
        docker: true,
        ci: true,
        testing: true,
        packageManager: 'yarn',
      });

      await installedKit.runCli(
        [
          'create',
          projectName,
          '--yes',
          '--package-manager',
          'yarn',
        ],
        { cwd: workspaceDir },
      );

      expect(await fs.exists(projectPath)).toBe(true);

      const pkg = JSON.parse(
        await fs.readFile(path.join(projectPath, 'package.json')),
      ) as { packageManager?: string };
      expect(pkg.packageManager).toBe('yarn@1.22.22');

      expect(
        await fs.exists(path.join(projectPath, 'package-lock.json')),
      ).toBe(false);

      await assertProjectManifestMatchesVersions(projectPath, config, fs);

      await writeFile(
        path.join(projectPath, '.env'),
        `DATABASE_URL="${DATABASE_URL}"\nPORT=3302\n`,
      );

      const execEnv = {
        ...process.env,
        COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
      };

      await execFileAsync('yarn', ['install', '--prefer-offline'], {
        cwd: projectPath,
        env: execEnv,
      });

      await execFileAsync('yarn', ['prisma', 'generate'], {
        cwd: projectPath,
        env: execEnv,
      });

      await execFileAsync('yarn', ['typecheck'], {
        cwd: projectPath,
        env: execEnv,
      });

      await execFileAsync('yarn', ['test'], {
        cwd: projectPath,
        env: execEnv,
      });

      await execFileAsync('yarn', ['build'], {
        cwd: projectPath,
        env: execEnv,
      });

      expect(
        await fs.exists(path.join(projectPath, 'dist/main.js')),
      ).toBe(true);
      expect(
        await fs.exists(path.join(projectPath, 'yarn.lock')),
      ).toBe(true);
      expect(
        await fs.exists(path.join(projectPath, 'package-lock.json')),
      ).toBe(false);
    },
    360_000,
  );

  // =========================================================================
  // Test 6: Packaged CLI Error Handling
  // =========================================================================
  it('fails gracefully with clear error when attempting to generate into an existing directory', async () => {
    const existingDirName = 'existing-dir-app';
    const existingDirPath = path.join(workspaceDir, existingDirName);
    await fs.ensureDirectory(existingDirPath);
    await fs.writeFile(
      path.join(existingDirPath, 'keep-me.txt'),
      'user data',
    );

    try {
      await installedKit.runCli(
        [
          'create',
          existingDirName,
          '--yes',
          '--package-manager',
          'npm',
        ],
        { cwd: workspaceDir },
      );
      expect.unreachable('Should have failed on existing directory');
    } catch (error: any) {
      expect(error.message).toContain('Destination already exists');
    }

    // Ensure existing user data is intact
    expect(await fs.exists(path.join(existingDirPath, 'keep-me.txt'))).toBe(
      true,
    );
  });
});
