import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createFileSystem } from '../../../src/utils/filesystem.js';

const execFileAsync = promisify(execFile);

const currentDir = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(currentDir, '../../../');

export interface PackResult {
  readonly filename: string;
  readonly tarballPath: string;
  readonly files: readonly string[];
  readonly size: number;
  cleanup(): Promise<void>;
}

export interface InstalledForgeKit {
  readonly envDir: string;
  readonly binPath: string;
  runCli(
    args: string[],
    options?: { cwd?: string; env?: NodeJS.ProcessEnv },
  ): Promise<{ stdout: string; stderr: string }>;
  cleanup(): Promise<void>;
}

export async function packForgeKit(rootDir: string = REPO_ROOT): Promise<PackResult> {
  const { stdout } = await execFileAsync('npm', ['pack', '--json'], {
    cwd: rootDir,
    env: {
      ...process.env,
      COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
    },
  });

  const jsonStart = stdout.indexOf('[');
  const jsonEnd = stdout.lastIndexOf(']');
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    throw new Error(`Failed to parse npm pack output:\n${stdout}`);
  }

  const parsed = JSON.parse(stdout.slice(jsonStart, jsonEnd + 1)) as Array<{
    filename: string;
    files: Array<{ path: string }>;
    size: number;
  }>;

  if (!parsed || parsed.length === 0 || !parsed[0].filename) {
    throw new Error(`Failed to parse npm pack output:\n${stdout}`);
  }

  const pkgInfo = parsed[0];
  const filename = pkgInfo.filename;
  const tarballPath = path.join(rootDir, filename);
  const files = pkgInfo.files.map((f) => f.path);
  const size = pkgInfo.size;

  let cleaned = false;

  return {
    filename,
    tarballPath,
    files,
    size,
    async cleanup(): Promise<void> {
      if (cleaned) {
        return;
      }
      cleaned = true;
      const fs = createFileSystem();
      if (await fs.exists(tarballPath)) {
        await rm(tarballPath, { force: true });
      }
    },
  };
}

export async function installPackedForgeKit(
  tarballPath: string,
  prefix = 'forgekit-pkg-env',
): Promise<InstalledForgeKit> {
  const envDir = await mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
  const fs = createFileSystem();

  // Create an isolated package.json in the temporary environment
  await writeFile(
    path.join(envDir, 'package.json'),
    JSON.stringify(
      {
        name: 'forgekit-isolated-test-runner',
        version: '1.0.0',
        private: true,
      },
      null,
      2,
    ),
  );

  const execEnv = {
    ...process.env,
    COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
    NODE_PATH: undefined, // Clear NODE_PATH to prevent climbing into parent node_modules
  };

  // Install the packed tarball into the isolated environment
  await execFileAsync(
    'npm',
    ['install', '--prefer-offline', '--no-audit', '--no-fund', tarballPath],
    {
      cwd: envDir,
      env: execEnv,
    },
  );

  const binPath = path.join(
    envDir,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'forgekit.cmd' : 'forgekit',
  );

  if (!(await fs.exists(binPath))) {
    throw new Error(
      `ForgeKit CLI executable not found at expected path: ${binPath}`,
    );
  }

  let cleaned = false;

  return {
    envDir,
    binPath,

    async runCli(
      args: string[],
      options?: { cwd?: string; env?: NodeJS.ProcessEnv },
    ): Promise<{ stdout: string; stderr: string }> {
      return execFileAsync(binPath, args, {
        cwd: options?.cwd ?? envDir,
        env: {
          ...execEnv,
          ...options?.env,
        },
      });
    },

    async cleanup(): Promise<void> {
      if (cleaned) {
        return;
      }
      cleaned = true;
      await rm(envDir, { recursive: true, force: true });
    },
  };
}
