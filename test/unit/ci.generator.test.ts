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
  CiGenerator,
} from '../../src/generators/features/ci/ci.generator.js';
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

describe('CiGenerator', () => {
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
        'forgekit-ci-',
      ),
    );

    const fs = createFileSystem();

    const config = resolveConfig({
      projectName: 'test-api',
      ci: true,
      ...overrides,
    });

    await fs.writeFile(
      path.join(temporaryDirectory, 'package.json'),
      JSON.stringify({
        name: 'test-api',
        scripts: {
          typecheck: 'tsc --noEmit',
        },
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

  it('has the ci generator contract name', () => {
    const generator = new CiGenerator();
    expect(generator.name).toBe('ci');
  });

  it('shouldRun returns true when ci is enabled', () => {
    const generator = new CiGenerator();
    const config = resolveConfig({
      projectName: 'test-api',
      ci: true,
    });
    expect(generator.shouldRun(config)).toBe(true);
  });

  it('shouldRun returns false when ci is disabled', () => {
    const generator = new CiGenerator();
    const config = resolveConfig({
      projectName: 'test-api',
      ci: false,
    });
    expect(generator.shouldRun(config)).toBe(false);
  });

  it('generates .github/workflows/ci.yml when enabled', async () => {
    const { fs, context } = await createContext({ ci: true });
    const generator = new CiGenerator();

    await generator.generate(context);

    const workflowExists = await fs.exists(
      path.join(
        temporaryDirectory,
        '.github',
        'workflows',
        'ci.yml',
      ),
    );
    expect(workflowExists).toBe(true);
  });

  it('generates expected workflow content with Node 22, npm install, typecheck, and build', async () => {
    const { fs, context } = await createContext({ ci: true });
    const generator = new CiGenerator();

    await generator.generate(context);

    const workflowContent = await fs.readFile(
      path.join(
        temporaryDirectory,
        '.github',
        'workflows',
        'ci.yml',
      ),
    );

    expect(workflowContent).toContain('name: CI');
    expect(workflowContent).toContain('branches: [main, master]');
    expect(workflowContent).toContain('permissions:\n  contents: read');
    expect(workflowContent).toContain('actions/checkout@v4');
    expect(workflowContent).toContain('actions/setup-node@v4');
    expect(workflowContent).toContain("node-version: '22'");
    expect(workflowContent).toContain("cache: 'npm'");
    expect(workflowContent).toContain('run: npm install');
    expect(workflowContent).toContain('run: npm run typecheck');
    expect(workflowContent).toContain('run: npm run build');
    expect(workflowContent).not.toContain('npm ci');
  });

  it('includes Prisma generate step when Prisma is enabled', async () => {
    const { fs, context } = await createContext({
      ci: true,
      database: 'postgres',
      orm: 'prisma',
    });
    const generator = new CiGenerator();

    await generator.generate(context);

    const workflowContent = await fs.readFile(
      path.join(
        temporaryDirectory,
        '.github',
        'workflows',
        'ci.yml',
      ),
    );

    expect(workflowContent).toContain('Generate Prisma Client');
    expect(workflowContent).toContain('run: npx prisma generate');
    expect(workflowContent).toContain('DATABASE_URL:');
  });

  it('includes unit test step when testing is enabled', async () => {
    const { fs, context } = await createContext({
      ci: true,
      testing: true,
    });
    const generator = new CiGenerator();

    await generator.generate(context);

    const workflowContent = await fs.readFile(
      path.join(
        temporaryDirectory,
        '.github',
        'workflows',
        'ci.yml',
      ),
    );

    expect(workflowContent).toContain('Run unit tests');
    expect(workflowContent).toContain('run: npm test');
  });

  it('omits unit test step when testing is disabled', async () => {
    const { fs, context } = await createContext({
      ci: true,
      testing: false,
    });
    const generator = new CiGenerator();

    await generator.generate(context);

    const workflowContent = await fs.readFile(
      path.join(
        temporaryDirectory,
        '.github',
        'workflows',
        'ci.yml',
      ),
    );

    expect(workflowContent).not.toContain('Run unit tests');
    expect(workflowContent).not.toContain('run: npm test');
    expect(workflowContent).toContain('run: npm run typecheck');
    expect(workflowContent).toContain('run: npm run build');
  });

  it('does not generate CI workflow files when ci is disabled', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'forgekit-ci-'),
    );

    const fs = createFileSystem();
    const config = resolveConfig({
      projectName: 'test-api',
      ci: false,
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

    const generator = new CiGenerator();
    expect(generator.shouldRun(config)).toBe(false);

    expect(
      await fs.exists(
        path.join(temporaryDirectory, '.github'),
      ),
    ).toBe(false);
  });
});
