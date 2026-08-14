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
    expect(result).toContain('npx prisma migrate deploy');
    expect(result).toContain('postgres:16-alpine');
    expect(result).toContain('POSTGRES_DB: my-api');
    expect(result).toContain('pg_isready');
    expect(result).toContain('redis:7-alpine');
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
    expect(result).toContain('npx prisma migrate deploy');
    expect(result).toContain('postgres:16-alpine');
    expect(result).not.toContain('redis:7-alpine');
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
});