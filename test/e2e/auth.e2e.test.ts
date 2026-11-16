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
  createGeneratedProject,
} from './helpers/generated-project.js';
import {
  startTestServer,
  type TestServer,
} from './helpers/test-server.js';

const execFileAsync = promisify(execFile);

const DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/ironveil-auth-e2e?schema=public';

const JWT_SECRET =
  'ironveil-e2e-super-secret-key-2026-change-me';

describe('Ironveil JWT Auth E2E', () => {
  let project:
    | Awaited<
        ReturnType<
          typeof createGeneratedProject
        >
      >
    | undefined;

  let server:
    | TestServer
    | undefined;

  afterEach(async () => {
    server?.stop();
    server = undefined;

    await project?.cleanup();
    project = undefined;
  });

  it(
    'registers, authenticates and protects JWT routes',
    async () => {
      project =
        await createGeneratedProject(
          resolveConfig({
            projectName:
              'generated-auth-api',
            auth: 'jwt',
          }),
          'ironveil-auth-e2e',
        );

      // Verify JWT configuration artifacts
      const envExample = await project.fs.readFile(
        `${project.root}/.env.example`,
      );
      expect(envExample).toContain('JWT_SECRET=');

      const environmentTs = await project.fs.readFile(
        `${project.root}/src/infrastructure/config/environment.ts`,
      );
      expect(environmentTs).toContain('JWT_SECRET: z');

      const configurationTs = await project.fs.readFile(
        `${project.root}/src/infrastructure/config/configuration.ts`,
      );
      expect(configurationTs).toContain('auth: {');
      expect(configurationTs).toContain('process.env.JWT_SECRET');

      await project.writeEnv({
        databaseUrl:
          DATABASE_URL,
        jwtSecret: JWT_SECRET,
      });

      // A throwaway module that exercises @Public(), the global guard and
      // @Roles() through real HTTP requests.
      await project.fs.writeFile(
        `${project.root}/src/modules/probe/probe.controller.ts`,
        [
          "import { Controller, Get } from '@nestjs/common';",
          "import { CurrentUser } from '../auth/decorators/current-user.decorator';",
          "import { Public } from '../auth/decorators/public.decorator';",
          "import { Roles } from '../auth/decorators/roles.decorator';",
          "import { Role } from '../auth/types/role.type';",
          '',
          "@Controller('probe')",
          'export class ProbeController {',
          "  @Public() @Get('public') open() { return { ok: true }; }",
          "  @Get('private') secured(@CurrentUser('email') email: string) { return { email }; }",
          "  @Roles(Role.ADMIN) @Get('admin') admin() { return { ok: true }; }",
          '}',
          '',
        ].join('\n'),
      );

      await project.fs.writeFile(
        `${project.root}/src/modules/probe/probe.module.ts`,
        [
          "import { Module } from '@nestjs/common';",
          "import { ProbeController } from './probe.controller';",
          '',
          '@Module({ controllers: [ProbeController] })',
          'export class ProbeModule {}',
          '',
        ].join('\n'),
      );

      const appModulePath = `${project.root}/src/app.module.ts`;
      const appModule = await project.fs.readFile(appModulePath);

      await project.fs.writeFile(
        appModulePath,
        appModule
          .replace(
            "import { HealthModule }",
            "import { ProbeModule } from './modules/probe/probe.module';\nimport { HealthModule }",
          )
          .replace('HealthModule,', 'HealthModule,\n    ProbeModule,'),
      );

      await project.install();
      await project.prismaGenerate();
      await project.prismaMigrateDeploy();
      await project.build();

      server =
        await startTestServer(
          project.root,
          project.baseUrl,
        );

      const email =
        `test-${process.pid}-${Date.now()}@example.com`;

      const password =
        'password123';

      const registerResponse =
        await fetch(
          `${project.baseUrl}/auth/register`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify({
              email,
              password,
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
        registeredUser.id,
      ).toBeTypeOf('string');

      expect(
        registeredUser.email,
      ).toBe(email);

      expect(
        registeredUser.createdAt,
      ).toBeTypeOf('string');

      expect(
        registeredUser.updatedAt,
      ).toBeTypeOf('string');

      expect(
        registeredUser.passwordHash,
      ).toBeUndefined();

      const duplicateResponse =
        await fetch(
          `${project.baseUrl}/auth/register`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify({
              email,
              password,
            }),
          },
        );

      expect(
        duplicateResponse.status,
      ).toBe(409);

      const invalidLoginResponse =
        await fetch(
          `${project.baseUrl}/auth/login`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify({
              email,
              password:
                'wrongpassword',
            }),
          },
        );

      expect(
        invalidLoginResponse.status,
      ).toBe(401);

      const loginResponse =
        await fetch(
          `${project.baseUrl}/auth/login`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify({
              email,
              password,
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
          `${project.baseUrl}/auth/me`,
        );

      expect(
        missingTokenResponse.status,
      ).toBe(401);

      const invalidTokenResponse =
        await fetch(
          `${project.baseUrl}/auth/me`,
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
          `${project.baseUrl}/auth/me`,
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
          id: string;
          email: string;
          role: string;
          passwordHash?: string;
        };

      expect(
        meBody.id,
      ).toBe(registeredUser.id);

      expect(
        meBody.email,
      ).toBe(email);

      expect(
        meBody.role,
      ).toBe('USER');

      expect(
        meBody.passwordHash,
      ).toBeUndefined();

      expect(
        registeredUser.role,
      ).toBe('USER');

      // ── Global guard, @Public() and @CurrentUser() ──
      const bearer = {
        Authorization: `Bearer ${loginBody.accessToken}`,
      };

      expect(
        (await fetch(`${project.baseUrl}/probe/public`)).status,
      ).toBe(200);

      expect(
        (await fetch(`${project.baseUrl}/probe/private`)).status,
      ).toBe(401);

      const privateResponse = await fetch(
        `${project.baseUrl}/probe/private`,
        { headers: bearer },
      );

      expect(privateResponse.status).toBe(200);
      expect(
        (await privateResponse.json()) as { email: string },
      ).toEqual({ email });

      // Health probes stay reachable without a token.
      expect(
        (await fetch(`${project.baseUrl}/health`)).status,
      ).toBe(200);

      // ── @Roles() ──
      expect(
        (
          await fetch(`${project.baseUrl}/probe/admin`, {
            headers: bearer,
          })
        ).status,
      ).toBe(403);

      // Clients cannot grant themselves a role at registration.
      const selfPromotion = await fetch(
        `${project.baseUrl}/auth/register`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: `admin-${email}`,
            password,
            role: 'ADMIN',
          }),
        },
      );

      expect(selfPromotion.status).toBe(400);

      await execFileAsync(
        'node',
        [
          '-e',
          `const { PrismaClient } = require('./dist/generated/prisma/client');
const prisma = new PrismaClient();
prisma.user
  .update({ where: { email: process.env.PROMOTE_EMAIL }, data: { role: 'ADMIN' } })
  .finally(() => prisma.$disconnect());`,
        ],
        {
          cwd: project.root,
          env: {
            ...process.env,
            DATABASE_URL,
            PROMOTE_EMAIL: email,
          },
        },
      );

      const adminLogin = await fetch(
        `${project.baseUrl}/auth/login`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        },
      );

      const adminTokens = (await adminLogin.json()) as {
        accessToken: string;
        refreshToken: string;
      };

      expect(
        (
          await fetch(`${project.baseUrl}/probe/admin`, {
            headers: {
              Authorization: `Bearer ${adminTokens.accessToken}`,
            },
          })
        ).status,
      ).toBe(200);

      // ── Refresh token rotation ──
      const post = (route: string, body: unknown) =>
        fetch(`${project.baseUrl}${route}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

      expect(loginBody.refreshToken).toBeTypeOf('string');

      const refreshed = await post('/auth/refresh', {
        refreshToken: adminTokens.refreshToken,
      });

      expect(refreshed.status).toBe(201);

      const rotated = (await refreshed.json()) as {
        accessToken: string;
        refreshToken: string;
      };

      expect(rotated.refreshToken).not.toBe(adminTokens.refreshToken);

      expect(
        (
          await fetch(`${project.baseUrl}/auth/me`, {
            headers: {
              Authorization: `Bearer ${rotated.accessToken}`,
            },
          })
        ).status,
      ).toBe(200);

      // Reusing the rotated-out token is treated as theft: it fails and the
      // whole session (including the freshly rotated token) is revoked.
      expect(
        (
          await post('/auth/refresh', {
            refreshToken: adminTokens.refreshToken,
          })
        ).status,
      ).toBe(401);

      expect(
        (
          await post('/auth/refresh', {
            refreshToken: rotated.refreshToken,
          })
        ).status,
      ).toBe(401);

      expect(
        (
          await post('/auth/refresh', {
            refreshToken: 'x'.repeat(48),
          })
        ).status,
      ).toBe(401);

      // ── Logout ──
      const secondLogin = (await (
        await post('/auth/login', { email, password })
      ).json()) as { refreshToken: string };

      expect(
        (
          await post('/auth/logout', {
            refreshToken: secondLogin.refreshToken,
          })
        ).status,
      ).toBe(204);

      expect(
        (
          await post('/auth/refresh', {
            refreshToken: secondLogin.refreshToken,
          })
        ).status,
      ).toBe(401);
    },
    180_000,
  );
});