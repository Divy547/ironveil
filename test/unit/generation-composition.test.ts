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

    const destination = await generateProject(
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

    const destination = await generateProject(
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
  });
});