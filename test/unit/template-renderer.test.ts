import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../../src/config/index.js';
import {
  createTemplateRenderer,
} from '../../src/rendering/template-renderer.js';

describe('TemplateRenderer', () => {
  it('renders projectName placeholders', () => {
    const config = resolveConfig({
      projectName: 'test-api',
    });

    const renderer = createTemplateRenderer();

    const result = renderer.render(
      '# {{projectName}}\n',
      config,
    );

    expect(result).toBe('# test-api\n');
  });

  it('renders multiple projectName placeholders', () => {
    const config = resolveConfig({
      projectName: 'test-api',
    });

    const renderer = createTemplateRenderer();

    const result = renderer.render(
      '{{projectName}} - {{ projectName }}',
      config,
    );

    expect(result).toBe(
      'test-api - test-api',
    );
  });

  it('renders auth module placeholders when JWT is enabled', () => {
    const config = resolveConfig({
      projectName: 'test-api',
      auth: 'jwt',
    });

    const renderer = createTemplateRenderer();

    const result = renderer.render(
      [
        '{{authModuleImport}}',
        '@Module({',
        '  imports: [{{authModule}}]',
        '})',
      ].join('\n'),
      config,
    );

    expect(result).toContain(
      "import { AuthModule } from './modules/auth/auth.module';",
    );

    expect(result).toContain(
      'imports: [AuthModule,]',
    );
  });

  it('removes auth module placeholders when JWT is disabled', () => {
    const config = resolveConfig({
      projectName: 'test-api',
    });

    const renderer = createTemplateRenderer();

    const result = renderer.render(
      [
        '{{authModuleImport}}',
        '@Module({',
        '  imports: [{{authModule}}]',
        '})',
      ].join('\n'),
      config,
    );

    expect(result).not.toContain(
      'AuthModule',
    );
  });

  it('renders swagger placeholders when swagger is enabled', () => {
    const config = resolveConfig({
      projectName: 'test-api',
      swagger: true,
    });

    const renderer = createTemplateRenderer();

    const result = renderer.render(
      [
        '{{swaggerImport}}',
        'async function bootstrap() {',
        '  {{swaggerSetup}}',
        '}',
      ].join('\n'),
      config,
    );

    expect(result).toContain(
      "import { setupSwagger } from './infrastructure/swagger/swagger.setup';",
    );

    expect(result).toContain(
      'setupSwagger(app);',
    );
  });

  it('removes swagger placeholders when swagger is disabled', () => {
    const config = resolveConfig({
      projectName: 'test-api',
      swagger: false,
    });

    const renderer = createTemplateRenderer();

    const result = renderer.render(
      [
        '{{swaggerImport}}',
        'async function bootstrap() {',
        '  {{swaggerSetup}}',
        '}',
      ].join('\n'),
      config,
    );

    expect(result).not.toContain(
      'setupSwagger',
    );
  });

  it('renders redis placeholders when redis is enabled', () => {
    const config = resolveConfig({
      projectName: 'test-api',
      redis: true,
    });

    const renderer = createTemplateRenderer();

    const result = renderer.render(
      [
        '{{redisModuleImport}}',
        'imports: [{{redisModule}}]',
        '{{redisEnvExample}}',
        '{{redisConfigType}}',
        '{{redisConfig}}',
        '{{redisEnvSchema}}',
      ].join('\n'),
      config,
    );

    expect(result).toContain(
      "import { RedisModule } from './redis/redis.module';",
    );
    expect(result).toContain('imports: [RedisModule,]');
    expect(result).toContain('REDIS_URL="redis://localhost:6379"');
    expect(result).toContain('readonly redis: {');
    expect(result).toContain('process.env.REDIS_URL');
    expect(result).toContain('REDIS_URL is required');
  });

  it('removes redis placeholders when redis is disabled', () => {
    const config = resolveConfig({
      projectName: 'test-api',
      redis: false,
    });

    const renderer = createTemplateRenderer();

    const result = renderer.render(
      [
        '{{redisModuleImport}}',
        'imports: [{{redisModule}}]',
        '{{redisEnvExample}}',
        '{{redisConfigType}}',
        '{{redisConfig}}',
        '{{redisEnvSchema}}',
      ].join('\n'),
      config,
    );

    expect(result).not.toContain('RedisModule');
    expect(result).not.toContain('REDIS_URL');
  });

  describe('configuration template rendering', () => {
    const envExampleTemplate = [
      'NODE_ENV=development',
      'PORT=3000',
      '{{databaseEnvExample}}',
      '{{redisEnvExample}}',
      '{{authEnvExample}}',
    ].join('\n');

    const configTemplate = [
      'export interface AppConfig {',
      '  readonly nodeEnv: string;',
      '  readonly port: number;',
      '  {{redisConfigType}}',
      '  {{authConfigType}}',
      '}',
      'export function loadConfiguration(): AppConfig {',
      '  return {',
      '    nodeEnv: process.env.NODE_ENV ?? "development",',
      '    port: Number(process.env.PORT ?? 3000),',
      '    {{redisConfig}}',
      '    {{authConfig}}',
      '  };',
      '}',
    ].join('\n');

    const envSchemaTemplate = [
      'const EnvironmentSchema = z.object({',
      '  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),',
      '  PORT: z.coerce.number().default(3000),',
      '  {{databaseEnvSchema}}',
      '  {{redisEnvSchema}}',
      '  {{authEnvSchema}}',
      '});',
    ].join('\n');

    it('renders Prisma only configuration', () => {
      const config = resolveConfig({
        projectName: 'prisma-only-app',
        database: 'postgres',
        orm: 'prisma',
        redis: false,
        auth: 'none',
      });

      const renderer = createTemplateRenderer();

      const envExample = renderer.render(envExampleTemplate, config);
      expect(envExample).toContain('DATABASE_URL="postgresql://postgres:postgres@localhost:5432/prisma-only-app?schema=public"');
      expect(envExample).not.toContain('REDIS_URL');
      expect(envExample).not.toContain('JWT_SECRET');

      const configTs = renderer.render(configTemplate, config);
      expect(configTs).not.toContain('readonly redis:');
      expect(configTs).not.toContain('readonly auth:');
      expect(configTs).not.toContain('redis:');
      expect(configTs).not.toContain('auth:');

      const envSchema = renderer.render(envSchemaTemplate, config);
      expect(envSchema).toContain('DATABASE_URL: z');
      expect(envSchema).not.toContain('REDIS_URL');
      expect(envSchema).not.toContain('JWT_SECRET');
    });

    it('renders Prisma + Redis configuration', () => {
      const config = resolveConfig({
        projectName: 'prisma-redis-app',
        database: 'postgres',
        orm: 'prisma',
        redis: true,
        auth: 'none',
      });

      const renderer = createTemplateRenderer();

      const envExample = renderer.render(envExampleTemplate, config);
      expect(envExample).toContain('DATABASE_URL=');
      expect(envExample).toContain('REDIS_URL="redis://localhost:6379"');
      expect(envExample).not.toContain('JWT_SECRET');

      const configTs = renderer.render(configTemplate, config);
      expect(configTs).toContain('readonly redis: {');
      expect(configTs).toContain('redis: {');
      expect(configTs).not.toContain('readonly auth:');
      expect(configTs).not.toContain('auth:');

      const envSchema = renderer.render(envSchemaTemplate, config);
      expect(envSchema).toContain('DATABASE_URL');
      expect(envSchema).toContain('REDIS_URL: z');
      expect(envSchema).not.toContain('JWT_SECRET');
    });

    it('renders Prisma + JWT configuration', () => {
      const config = resolveConfig({
        projectName: 'prisma-jwt-app',
        database: 'postgres',
        orm: 'prisma',
        redis: false,
        auth: 'jwt',
      });

      const renderer = createTemplateRenderer();

      const envExample = renderer.render(envExampleTemplate, config);
      expect(envExample).toContain('DATABASE_URL=');
      expect(envExample).toContain('JWT_SECRET="replace-this-with-a-random-secret-at-least-32-characters-long"');
      expect(envExample).not.toContain('REDIS_URL');

      const configTs = renderer.render(configTemplate, config);
      expect(configTs).toContain('readonly auth: {');
      expect(configTs).toContain('auth: {');
      expect(configTs).toContain('process.env.JWT_SECRET');
      expect(configTs).not.toContain('readonly redis:');
      expect(configTs).not.toContain('redis:');

      const envSchema = renderer.render(envSchemaTemplate, config);
      expect(envSchema).toContain('DATABASE_URL');
      expect(envSchema).toContain('JWT_SECRET: z');
      expect(envSchema).not.toContain('REDIS_URL');
    });

    it('renders Prisma + Redis + JWT configuration', () => {
      const config = resolveConfig({
        projectName: 'prisma-redis-jwt-app',
        database: 'postgres',
        orm: 'prisma',
        redis: true,
        auth: 'jwt',
      });

      const renderer = createTemplateRenderer();

      const envExample = renderer.render(envExampleTemplate, config);
      expect(envExample).toContain('DATABASE_URL=');
      expect(envExample).toContain('REDIS_URL=');
      expect(envExample).toContain('JWT_SECRET=');

      const configTs = renderer.render(configTemplate, config);
      expect(configTs).toContain('readonly redis: {');
      expect(configTs).toContain('readonly auth: {');
      expect(configTs).toContain('redis: {');
      expect(configTs).toContain('auth: {');

      const envSchema = renderer.render(envSchemaTemplate, config);
      expect(envSchema).toContain('DATABASE_URL');
      expect(envSchema).toContain('REDIS_URL: z');
      expect(envSchema).toContain('JWT_SECRET: z');
    });

    it('does not emit REDIS_URL when redis is disabled', () => {
      const config = resolveConfig({
        projectName: 'no-redis-app',
        redis: false,
      });

      const renderer = createTemplateRenderer();
      const envExample = renderer.render(envExampleTemplate, config);
      expect(envExample).not.toContain('REDIS_URL');
    });

    it('does not emit JWT_SECRET when JWT is disabled', () => {
      const config = resolveConfig({
        projectName: 'no-jwt-app',
        auth: 'none',
      });

      const renderer = createTemplateRenderer();
      const envExample = renderer.render(envExampleTemplate, config);
      expect(envExample).not.toContain('JWT_SECRET');
    });
  });

  it('leaves unknown placeholders unchanged', () => {
    const config = resolveConfig({
      projectName: 'test-api',
    });

    const renderer = createTemplateRenderer();

    const result = renderer.render(
      '{{unknown}}',
      config,
    );

    expect(result).toBe('{{unknown}}');
  });

  it('renders Docker compose tokens when postgres, redis, and jwt are enabled', () => {
    const config = resolveConfig({
      projectName: 'my-api',
      redis: true,
      auth: 'jwt',
      docker: true,
    });

    const renderer = createTemplateRenderer();

    const template = [
      '{{dockerComposeApiEnvironment}}',
      '{{dockerComposeApiDependsOn}}',
      '{{dockerComposeApiCommand}}',
      '{{dockerComposePostgresService}}',
      '{{dockerComposeRedisService}}',
      '{{dockerComposeVolumes}}',
    ].join('\n');

    const result = renderer.render(template, config);

    expect(result).toContain('DATABASE_URL');
    expect(result).toContain('@postgres:5432/my-api');
    expect(result).toContain('REDIS_URL');
    expect(result).toContain('redis://redis:6379');
    expect(result).toContain('JWT_SECRET');
    expect(result).toContain('depends_on:');
    expect(result).toContain('postgres:\n        condition: service_healthy');
    expect(result).toContain('redis:\n        condition: service_healthy');
    expect(result).toContain('postgres:16-alpine');
    expect(result).toContain('POSTGRES_DB: my-api');
    expect(result).toContain('"5432:5432"');
    expect(result).toContain('pg_isready');
    expect(result).toContain('redis:7-alpine');
    expect(result).toContain('"6379:6379"');
    expect(result).toContain('redis-cli');
    expect(result).toContain('ping');
    expect(result).toContain('volumes:');
    expect(result).toContain('postgres_data:');
    expect(result).toContain('redis_data:');
  });

  it('renders Docker compose tokens correctly when redis is disabled', () => {
    const config = resolveConfig({
      projectName: 'my-api',
      redis: false,
      auth: 'none',
      docker: true,
    });

    const renderer = createTemplateRenderer();

    const template = [
      '{{dockerComposeApiEnvironment}}',
      '{{dockerComposeApiDependsOn}}',
      '{{dockerComposeApiCommand}}',
      '{{dockerComposePostgresService}}',
      '{{dockerComposeRedisService}}',
      '{{dockerComposeVolumes}}',
    ].join('\n');

    const result = renderer.render(template, config);

    expect(result).toContain('DATABASE_URL');
    expect(result).not.toContain('REDIS_URL');
    expect(result).not.toContain('JWT_SECRET');
    expect(result).toContain('depends_on:');
    expect(result).toContain('postgres:\n        condition: service_healthy');
    expect(result).not.toContain('redis:\n        condition: service_healthy');
    expect(result).toContain('./node_modules/.bin/prisma migrate deploy');
    expect(result).toContain('postgres:16-alpine');
    expect(result).toContain('"5432:5432"');
    expect(result).not.toContain('redis:7-alpine');
    expect(result).not.toContain('"6379:6379"');
    expect(result).toContain('postgres_data:');
    expect(result).not.toContain('redis_data:');
  });

  it('renders CI workflow tokens when Prisma and testing are enabled', () => {
    const config = resolveConfig({
      projectName: 'my-api',
      ci: true,
      testing: true,
      database: 'postgres',
      orm: 'prisma',
    });

    const renderer = createTemplateRenderer();

    const template = [
      'steps:',
      '  - name: Install dependencies',
      '    run: npm install',
      '{{ciPrismaStep}}',
      '  - name: Run typecheck',
      '    run: npm run typecheck',
      '{{ciTestStep}}',
      '  - name: Run build',
      '    run: npm run build',
    ].join('\n');

    const result = renderer.render(template, config);

    expect(result).toContain('Generate Prisma Client');
    expect(result).toContain('npx prisma generate');
    expect(result).toContain('DATABASE_URL');
    expect(result).toContain('Run unit tests');
    expect(result).toContain('npm test');
  });

  it('omits CI workflow steps when Prisma or testing is disabled', () => {
    const config = resolveConfig({
      projectName: 'my-api',
      ci: true,
      testing: false,
    });

    const renderer = createTemplateRenderer();

    const template = [
      'steps:',
      '  - name: Install dependencies',
      '    run: npm install',
      '{{ciPrismaStep}}',
      '  - name: Run typecheck',
      '    run: npm run typecheck',
      '{{ciTestStep}}',
      '  - name: Run build',
      '    run: npm run build',
    ].join('\n');

    const result = renderer.render(template, config);

    expect(result).not.toContain('Run unit tests');
    expect(result).not.toContain('npm test');
  });

  describe('testing template rendering', () => {
    const appModuleSpecTemplate = [
      '{{testingTestEnv}}',
      '',
      "import { Test, TestingModule } from '@nestjs/testing';",
      '',
      "describe('AppModule', () => {",
      "  it('should compile the module dependency tree', async () => {",
      "    const { AppModule } = await import('./app.module');",
      '  });',
      '});',
    ].join('\n');

    it('renders Prisma only test setup containing DATABASE_URL only', () => {
      const config = resolveConfig({
        projectName: 'test-api',
        database: 'postgres',
        orm: 'prisma',
        redis: false,
        auth: 'none',
        testing: true,
      });

      const renderer = createTemplateRenderer();
      const result = renderer.render(appModuleSpecTemplate, config);

      expect(result).toContain('process.env.DATABASE_URL =');
      expect(result).toContain('postgresql://postgres:postgres@localhost:5432/test_db?schema=public');
      expect(result).not.toContain('REDIS_URL');
      expect(result).not.toContain('JWT_SECRET');
      expect(result).toContain("const { AppModule } = await import('./app.module');");
    });

    it('renders Redis-enabled test setup containing DATABASE_URL and REDIS_URL', () => {
      const config = resolveConfig({
        projectName: 'test-api',
        database: 'postgres',
        orm: 'prisma',
        redis: true,
        auth: 'none',
        testing: true,
      });

      const renderer = createTemplateRenderer();
      const result = renderer.render(appModuleSpecTemplate, config);

      expect(result).toContain('process.env.DATABASE_URL =');
      expect(result).toContain('process.env.REDIS_URL =');
      expect(result).toContain('redis://localhost:6379');
      expect(result).not.toContain('JWT_SECRET');
    });

    it('renders JWT-enabled test setup containing DATABASE_URL and JWT_SECRET', () => {
      const config = resolveConfig({
        projectName: 'test-api',
        database: 'postgres',
        orm: 'prisma',
        redis: false,
        auth: 'jwt',
        testing: true,
      });

      const renderer = createTemplateRenderer();
      const result = renderer.render(appModuleSpecTemplate, config);

      expect(result).toContain('process.env.DATABASE_URL =');
      expect(result).toContain('process.env.JWT_SECRET =');
      expect(result).toContain('test-secret-key-minimum-32-chars-long');
      expect(result).not.toContain('REDIS_URL');
    });

    it('renders full-feature test setup containing all required variables', () => {
      const config = resolveConfig({
        projectName: 'test-api',
        database: 'postgres',
        orm: 'prisma',
        redis: true,
        auth: 'jwt',
        testing: true,
      });

      const renderer = createTemplateRenderer();
      const result = renderer.render(appModuleSpecTemplate, config);

      expect(result).toContain('process.env.DATABASE_URL =');
      expect(result).toContain('process.env.REDIS_URL =');
      expect(result).toContain('process.env.JWT_SECRET =');
    });

    it('omits Redis and Auth variables when disabled', () => {
      const config = resolveConfig({
        projectName: 'test-api',
        database: 'postgres',
        orm: 'prisma',
        redis: false,
        auth: 'none',
        testing: true,
      });

      const renderer = createTemplateRenderer();
      const result = renderer.render(appModuleSpecTemplate, config);

      expect(result).not.toContain('REDIS_URL');
      expect(result).not.toContain('JWT_SECRET');
    });
  });

  describe('README rendering', () => {
    const readmeTemplate = [
      '# {{projectName}}',
      '## Features',
      '{{readmeFeatures}}',
      '## Prerequisites',
      '{{readmePrerequisites}}',
      '## Installation & Setup',
      '{{readmeInstallation}}',
      '## Environment Variables',
      '{{readmeEnvironment}}',
      '## Development',
      '{{readmeDevelopment}}',
      '{{readmeDatabase}}',
      '{{readmeAuth}}',
      '{{readmeSwagger}}',
      '{{readmeRedis}}',
      '{{readmeDocker}}',
      '{{readmeTesting}}',
      '{{readmeCi}}',
      '## Production',
      '{{readmeProduction}}',
    ].join('\n');

    it('renders default project README with default features and omits non-default features', () => {
      const config = resolveConfig({
        projectName: 'default-app',
      });

      const renderer = createTemplateRenderer();
      const result = renderer.render(readmeTemplate, config);

      expect(result).toContain('# default-app');
      expect(result).toContain('PostgreSQL integration with Prisma ORM');
      expect(result).toContain('Interactive OpenAPI / Swagger documentation');
      expect(result).toContain('Multi-stage Dockerfile and Docker Compose');
      expect(result).toContain('Unit and deterministic E2E test suites');
      expect(result).toContain('Automated GitHub Actions workflow');

      // Check sections
      expect(result).toContain('## Database & Prisma');
      expect(result).toContain('npx prisma migrate dev');
      expect(result).toContain('## API Documentation (Swagger)');
      expect(result).toContain('http://localhost:3000/api/docs');
      expect(result).toContain('## Docker');
      expect(result).toContain('npm run docker:up');
      expect(result).toContain('## Testing');
      expect(result).toContain('npm test');
      expect(result).toContain('## Continuous Integration');

      // Verify disabled features are omitted
      expect(result).not.toContain('## Redis Infrastructure');
      expect(result).not.toContain('## Authentication');
      expect(result).not.toContain('REDIS_URL');
      expect(result).not.toContain('JWT_SECRET');
    });

    it('renders Redis section when Redis is enabled', () => {
      const config = resolveConfig({
        projectName: 'redis-app',
        redis: true,
      });

      const renderer = createTemplateRenderer();
      const result = renderer.render(readmeTemplate, config);

      expect(result).toContain('## Redis Infrastructure');
      expect(result).toContain('REDIS_URL');
      expect(result).toContain('RedisService');
      expect(result).not.toContain('caching system');
    });

    it('renders Auth section when JWT is enabled', () => {
      const config = resolveConfig({
        projectName: 'auth-app',
        auth: 'jwt',
      });

      const renderer = createTemplateRenderer();
      const result = renderer.render(readmeTemplate, config);

      expect(result).toContain('## Authentication');
      expect(result).toContain('POST /auth/register');
      expect(result).toContain('POST /auth/login');
      expect(result).toContain('GET /auth/me');
      expect(result).toContain('JWT_SECRET');
    });

    it('omits Docker section when Docker is disabled', () => {
      const config = resolveConfig({
        projectName: 'no-docker-app',
        docker: false,
      });

      const renderer = createTemplateRenderer();
      const result = renderer.render(readmeTemplate, config);

      expect(result).not.toContain('## Docker');
      expect(result).not.toContain('docker:up');
    });

    it('omits Testing section when testing is disabled', () => {
      const config = resolveConfig({
        projectName: 'no-test-app',
        testing: false,
      });

      const renderer = createTemplateRenderer();
      const result = renderer.render(readmeTemplate, config);

      expect(result).not.toContain('## Testing');
      expect(result).not.toContain('npm test');
    });

    it('omits CI section when CI is disabled', () => {
      const config = resolveConfig({
        projectName: 'no-ci-app',
        ci: false,
      });

      const renderer = createTemplateRenderer();
      const result = renderer.render(readmeTemplate, config);

      expect(result).not.toContain('## Continuous Integration');
      expect(result).not.toContain('.github/workflows/ci.yml');
    });

    it('renders full-feature README containing all feature sections', () => {
      const config = resolveConfig({
        projectName: 'full-app',
        database: 'postgres',
        orm: 'prisma',
        redis: true,
        auth: 'jwt',
        swagger: true,
        docker: true,
        ci: true,
        testing: true,
      });

      const renderer = createTemplateRenderer();
      const result = renderer.render(readmeTemplate, config);

      expect(result).toContain('## Database & Prisma');
      expect(result).toContain('## Authentication');
      expect(result).toContain('## API Documentation (Swagger)');
      expect(result).toContain('## Redis Infrastructure');
      expect(result).toContain('## Docker');
      expect(result).toContain('## Testing');
      expect(result).toContain('## Continuous Integration');
      expect(result).toContain('## Production');

      expect(result).toContain('DATABASE_URL');
      expect(result).toContain('REDIS_URL');
      expect(result).toContain('JWT_SECRET');
    });

    it('renders README with pnpm commands and ensures zero npm/npx contamination', () => {
      const config = resolveConfig({
        projectName: 'pnpm-app',
        packageManager: 'pnpm',
        database: 'postgres',
        orm: 'prisma',
        testing: true,
        docker: true,
        ci: true,
      });

      const renderer = createTemplateRenderer();
      const result = renderer.render(readmeTemplate, config);

      expect(result).toContain('https://pnpm.io/');
      expect(result).toContain('pnpm install');
      expect(result).toContain('pnpm run start:dev');
      expect(result).toContain('pnpm run typecheck');
      expect(result).toContain('pnpm run build');
      expect(result).toContain('pnpm exec prisma generate');
      expect(result).toContain('pnpm exec prisma migrate dev');
      expect(result).toContain('pnpm test');
      expect(result).toContain('pnpm run test:watch');
      expect(result).toContain('pnpm run docker:up');
      expect(result).not.toMatch(/\bnpm install\b/);
      expect(result).not.toMatch(/\bnpm run\b/);
      expect(result).not.toMatch(/\bnpx prisma\b/);
    });

    it('renders README with yarn commands and ensures zero npm/npx contamination', () => {
      const config = resolveConfig({
        projectName: 'yarn-app',
        packageManager: 'yarn',
        database: 'postgres',
        orm: 'prisma',
        testing: true,
        docker: true,
        ci: true,
      });

      const renderer = createTemplateRenderer();
      const result = renderer.render(readmeTemplate, config);

      expect(result).toContain('https://yarnpkg.com/');
      expect(result).toContain('yarn install');
      expect(result).toContain('yarn start:dev');
      expect(result).toContain('yarn typecheck');
      expect(result).toContain('yarn build');
      expect(result).toContain('yarn prisma generate');
      expect(result).toContain('yarn prisma migrate dev');
      expect(result).toContain('yarn test');
      expect(result).toContain('yarn test:watch');
      expect(result).toContain('yarn docker:up');
      expect(result).not.toMatch(/\bnpm install\b/);
      expect(result).not.toMatch(/\bnpm run\b/);
      expect(result).not.toMatch(/\bnpx prisma\b/);
    });
  });
});