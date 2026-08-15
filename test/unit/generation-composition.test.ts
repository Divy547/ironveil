import {
  mkdtemp,
  rm,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  afterEach,
  describe,
  expect,
  it,
} from 'vitest';

import { resolveConfig } from '../../src/config/index.js';
import {
  createGenerationPlan,
} from '../../src/generators/core/generation-plan.js';
import {
  createGenerators,
} from '../../src/generators/core/generator-registry.js';
import {
  generateProject,
} from '../../src/generators/generate-project.js';
import {
  createFileSystem,
} from '../../src/utils/filesystem.js';

describe('Generator composition', () => {
  let temporaryDirectory: string;

  afterEach(async () => {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, {
        recursive: true,
        force: true,
      });
    }
  });

  function getGeneratorNames(
    overrides: Parameters<typeof resolveConfig>[0],
  ): string[] {
    const config = resolveConfig({
      projectName: 'test-api',
      ...overrides,
    });

    const plan = createGenerationPlan(
      config,
      createGenerators(),
    );

    return plan.generators.map(
      (generator) => generator.name,
    );
  }

  it('selects the default feature set', () => {
    expect(
      getGeneratorNames({}),
    ).toEqual([
      'base',
      'config',
      'prisma',
      'swagger',
      'testing',
      'docker',
      'ci',
    ]);
  });

  it('includes JWT authentication when enabled', () => {
    expect(
      getGeneratorNames({
        auth: 'jwt',
      }),
    ).toEqual([
      'base',
      'config',
      'prisma',
      'auth',
      'swagger',
      'testing',
      'docker',
      'ci',
    ]);
  });

  it('does not include authentication when disabled', () => {
    expect(
      getGeneratorNames({
        auth: 'none',
      }),
    ).toEqual([
      'base',
      'config',
      'prisma',
      'swagger',
      'testing',
      'docker',
      'ci',
    ]);
  });

  it('preserves registry ordering', () => {
    expect(
      getGeneratorNames({
        auth: 'jwt',
      }),
    ).toEqual([
      'base',
      'config',
      'prisma',
      'auth',
      'swagger',
      'testing',
      'docker',
      'ci',
    ]);
  });

  it('runs Prisma and JWT together without output collisions', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(
        os.tmpdir(),
        'forgekit-composition-',
      ),
    );

    const config = resolveConfig({
      projectName: 'test-api',
      auth: 'jwt',
    });

    const { destination } = await generateProject(
      config,
      temporaryDirectory,
    );

    const fs = createFileSystem();

    const expectedFiles = [
      'src/app.module.ts',

      'src/infrastructure/config/configuration.ts',
      'src/infrastructure/config/environment.ts',

      'prisma/schema.prisma',
      'prisma/migrations/0001_init/migration.sql',
      'src/infrastructure/prisma/prisma.module.ts',
      'src/infrastructure/prisma/prisma.service.ts',

      'src/modules/auth/auth.module.ts',
      'src/modules/auth/auth.service.ts',
      'src/modules/auth/auth.controller.ts',
      'src/modules/auth/guards/jwt-auth.guard.ts',
      'src/modules/auth/strategies/jwt.strategy.ts',
      'src/modules/auth/types/jwt-payload.type.ts',
      'src/modules/auth/dto/register.dto.ts',
      'src/modules/auth/dto/login.dto.ts',
    ];

    for (const file of expectedFiles) {
      expect(
        await fs.exists(
          path.join(destination, file),
        ),
        `Expected generated file: ${file}`,
      ).toBe(true);
    }

    const appModule = await fs.readFile(
      path.join(
        destination,
        'src',
        'app.module.ts',
      ),
    );

    expect(appModule).toContain(
      "import { InfrastructureModule } from './infrastructure/infrastructure.module';",
    );

    expect(appModule).toContain(
      "import { AuthModule } from './modules/auth/auth.module';",
    );

    expect(appModule).toContain(
      'InfrastructureModule',
    );

    expect(appModule).toContain(
      'AuthModule',
    );

    const authService = await fs.readFile(
      path.join(
        destination,
        'src',
        'modules',
        'auth',
        'auth.service.ts',
      ),
    );

    expect(authService).toContain(
      "from '../../infrastructure/prisma/prisma.service';",
    );

    const prismaSchema = await fs.readFile(
      path.join(
        destination,
        'prisma',
        'schema.prisma',
      ),
    );

    expect(prismaSchema).toContain(
      'model User',
    );

    const packageJson = JSON.parse(
      await fs.readFile(
        path.join(
          destination,
          'package.json',
        ),
      ),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(
      packageJson.dependencies?.[
        '@prisma/client'
      ],
    ).toBe('6.19.3');

    expect(
      packageJson.dependencies?.[
        '@nestjs/jwt'
      ],
    ).toBe('11.0.2');

    expect(
      packageJson.dependencies?.[
        '@nestjs/passport'
      ],
    ).toBe('11.0.5');

    expect(
      packageJson.dependencies?.bcrypt,
    ).toBe('6.0.0');

    expect(
      packageJson.devDependencies?.[
        '@types/bcrypt'
      ],
    ).toBe('6.0.0');

    expect(
      packageJson.devDependencies?.[
        '@types/passport-jwt'
      ],
    ).toBe('4.0.1');

    const envExample = await fs.readFile(
      path.join(destination, '.env.example'),
    );
    expect(envExample).toContain('JWT_SECRET="replace-this-with-a-random-secret-at-least-32-characters-long"');

    const envTs = await fs.readFile(
      path.join(destination, 'src', 'infrastructure', 'config', 'environment.ts'),
    );
    expect(envTs).toContain('JWT_SECRET: z');

    const configTs = await fs.readFile(
      path.join(destination, 'src', 'infrastructure', 'config', 'configuration.ts'),
    );
    expect(configTs).toContain('readonly auth: {');
    expect(configTs).toContain('auth: {');
    expect(configTs).toContain('process.env.JWT_SECRET');
  });

  it('does not generate auth output when JWT is disabled', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(
        os.tmpdir(),
        'forgekit-composition-',
      ),
    );

    const config = resolveConfig({
      projectName: 'test-api',
      auth: 'none',
    });

    const { destination } = await generateProject(
      config,
      temporaryDirectory,
    );

    const fs = createFileSystem();

    expect(
      await fs.exists(
        path.join(
          destination,
          'src',
          'modules',
          'auth',
        ),
      ),
    ).toBe(false);

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

    expect(
      await fs.exists(
        path.join(
          destination,
          'prisma',
          'schema.prisma',
        ),
      ),
    ).toBe(true);

    const envExample = await fs.readFile(
      path.join(destination, '.env.example'),
    );
    expect(envExample).not.toContain('JWT_SECRET');

    const envTs = await fs.readFile(
      path.join(destination, 'src', 'infrastructure', 'config', 'environment.ts'),
    );
    expect(envTs).not.toContain('JWT_SECRET');

    const configTs = await fs.readFile(
      path.join(destination, 'src', 'infrastructure', 'config', 'configuration.ts'),
    );
    expect(configTs).not.toContain('auth:');
    expect(configTs).not.toContain('JWT_SECRET');
  });

  it('does not generate Redis output when redis is disabled', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(
        os.tmpdir(),
        'forgekit-composition-',
      ),
    );

    const config = resolveConfig({
      projectName: 'test-api',
      redis: false,
    });

    const { destination } = await generateProject(
      config,
      temporaryDirectory,
    );

    const fs = createFileSystem();

    expect(
      await fs.exists(
        path.join(
          destination,
          'src',
          'infrastructure',
          'redis',
        ),
      ),
    ).toBe(false);

    const infraModule = await fs.readFile(
      path.join(
        destination,
        'src',
        'infrastructure',
        'infrastructure.module.ts',
      ),
    );

    expect(infraModule).not.toContain('RedisModule');

    const envExample = await fs.readFile(
      path.join(destination, '.env.example'),
    );

    expect(envExample).not.toContain('REDIS_URL');

    const environmentTs = await fs.readFile(
      path.join(
        destination,
        'src',
        'infrastructure',
        'config',
        'environment.ts',
      ),
    );

    expect(environmentTs).not.toContain('REDIS_URL');

    const configurationTs = await fs.readFile(
      path.join(
        destination,
        'src',
        'infrastructure',
        'config',
        'configuration.ts',
      ),
    );

    expect(configurationTs).not.toContain('redis');

    const packageJson = JSON.parse(
      await fs.readFile(
        path.join(destination, 'package.json'),
      ),
    ) as { dependencies?: Record<string, string> };

    expect(packageJson.dependencies?.ioredis).toBeUndefined();
  });

  it('generates Redis output when redis is enabled', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(
        os.tmpdir(),
        'forgekit-composition-',
      ),
    );

    const config = resolveConfig({
      projectName: 'test-api',
      redis: true,
    });

    const { destination } = await generateProject(
      config,
      temporaryDirectory,
    );

    const fs = createFileSystem();

    expect(
      await fs.exists(
        path.join(
          destination,
          'src',
          'infrastructure',
          'redis',
          'redis.module.ts',
        ),
      ),
    ).toBe(true);

    expect(
      await fs.exists(
        path.join(
          destination,
          'src',
          'infrastructure',
          'redis',
          'redis.service.ts',
        ),
      ),
    ).toBe(true);

    const infraModule = await fs.readFile(
      path.join(
        destination,
        'src',
        'infrastructure',
        'infrastructure.module.ts',
      ),
    );

    expect(infraModule).toContain("import { RedisModule } from './redis/redis.module';");
    expect(infraModule).toContain('RedisModule');

    const envExample = await fs.readFile(
      path.join(destination, '.env.example'),
    );

    expect(envExample).toContain('REDIS_URL="redis://localhost:6379"');

    const environmentTs = await fs.readFile(
      path.join(
        destination,
        'src',
        'infrastructure',
        'config',
        'environment.ts',
      ),
    );

    expect(environmentTs).toContain('REDIS_URL: z');

    const configurationTs = await fs.readFile(
      path.join(
        destination,
        'src',
        'infrastructure',
        'config',
        'configuration.ts',
      ),
    );

    expect(configurationTs).toContain('readonly redis:');
    expect(configurationTs).toContain('redis: {');

    const packageJson = JSON.parse(
      await fs.readFile(
        path.join(destination, 'package.json'),
      ),
    ) as { dependencies?: Record<string, string> };

    expect(packageJson.dependencies?.ioredis).toBe('5.6.0');
  });

  it('runs Redis, Prisma, JWT, and Swagger together without collisions', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(
        os.tmpdir(),
        'forgekit-composition-',
      ),
    );

    const config = resolveConfig({
      projectName: 'full-stack-api',
      redis: true,
      auth: 'jwt',
      swagger: true,
    });

    const { destination } = await generateProject(
      config,
      temporaryDirectory,
    );

    const fs = createFileSystem();

    const expectedFiles = [
      'src/app.module.ts',
      'src/main.ts',
      'src/infrastructure/infrastructure.module.ts',
      'src/infrastructure/config/configuration.ts',
      'src/infrastructure/config/environment.ts',
      'src/infrastructure/prisma/prisma.module.ts',
      'src/infrastructure/prisma/prisma.service.ts',
      'src/infrastructure/redis/redis.module.ts',
      'src/infrastructure/redis/redis.service.ts',
      'src/infrastructure/swagger/swagger.setup.ts',
      'src/modules/auth/auth.module.ts',
      'src/modules/auth/auth.service.ts',
    ];

    for (const file of expectedFiles) {
      expect(
        await fs.exists(
          path.join(destination, file),
        ),
        `Expected file: ${file}`,
      ).toBe(true);
    }

    const packageJson = JSON.parse(
      await fs.readFile(
        path.join(destination, 'package.json'),
      ),
    ) as { dependencies?: Record<string, string> };

    expect(packageJson.dependencies?.ioredis).toBe('5.6.0');
    expect(packageJson.dependencies?.['@prisma/client']).toBe('6.19.3');
    expect(packageJson.dependencies?.['@nestjs/jwt']).toBe('11.0.2');
    expect(packageJson.dependencies?.['@nestjs/swagger']).toBe('11.0.6');
  });

  it('does not generate Docker files when docker is disabled', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(
        os.tmpdir(),
        'forgekit-composition-',
      ),
    );

    const config = resolveConfig({
      projectName: 'test-api',
      docker: false,
    });

    const { destination } = await generateProject(
      config,
      temporaryDirectory,
    );

    const fs = createFileSystem();

    expect(
      await fs.exists(
        path.join(destination, 'Dockerfile'),
      ),
    ).toBe(false);

    expect(
      await fs.exists(
        path.join(destination, 'docker-compose.yml'),
      ),
    ).toBe(false);

    expect(
      await fs.exists(
        path.join(destination, '.dockerignore'),
      ),
    ).toBe(false);

    const packageJson = JSON.parse(
      await fs.readFile(
        path.join(destination, 'package.json'),
      ),
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.['docker:up']).toBeUndefined();
    expect(packageJson.scripts?.['docker:down']).toBeUndefined();
  });

  it('generates Docker files when docker is enabled (postgres, no redis)', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(
        os.tmpdir(),
        'forgekit-composition-',
      ),
    );

    const config = resolveConfig({
      projectName: 'test-api',
      docker: true,
      redis: false,
    });

    const { destination } = await generateProject(
      config,
      temporaryDirectory,
    );

    const fs = createFileSystem();

    expect(
      await fs.exists(path.join(destination, 'Dockerfile')),
    ).toBe(true);

    expect(
      await fs.exists(path.join(destination, 'docker-compose.yml')),
    ).toBe(true);

    expect(
      await fs.exists(path.join(destination, '.dockerignore')),
    ).toBe(true);

    const compose = await fs.readFile(
      path.join(destination, 'docker-compose.yml'),
    );

    expect(compose).toContain('postgres:');
    expect(compose).not.toContain('redis:');
    expect(compose).toContain('DATABASE_URL');
    expect(compose).toContain('@postgres:5432/');
    expect(compose).not.toContain('REDIS_URL');
    expect(compose).toContain('npx prisma migrate deploy');
    expect(compose).toContain('pg_isready');
    expect(compose).not.toContain('redis-cli');
    expect(compose).toContain('postgres_data:');
    expect(compose).not.toContain('redis_data:');

    const packageJson = JSON.parse(
      await fs.readFile(
        path.join(destination, 'package.json'),
      ),
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.['docker:up']).toBe('docker compose up --build');
    expect(packageJson.scripts?.['docker:down']).toBe('docker compose down');
  });

  it('generates Redis service in docker-compose when docker=true and redis=true', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(
        os.tmpdir(),
        'forgekit-composition-',
      ),
    );

    const config = resolveConfig({
      projectName: 'test-api',
      docker: true,
      redis: true,
    });

    const { destination } = await generateProject(
      config,
      temporaryDirectory,
    );

    const fs = createFileSystem();

    const compose = await fs.readFile(
      path.join(destination, 'docker-compose.yml'),
    );

    expect(compose).toContain('postgres:');
    expect(compose).toContain('redis:');
    expect(compose).toContain('REDIS_URL');
    expect(compose).toContain('redis://redis:6379');
    expect(compose).toContain('redis-cli');
    expect(compose).toContain('ping');
    expect(compose).toContain('redis_data:');
    expect(compose).toContain('postgres_data:');
    expect(compose).toContain('condition: service_healthy');
  });

  it('runs Redis, Prisma, JWT, Swagger, and Docker together without collisions', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(
        os.tmpdir(),
        'forgekit-composition-',
      ),
    );

    const config = resolveConfig({
      projectName: 'full-stack-api',
      redis: true,
      auth: 'jwt',
      swagger: true,
      docker: true,
    });

    const { destination } = await generateProject(
      config,
      temporaryDirectory,
    );

    const fs = createFileSystem();

    const expectedFiles = [
      'src/app.module.ts',
      'src/main.ts',
      'src/infrastructure/infrastructure.module.ts',
      'src/infrastructure/config/configuration.ts',
      'src/infrastructure/config/environment.ts',
      'src/infrastructure/prisma/prisma.module.ts',
      'src/infrastructure/prisma/prisma.service.ts',
      'src/infrastructure/redis/redis.module.ts',
      'src/infrastructure/redis/redis.service.ts',
      'src/infrastructure/swagger/swagger.setup.ts',
      'src/modules/auth/auth.module.ts',
      'src/modules/auth/auth.service.ts',
      'Dockerfile',
      'docker-compose.yml',
      '.dockerignore',
      '.github/workflows/ci.yml',
      'jest.config.ts',
      'test/jest-e2e.json',
      'src/app.module.spec.ts',
      'test/app.e2e-spec.ts',
    ];

    for (const file of expectedFiles) {
      expect(
        await fs.exists(
          path.join(destination, file),
        ),
        `Expected file: ${file}`,
      ).toBe(true);
    }

    const packageJson = JSON.parse(
      await fs.readFile(
        path.join(destination, 'package.json'),
      ),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };

    expect(packageJson.dependencies?.ioredis).toBe('5.6.0');
    expect(packageJson.dependencies?.['@prisma/client']).toBe('6.19.3');
    expect(packageJson.dependencies?.['@nestjs/jwt']).toBe('11.0.2');
    expect(packageJson.dependencies?.['@nestjs/swagger']).toBe('11.0.6');
    expect(packageJson.devDependencies?.['@nestjs/testing']).toBe('^11.0.0');
    expect(packageJson.devDependencies?.jest).toBe('^30.0.0');
    expect(packageJson.devDependencies?.supertest).toBe('^7.0.0');
    expect(packageJson.scripts?.['typecheck']).toBe('tsc --noEmit');
    expect(packageJson.scripts?.['test']).toBe('jest');
    expect(packageJson.scripts?.['test:e2e']).toBe(
      'jest --config ./test/jest-e2e.json',
    );
    expect(packageJson.scripts?.['docker:up']).toBe('docker compose up --build');
    expect(packageJson.scripts?.['docker:down']).toBe('docker compose down');

    const compose = await fs.readFile(
      path.join(destination, 'docker-compose.yml'),
    );

    expect(compose).toContain('postgres:');
    expect(compose).toContain('redis:');
    expect(compose).toContain('JWT_SECRET');
    expect(compose).toContain('REDIS_URL');
    expect(compose).toContain('DATABASE_URL');
    expect(compose).toContain('npx prisma migrate deploy');
  });

  it('does not generate CI workflow when ci is disabled', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(
        os.tmpdir(),
        'forgekit-composition-',
      ),
    );

    const config = resolveConfig({
      projectName: 'test-api',
      ci: false,
    });

    const { destination } = await generateProject(
      config,
      temporaryDirectory,
    );

    const fs = createFileSystem();

    expect(
      await fs.exists(
        path.join(destination, '.github'),
      ),
    ).toBe(false);

    const packageJson = JSON.parse(
      await fs.readFile(
        path.join(destination, 'package.json'),
      ),
    ) as { scripts?: Record<string, string> };

    // typecheck script should still exist in base package.json even when ci is false
    expect(packageJson.scripts?.['typecheck']).toBe('tsc --noEmit');
  });

  it('does not generate testing artifacts when testing is disabled', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(
        os.tmpdir(),
        'forgekit-composition-',
      ),
    );

    const config = resolveConfig({
      projectName: 'test-api',
      testing: false,
    });

    const { destination } = await generateProject(
      config,
      temporaryDirectory,
    );

    const fs = createFileSystem();

    expect(
      await fs.exists(
        path.join(destination, 'jest.config.ts'),
      ),
    ).toBe(false);
    expect(
      await fs.exists(
        path.join(destination, 'test'),
      ),
    ).toBe(false);
    expect(
      await fs.exists(
        path.join(destination, 'src', 'app.module.spec.ts'),
      ),
    ).toBe(false);

    const packageJson = JSON.parse(
      await fs.readFile(
        path.join(destination, 'package.json'),
      ),
    ) as {
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(packageJson.scripts?.['test']).toBeUndefined();
    expect(packageJson.scripts?.['test:e2e']).toBeUndefined();
    expect(packageJson.devDependencies?.['@nestjs/testing']).toBeUndefined();
    expect(packageJson.devDependencies?.['jest']).toBeUndefined();
  });
});