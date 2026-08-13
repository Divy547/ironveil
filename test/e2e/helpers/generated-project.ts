import path from 'node:path';
import {
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { ForgeKitConfig } from '../../../src/config/index.js';
import { generateProject } from '../../../src/generators/generate-project.js';
import { createFileSystem } from '../../../src/utils/filesystem.js';

const execFileAsync = promisify(execFile);

export interface GeneratedProject {
  readonly root: string;
  readonly fs: ReturnType<typeof createFileSystem>;
  readonly port: number;
  readonly baseUrl: string;

  writeEnv(values: {
    databaseUrl: string;
    jwtSecret?: string;
  }): Promise<void>;

  install(): Promise<void>;
  prismaGenerate(): Promise<void>;
  prismaMigrateDeploy(): Promise<void>;
  build(): Promise<void>;
  cleanup(): Promise<void>;
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

  const destination = await generateProject(
    config,
    temporaryDirectory,
  );

  const fs = createFileSystem();

  const port =
    3100 + (process.pid % 1000);

  const baseUrl =
    `http://127.0.0.1:${port}`;

  let cleaned = false;

  return {
    root: destination,
    fs,
    port,
    baseUrl,

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
      await execFileAsync(
        'npm',
        ['install'],
        {
          cwd: destination,
        },
      );
    },

    async prismaGenerate(): Promise<void> {
      await execFileAsync(
        'npx',
        ['prisma', 'generate'],
        {
          cwd: destination,
        },
      );
    },

    async prismaMigrateDeploy(): Promise<void> {
      await execFileAsync(
        'npx',
        [
          'prisma',
          'migrate',
          'deploy',
        ],
        {
          cwd: destination,
        },
      );
    },

    async build(): Promise<void> {
      await execFileAsync(
        'npm',
        ['run', 'build'],
        {
          cwd: destination,
        },
      );
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