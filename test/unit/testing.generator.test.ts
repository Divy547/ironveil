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
  TestingGenerator,
} from '../../src/generators/features/testing/testing.generator.js';
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

describe('TestingGenerator', () => {
  let temporaryDirectory: string;

  afterEach(async () => {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, {
        recursive: true,
        force: true,
      });
    }
  });

  async function createContext(
    overrides: Record<string, unknown> = {},
  ): Promise<{
    fs: ReturnType<typeof createFileSystem>;
    context: ReturnType<typeof createGenerationContext>;
  }> {
    temporaryDirectory = await mkdtemp(
      path.join(
        os.tmpdir(),
        'forgekit-testing-',
      ),
    );

    const fs = createFileSystem();

    const config = resolveConfig({
      projectName: 'test-api',
      testing: true,
      ...overrides,
    });

    await fs.writeFile(
      path.join(temporaryDirectory, 'package.json'),
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

    return { fs, context };
  }

  it('has the testing generator contract name', () => {
    const generator = new TestingGenerator();
    expect(generator.name).toBe('testing');
  });

  it('shouldRun returns true when testing is enabled', () => {
    const generator = new TestingGenerator();
    const config = resolveConfig({
      projectName: 'test-api',
      testing: true,
    });
    expect(generator.shouldRun(config)).toBe(true);
  });

  it('shouldRun returns false when testing is disabled', () => {
    const generator = new TestingGenerator();
    const config = resolveConfig({
      projectName: 'test-api',
      testing: false,
    });
    expect(generator.shouldRun(config)).toBe(false);
  });

  it('generates jest.config.ts, test/jest-e2e.json, src/app.module.spec.ts, and test/app.e2e-spec.ts when enabled', async () => {
    const { fs, context } = await createContext({ testing: true });
    const generator = new TestingGenerator();

    await generator.generate(context);

    expect(
      await fs.exists(path.join(temporaryDirectory, 'jest.config.ts')),
    ).toBe(true);
    expect(
      await fs.exists(
        path.join(temporaryDirectory, 'test', 'jest-e2e.json'),
      ),
    ).toBe(true);
    expect(
      await fs.exists(
        path.join(temporaryDirectory, 'src', 'app.module.spec.ts'),
      ),
    ).toBe(true);
    expect(
      await fs.exists(
        path.join(temporaryDirectory, 'test', 'app.e2e-spec.ts'),
      ),
    ).toBe(true);

    const specContent = await fs.readFile(
      path.join(temporaryDirectory, 'src', 'app.module.spec.ts'),
    );
    expect(specContent).toContain('process.env.DATABASE_URL =');
    expect(specContent).not.toContain('REDIS_URL');
    expect(specContent).not.toContain('JWT_SECRET');
    expect(specContent).toContain("const { AppModule } = await import('./app.module');");

    const e2eContent = await fs.readFile(
      path.join(temporaryDirectory, 'test', 'app.e2e-spec.ts'),
    );
    expect(e2eContent).toContain('process.env.DATABASE_URL =');
    expect(e2eContent).not.toContain('REDIS_URL');
    expect(e2eContent).not.toContain('JWT_SECRET');
    expect(e2eContent).toContain("const { AppModule } = await import('../src/app.module');");
  });

  it('generates test environment with all variables when database, redis, and auth are enabled', async () => {
    const { fs, context } = await createContext({
      testing: true,
      database: 'postgres',
      orm: 'prisma',
      redis: true,
      auth: 'jwt',
    });
    const generator = new TestingGenerator();

    await generator.generate(context);

    const specContent = await fs.readFile(
      path.join(temporaryDirectory, 'src', 'app.module.spec.ts'),
    );
    expect(specContent).toContain('process.env.DATABASE_URL =');
    expect(specContent).toContain('process.env.REDIS_URL =');
    expect(specContent).toContain('process.env.JWT_SECRET =');

    const e2eContent = await fs.readFile(
      path.join(temporaryDirectory, 'test', 'app.e2e-spec.ts'),
    );
    expect(e2eContent).toContain('process.env.DATABASE_URL =');
    expect(e2eContent).toContain('process.env.REDIS_URL =');
    expect(e2eContent).toContain('process.env.JWT_SECRET =');
  });

  it('adds testing scripts and devDependencies to package.json when enabled', async () => {
    const { fs, context } = await createContext({ testing: true });
    const generator = new TestingGenerator();

    await generator.generate(context);

    const pkg = JSON.parse(
      await fs.readFile(
        path.join(temporaryDirectory, 'package.json'),
      ),
    ) as {
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(pkg.scripts?.['test']).toBe('jest');
    expect(pkg.scripts?.['test:watch']).toBe('jest --watch');
    expect(pkg.scripts?.['test:cov']).toBe('jest --coverage');
    expect(pkg.scripts?.['test:e2e']).toBe(
      'jest --config ./test/jest-e2e.json',
    );

    expect(pkg.devDependencies?.['@nestjs/testing']).toBe('^11.0.0');
    expect(pkg.devDependencies?.['@types/jest']).toBe('^30.0.0');
    expect(pkg.devDependencies?.['@types/supertest']).toBe('^6.0.2');
    expect(pkg.devDependencies?.['jest']).toBe('^30.0.0');
    expect(pkg.devDependencies?.['supertest']).toBe('^7.0.0');
    expect(pkg.devDependencies?.['ts-jest']).toBe('^29.2.5');
  });

  it('does not generate testing artifacts or modify package.json when testing is disabled', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'forgekit-testing-'),
    );

    const fs = createFileSystem();
    const config = resolveConfig({
      projectName: 'test-api',
      testing: false,
    });

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

    const generator = new TestingGenerator();
    expect(generator.shouldRun(config)).toBe(false);

    expect(
      await fs.exists(path.join(temporaryDirectory, 'jest.config.ts')),
    ).toBe(false);
    expect(
      await fs.exists(path.join(temporaryDirectory, 'test')),
    ).toBe(false);
    expect(
      await fs.exists(
        path.join(temporaryDirectory, 'src', 'app.module.spec.ts'),
      ),
    ).toBe(false);
  });
});
