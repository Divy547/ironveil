import {
  mkdtemp,
  rm,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  afterEach,
  describe,
  expect,
  it,
} from 'vitest';

import { resolveConfig } from '../../src/config/index.js';
import {
  generateProject,
} from '../../src/generators/generate-project.js';
import {
  createFileSystem,
} from '../../src/utils/filesystem.js';

const execFileAsync = promisify(execFile);

describe('ForgeKit project generation E2E', () => {
  let temporaryDirectory: string;

  afterEach(async () => {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, {
        recursive: true,
        force: true,
      });
    }
  });

  it(
    'generates a buildable NestJS project with Prisma',
    async () => {
      temporaryDirectory = await mkdtemp(
        path.join(
          os.tmpdir(),
          'forgekit-e2e-',
        ),
      );

      const config = resolveConfig({
        projectName: 'generated-api',
      });

      const destination = await generateProject(
        config,
        temporaryDirectory,
      );

      const fs = createFileSystem();

      expect(
        await fs.exists(
          path.join(
            destination,
            'package.json',
          ),
        ),
      ).toBe(true);

      expect(
        await fs.exists(
          path.join(
            destination,
            'src',
            'app.module.ts',
          ),
        ),
      ).toBe(true);

      expect(
        await fs.exists(
          path.join(
            destination,
            'prisma',
            'schema.prisma',
          ),
        ),
      ).toBe(true);

      expect(
        await fs.exists(
          path.join(
            destination,
            'src',
            'infrastructure',
            'prisma',
            'prisma.service.ts',
          ),
        ),
      ).toBe(true);

      await execFileAsync(
        'npm',
        ['install'],
        {
          cwd: destination,
        },
      );

      await execFileAsync(
        'npx',
        ['prisma', 'generate'],
        {
          cwd: destination,
        },
      );

      expect(
        await fs.exists(
          path.join(
            destination,
            'src',
            'generated',
            'prisma',
            'client.ts',
          ),
        ),
      ).toBe(true);

      await execFileAsync(
        'npm',
        ['run', 'build'],
        {
          cwd: destination,
        },
      );

      expect(
        await fs.exists(
          path.join(
            destination,
            'dist',
          ),
        ),
      ).toBe(true);

      expect(
        await fs.exists(
          path.join(
            destination,
            'dist',
            'infrastructure',
            'prisma',
            'prisma.service.js',
          ),
        ),
      ).toBe(true);
    },
    120_000,
  );
});