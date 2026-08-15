import path from 'node:path';
import {
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { ForgeKitConfig, PackageManager } from '../../../src/config/index.js';
import { FORGEKIT_VERSIONS } from '../../../src/config/versions.js';
import { generateProject } from '../../../src/generators/generate-project.js';
import { createFileSystem } from '../../../src/utils/filesystem.js';
import { getPackageManagerSpec } from '../../../src/utils/package-manager.js';

const execFileAsync = promisify(execFile);

export interface GeneratedProject {
  readonly root: string;
  readonly fs: ReturnType<typeof createFileSystem>;
  readonly port: number;
  readonly baseUrl: string;
  readonly packageManager: PackageManager;

  writeEnv(values: {
    databaseUrl: string;
    redisUrl?: string;
    jwtSecret?: string;
  }): Promise<void>;

  install(): Promise<void>;
  prismaGenerate(): Promise<void>;
  prismaMigrateDeploy(): Promise<void>;
  build(): Promise<void>;
  typecheck(): Promise<void>;
  test(): Promise<void>;
  testE2e(): Promise<void>;
  assertManifestMatchesVersions(): Promise<void>;
  cleanup(): Promise<void>;
}

export async function assertProjectManifestMatchesVersions(
  projectRoot: string,
  config: ForgeKitConfig,
  fs: ReturnType<typeof createFileSystem>,
): Promise<void> {
  const packageJsonContent = await fs.readFile(path.join(projectRoot, 'package.json'));
  const pkg = JSON.parse(packageJsonContent) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  const expectedDependencies: Record<string, string> = {
    ...FORGEKIT_VERSIONS.dependencies.base,
  };

  const expectedDevDependencies: Record<string, string> = {
    ...FORGEKIT_VERSIONS.devDependencies.base,
  };

  if (config.auth === 'jwt') {
    Object.assign(expectedDependencies, FORGEKIT_VERSIONS.dependencies.auth);
    Object.assign(expectedDevDependencies, FORGEKIT_VERSIONS.devDependencies.auth);
  }

  if (config.database === 'postgres' && config.orm === 'prisma') {
    Object.assign(expectedDependencies, FORGEKIT_VERSIONS.dependencies.prisma);
    Object.assign(expectedDevDependencies, FORGEKIT_VERSIONS.devDependencies.prisma);
  }

  if (config.redis) {
    Object.assign(expectedDependencies, FORGEKIT_VERSIONS.dependencies.redis);
  }

  if (config.swagger) {
    Object.assign(expectedDependencies, FORGEKIT_VERSIONS.dependencies.swagger);
  }

  if (config.testing) {
    Object.assign(expectedDevDependencies, FORGEKIT_VERSIONS.devDependencies.testing);
  }

  for (const [dep, version] of Object.entries(expectedDependencies)) {
    if (pkg.dependencies?.[dep] !== version) {
      throw new Error(
        `Manifest drift in dependencies for "${dep}": expected "${version}", got "${pkg.dependencies?.[dep]}"`,
      );
    }
  }

  for (const dep of Object.keys(pkg.dependencies ?? {})) {
    if (!expectedDependencies[dep]) {
      throw new Error(
        `Unexpected dependency in manifest: "${dep}" was not expected for this configuration`,
      );
    }
  }

  for (const [devDep, version] of Object.entries(expectedDevDependencies)) {
    if (pkg.devDependencies?.[devDep] !== version) {
      throw new Error(
        `Manifest drift in devDependencies for "${devDep}": expected "${version}", got "${pkg.devDependencies?.[devDep]}"`,
      );
    }
  }

  for (const devDep of Object.keys(pkg.devDependencies ?? {})) {
    if (!expectedDevDependencies[devDep]) {
      throw new Error(
        `Unexpected devDependency in manifest: "${devDep}" was not expected for this configuration`,
      );
    }
  }
}

export async function ensurePackageManagerAvailable(
  pm: PackageManager,
): Promise<void> {
  const env = {
    ...process.env,
    COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
  };

  try {
    if (pm === 'npm') {
      await execFileAsync('npm', ['--version'], { env });
    } else if (pm === 'pnpm') {
      await execFileAsync('pnpm', ['--version'], { env });
    } else if (pm === 'yarn') {
      await execFileAsync('corepack', ['enable'], { env });
    }
  } catch (error) {
    throw new Error(
      `Package manager "${pm}" is not available in the test environment: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function createGeneratedProject(
  config: ForgeKitConfig,
  prefix: string,
): Promise<GeneratedProject> {
  const temporaryDirectory = await mkdtemp(
    path.join(
      os.tmpdir(),
      `${prefix}-`,
    ),
  );

  const result = await generateProject(
    config,
    temporaryDirectory,
  );
  const destination = result.destination;

  const fs = createFileSystem();

  const port =
    3100 + (process.pid % 1000);

  const baseUrl =
    `http://127.0.0.1:${port}`;

  let cleaned = false;

  const pm = config.packageManager ?? 'npm';
  const pmSpec = getPackageManagerSpec(pm);

  const execEnv = {
    ...process.env,
    COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
  };

  return {
    root: destination,
    fs,
    port,
    baseUrl,
    packageManager: pm,

    async writeEnv(values): Promise<void> {
      await writeFile(
        path.join(
          destination,
          '.env',
        ),
        [
          'NODE_ENV=development',
          `PORT=${port}`,
          `DATABASE_URL="${values.databaseUrl}"`,
          values.redisUrl
            ? `REDIS_URL="${values.redisUrl}"`
            : undefined,
          values.jwtSecret
            ? `JWT_SECRET="${values.jwtSecret}"`
            : undefined,
          '',
        ]
          .filter(
            (
              value,
            ): value is string =>
              value !== undefined,
          )
          .join('\n'),
      );
    },

    async install(): Promise<void> {
      const [bin, ...args] = pmSpec.install.split(' ');
      await execFileAsync(bin, args, {
        cwd: destination,
        env: execEnv,
      });
    },

    async prismaGenerate(): Promise<void> {
      const [bin, ...args] = pmSpec.prisma('generate').split(' ');
      await execFileAsync(bin, args, {
        cwd: destination,
        env: execEnv,
      });
    },

    async prismaMigrateDeploy(): Promise<void> {
      const [bin, ...args] = pmSpec.prisma('migrate deploy').split(' ');
      await execFileAsync(bin, args, {
        cwd: destination,
        env: execEnv,
      });
    },

    async build(): Promise<void> {
      const [bin, ...args] = pmSpec.run('build').split(' ');
      await execFileAsync(bin, args, {
        cwd: destination,
        env: execEnv,
      });
    },

    async typecheck(): Promise<void> {
      const [bin, ...args] = pmSpec.run('typecheck').split(' ');
      await execFileAsync(bin, args, {
        cwd: destination,
        env: execEnv,
      });
    },

    async test(): Promise<void> {
      const [bin, ...args] = pmSpec.run('test').split(' ');
      await execFileAsync(bin, args, {
        cwd: destination,
        env: execEnv,
      });
    },

    async testE2e(): Promise<void> {
      const [bin, ...args] = pmSpec.run('test:e2e').split(' ');
      await execFileAsync(bin, args, {
        cwd: destination,
        env: execEnv,
      });
    },

    async assertManifestMatchesVersions(): Promise<void> {
      await assertProjectManifestMatchesVersions(destination, config, fs);
    },

    async cleanup(): Promise<void> {
      if (cleaned) {
        return;
      }

      cleaned = true;

      await rm(
        temporaryDirectory,
        {
          recursive: true,
          force: true,
        },
      );
    },
  };
}