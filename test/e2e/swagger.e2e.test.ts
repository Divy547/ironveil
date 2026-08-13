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
  'postgresql://postgres:postgres@localhost:5432/forgekit-swagger-e2e?schema=public';

const JWT_SECRET =
  'forgekit-swagger-e2e-super-secret-key-2026';

describe('ForgeKit Swagger E2E', () => {
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
    'serves Swagger UI and OpenAPI spec when swagger is enabled',
    async () => {
      project = await createGeneratedProject(
        resolveConfig({
          projectName: 'swagger-enabled-api',
          swagger: true,
          auth: 'jwt',
          database: 'postgres',
          orm: 'prisma',
        }),
        'forgekit-swagger-enabled-e2e',
      );

      await project.writeEnv({
        databaseUrl: DATABASE_URL,
        jwtSecret: JWT_SECRET,
      });

      await project.install();
      await project.prismaGenerate();
      await project.prismaMigrateDeploy();
      await project.build();

      server = await startTestServer(
        project.root,
        project.baseUrl,
      );

      // Verify GET /api/docs succeeds and serves Swagger UI HTML
      const docsResponse = await fetch(`${project.baseUrl}/api/docs`);
      expect(docsResponse.status).toBe(200);
      const docsHtml = await docsResponse.text();
      expect(docsHtml).toContain('swagger-ui');

      // Verify GET /api/docs-json succeeds and returns valid OpenAPI metadata
      const jsonResponse = await fetch(`${project.baseUrl}/api/docs-json`);
      expect(jsonResponse.status).toBe(200);
      const openApiSpec = (await jsonResponse.json()) as {
        openapi?: string;
        swagger?: string;
        info?: {
          title?: string;
          version?: string;
        };
      };

      const specVersion = openApiSpec.openapi ?? openApiSpec.swagger;
      expect(specVersion).toBeDefined();
      expect(specVersion).toMatch(/^3\./);
      expect(openApiSpec.info?.title).toBe('swagger-enabled-api');
    },
    180_000,
  );

  it(
    'does not expose Swagger UI or OpenAPI spec when swagger is disabled',
    async () => {
      project = await createGeneratedProject(
        resolveConfig({
          projectName: 'swagger-disabled-api',
          swagger: false,
          auth: 'jwt',
          database: 'postgres',
          orm: 'prisma',
        }),
        'forgekit-swagger-disabled-e2e',
      );

      await project.writeEnv({
        databaseUrl: DATABASE_URL,
        jwtSecret: JWT_SECRET,
      });

      await project.install();
      await project.prismaGenerate();
      await project.prismaMigrateDeploy();
      await project.build();

      // Verify package.json does NOT contain @nestjs/swagger
      const packageJsonContent = await project.fs.readFile(
        `${project.root}/package.json`,
      );
      const packageJson = JSON.parse(packageJsonContent);
      expect(packageJson.dependencies?.['@nestjs/swagger']).toBeUndefined();

      // Verify src/infrastructure/swagger directory does NOT exist
      const swaggerDirExists = await project.fs.exists(
        `${project.root}/src/infrastructure/swagger`,
      );
      expect(swaggerDirExists).toBe(false);

      server = await startTestServer(
        project.root,
        project.baseUrl,
      );

      // Verify GET /api/docs return 404
      const docsResponse = await fetch(`${project.baseUrl}/api/docs`);
      expect(docsResponse.status).toBe(404);

      // Verify GET /api/docs-json return 404
      const jsonResponse = await fetch(`${project.baseUrl}/api/docs-json`);
      expect(jsonResponse.status).toBe(404);
    },
    180_000,
  );
});
