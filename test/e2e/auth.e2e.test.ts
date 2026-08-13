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

const DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/forgekit-auth-e2e?schema=public';

const JWT_SECRET =
  'forgekit-e2e-super-secret-key-2026-change-me';

describe('ForgeKit JWT Auth E2E', () => {
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
          'forgekit-auth-e2e',
        );

      await project.writeEnv({
        databaseUrl:
          DATABASE_URL,
        jwtSecret: JWT_SECRET,
      });

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
          sub: string;
          email: string;
          iat: number;
        };

      expect(
        meBody.sub,
      ).toBe(registeredUser.id);

      expect(
        meBody.email,
      ).toBe(email);

      expect(
        meBody.iat,
      ).toBeTypeOf('number');
    },
    180_000,
  );
});