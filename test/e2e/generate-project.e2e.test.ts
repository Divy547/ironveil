import {
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  spawn,
  execFile,
} from 'node:child_process';
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
  let serverProcess:
    | ReturnType<typeof spawn>
    | undefined;

  afterEach(async () => {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      serverProcess = undefined;
    }

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

  it(
    'generates and runs JWT authentication end-to-end',
    async () => {
      temporaryDirectory = await mkdtemp(
        path.join(
          os.tmpdir(),
          'forgekit-auth-e2e-',
        ),
      );

      const config = resolveConfig({
        projectName: 'generated-auth-api',
        auth: 'jwt',
      });

      const destination = await generateProject(
        config,
        temporaryDirectory,
      );

      const fs = createFileSystem();

      const port =
        3100 + (process.pid % 1000);

      const baseUrl =
        `http://127.0.0.1:${port}`;

      const testEmail =
        `test-${process.pid}-${Date.now()}@example.com`;

      const databaseUrl =
        'postgresql://postgres:postgres@localhost:5432/forgekit-auth-e2e?schema=public';

      await writeFile(
        path.join(
          destination,
          '.env',
        ),
        [
          'NODE_ENV=development',
          `PORT=${port}`,
          `DATABASE_URL="${databaseUrl}"`,
          'JWT_SECRET="forgekit-e2e-super-secret-key-2026-change-me"',
          '',
        ].join('\n'),
      );

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

      await execFileAsync(
        'npx',
        ['prisma', 'migrate', 'deploy'],
        {
          cwd: destination,
        },
      );

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
            'modules',
            'auth',
            'auth.controller.js',
          ),
        ),
      ).toBe(true);

      serverProcess = spawn(
        'node',
        ['dist/main.js'],
        {
          cwd: destination,
          stdio: [
            'ignore',
            'pipe',
            'pipe',
          ],
        },
      );

      await waitForServer(
        serverProcess,
        baseUrl,
      );

      const registerResponse =
        await fetch(
          `${baseUrl}/auth/register`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify({
              email: testEmail,
              password:
                'password123',
            }),
          },
        );

      expect(
        registerResponse.status,
      ).toBe(201);

      const registeredUser =
        (await registerResponse.json()) as {
          id: string;
          email: string;
          createdAt: string;
          updatedAt: string;
          passwordHash?: string;
        };

      expect(
        registeredUser.email,
      ).toBe(testEmail);

      expect(
        registeredUser.id,
      ).toBeTypeOf('string');

      expect(
        registeredUser.passwordHash,
      ).toBeUndefined();

      const duplicateResponse =
        await fetch(
          `${baseUrl}/auth/register`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify({
              email: testEmail,
              password:
                'password123',
            }),
          },
        );

      expect(
        duplicateResponse.status,
      ).toBe(409);

      const wrongPasswordResponse =
        await fetch(
          `${baseUrl}/auth/login`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify({
              email: testEmail,
              password:
                'wrongpassword',
            }),
          },
        );

      expect(
        wrongPasswordResponse.status,
      ).toBe(401);

      const loginResponse =
        await fetch(
          `${baseUrl}/auth/login`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify({
              email: testEmail,
              password:
                'password123',
            }),
          },
        );

      expect(
        loginResponse.status,
      ).toBe(201);

      const loginBody =
        (await loginResponse.json()) as {
          accessToken: string;
        };

      expect(
        loginBody.accessToken,
      ).toBeTypeOf('string');

      expect(
        loginBody.accessToken.length,
      ).toBeGreaterThan(0);

      const missingTokenResponse =
        await fetch(
          `${baseUrl}/auth/me`,
        );

      expect(
        missingTokenResponse.status,
      ).toBe(401);

      const invalidTokenResponse =
        await fetch(
          `${baseUrl}/auth/me`,
          {
            headers: {
              Authorization:
                'Bearer invalid-token',
            },
          },
        );

      expect(
        invalidTokenResponse.status,
      ).toBe(401);

      const meResponse =
        await fetch(
          `${baseUrl}/auth/me`,
          {
            headers: {
              Authorization:
                `Bearer ${loginBody.accessToken}`,
            },
          },
        );

      expect(
        meResponse.status,
      ).toBe(200);

      const meBody =
        (await meResponse.json()) as {
          sub: string;
          email: string;
          iat: number;
        };

      expect(
        meBody.sub,
      ).toBe(registeredUser.id);

      expect(
        meBody.email,
      ).toBe(testEmail);

      expect(
        meBody.iat,
      ).toBeTypeOf('number');
    },
    180_000,
  );
});

async function waitForServer(
  process: ReturnType<typeof spawn>,
  url: string,
  timeout = 30_000,
): Promise<void> {
  const startedAt = Date.now();

  while (
    Date.now() - startedAt <
    timeout
  ) {
    if (process.exitCode !== null) {
      throw new Error(
        'Generated NestJS server exited before becoming ready.',
      );
    }

    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((resolve) =>
        setTimeout(resolve, 500),
      );
    }
  }

  throw new Error(
    `Generated NestJS server did not become ready within ${timeout}ms.`,
  );
}