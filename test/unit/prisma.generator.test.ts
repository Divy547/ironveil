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
  createGenerationContext,
} from '../../src/generators/core/generation-context.js';
import {
  PrismaGenerator,
} from '../../src/generators/features/prisma/prisma.generator.js';
import {
  createTemplateLoader,
} from '../../src/rendering/template-loader.js';
import {
  createTemplateRenderer,
} from '../../src/rendering/template-renderer.js';
import {
  getTemplatesDirectory,
} from '../../src/rendering/template-path.js';
import {
  createFileSystem,
} from '../../src/utils/filesystem.js';

describe('PrismaGenerator', () => {
  let temporaryDirectory: string;

  afterEach(async () => {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, {
        recursive: true,
        force: true,
      });
    }
  });

  it('has the prisma generator contract', () => {
    const generator = new PrismaGenerator();

    const config = resolveConfig({
      projectName: 'test-api',
    });

    expect(generator.name).toBe('prisma');
    expect(generator.shouldRun(config)).toBe(true);
  });

  it('generates Prisma infrastructure', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(
        os.tmpdir(),
        'forgekit-prisma-',
      ),
    );

    const fs = createFileSystem();

    const config = resolveConfig({
      projectName: 'test-api',
    });

    await fs.writeFile(
      path.join(
        temporaryDirectory,
        'package.json',
      ),
      JSON.stringify({
        name: 'test-api',
        scripts: {},
        dependencies: {},
        devDependencies: {},
      }),
    );

    const loader = createTemplateLoader(
      getTemplatesDirectory(),
      fs,
    );

    const renderer = createTemplateRenderer();

    const context = createGenerationContext(
      config,
      temporaryDirectory,
      fs,
      loader,
      renderer,
    );

    const generator = new PrismaGenerator();

    await generator.generate(context);

    expect(
      await fs.exists(
        path.join(
          temporaryDirectory,
          'prisma',
          'schema.prisma',
        ),
      ),
    ).toBe(true);

    expect(
      await fs.exists(
        path.join(
          temporaryDirectory,
          'src',
          'infrastructure',
          'prisma',
          'prisma.module.ts',
        ),
      ),
    ).toBe(true);

    expect(
      await fs.exists(
        path.join(
          temporaryDirectory,
          'src',
          'infrastructure',
          'prisma',
          'prisma.service.ts',
        ),
      ),
    ).toBe(true);
  });

  it('generates the expected Prisma schema', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(
        os.tmpdir(),
        'forgekit-prisma-',
      ),
    );

    const fs = createFileSystem();

    const config = resolveConfig({
      projectName: 'test-api',
    });

    await fs.writeFile(
      path.join(
        temporaryDirectory,
        'package.json',
      ),
      JSON.stringify({
        name: 'test-api',
        scripts: {},
        dependencies: {},
        devDependencies: {},
      }),
    );

    const loader = createTemplateLoader(
      getTemplatesDirectory(),
      fs,
    );

    const renderer = createTemplateRenderer();

    const context = createGenerationContext(
      config,
      temporaryDirectory,
      fs,
      loader,
      renderer,
    );

    const generator = new PrismaGenerator();

    await generator.generate(context);

    const schema = await fs.readFile(
      path.join(
        temporaryDirectory,
        'prisma',
        'schema.prisma',
      ),
    );

    expect(schema).toContain(
      'provider     = "prisma-client"',
    );

    expect(schema).toContain(
      'output       = "../src/generated/prisma"',
    );

    expect(schema).toContain(
      'moduleFormat = "cjs"',
    );

    expect(schema).toContain(
      'provider = "postgresql"',
    );

    expect(schema).toContain(
      'url      = env("DATABASE_URL")',
    );
  });

  it('adds Prisma dependencies and scripts', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(
        os.tmpdir(),
        'forgekit-prisma-',
      ),
    );

    const fs = createFileSystem();

    const config = resolveConfig({
      projectName: 'test-api',
    });

    await fs.writeFile(
      path.join(
        temporaryDirectory,
        'package.json',
      ),
      JSON.stringify({
        name: 'test-api',
        scripts: {
          build: 'nest build',
        },
        dependencies: {
          '@nestjs/common': '^11.0.0',
        },
        devDependencies: {},
      }),
    );

    const loader = createTemplateLoader(
      getTemplatesDirectory(),
      fs,
    );

    const renderer = createTemplateRenderer();

    const context = createGenerationContext(
      config,
      temporaryDirectory,
      fs,
      loader,
      renderer,
    );

    const generator = new PrismaGenerator();

    await generator.generate(context);

    const packageJson = JSON.parse(
      await fs.readFile(
        path.join(
          temporaryDirectory,
          'package.json',
        ),
      ),
    ) as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(
      packageJson.dependencies?.[
        '@prisma/client'
      ],
    ).toBe('6.19.3');

    expect(
      packageJson.devDependencies?.prisma,
    ).toBe('6.19.3');

    expect(
      packageJson.scripts?.[
        'db:generate'
      ],
    ).toBe('prisma generate');

    expect(
      packageJson.scripts?.[
        'db:migrate'
      ],
    ).toBe('prisma migrate dev');

    expect(
      packageJson.scripts?.[
        'db:migrate:deploy'
      ],
    ).toBe('prisma migrate deploy');

    expect(
      packageJson.scripts?.[
        'db:studio'
      ],
    ).toBe('prisma studio');
  });
});