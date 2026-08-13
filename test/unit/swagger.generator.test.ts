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
  createGenerationPlan,
} from '../../src/generators/core/generation-plan.js';
import {
  SwaggerGenerator,
} from '../../src/generators/features/swagger/swagger.generator.js';
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

describe('SwaggerGenerator', () => {
  let temporaryDirectory: string;

  afterEach(async () => {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, {
        recursive: true,
        force: true,
      });
    }
  });

  async function createContext(overrideConfig = {}): Promise<{
    fs: ReturnType<typeof createFileSystem>;
    context: ReturnType<typeof createGenerationContext>;
  }> {
    temporaryDirectory = await mkdtemp(
      path.join(
        os.tmpdir(),
        'forgekit-swagger-',
      ),
    );

    const fs = createFileSystem();

    const config = resolveConfig({
      projectName: 'test-api',
      ...overrideConfig,
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

    return {
      fs,
      context,
    };
  }

  it('has the swagger generator contract name', () => {
    const generator = new SwaggerGenerator();
    expect(generator.name).toBe('swagger');
  });

  it('runs when swagger is enabled', () => {
    const generator = new SwaggerGenerator();
    const config = resolveConfig({
      projectName: 'test-api',
      swagger: true,
    });

    expect(generator.shouldRun(config)).toBe(true);
  });

  it('does not run when swagger is disabled', () => {
    const generator = new SwaggerGenerator();
    const config = resolveConfig({
      projectName: 'test-api',
      swagger: false,
    });

    expect(generator.shouldRun(config)).toBe(false);
  });

  it('adds @nestjs/swagger dependency to package.json', async () => {
    const { fs, context } = await createContext({ swagger: true });
    const generator = new SwaggerGenerator();

    await generator.generate(context);

    const manifestContent = await fs.readFile(
      path.join(temporaryDirectory, 'package.json'),
    );
    const manifest = JSON.parse(manifestContent);

    expect(manifest.dependencies['@nestjs/swagger']).toBe('11.0.6');
  });

  it('renders and writes swagger.setup.ts file', async () => {
    const { fs, context } = await createContext({ swagger: true });
    const generator = new SwaggerGenerator();

    await generator.generate(context);

    const setupFileExists = await fs.exists(
      path.join(
        temporaryDirectory,
        'src',
        'infrastructure',
        'swagger',
        'swagger.setup.ts',
      ),
    );
    expect(setupFileExists).toBe(true);

    const setupContent = await fs.readFile(
      path.join(
        temporaryDirectory,
        'src',
        'infrastructure',
        'swagger',
        'swagger.setup.ts',
      ),
    );

    expect(setupContent).toContain("setTitle('test-api')");
    expect(setupContent).toContain("setupSwagger(app: INestApplication)");
  });

  it('is included in GenerationPlan when swagger is enabled', () => {
    const config = resolveConfig({
      projectName: 'test-api',
      swagger: true,
    });

    const plan = createGenerationPlan(config);
    const hasSwagger = plan.generators.some(
      (gen) => gen.name === 'swagger',
    );

    expect(hasSwagger).toBe(true);
  });

  it('is excluded from GenerationPlan when swagger is disabled', () => {
    const config = resolveConfig({
      projectName: 'test-api',
      swagger: false,
    });

    const plan = createGenerationPlan(config);
    const hasSwagger = plan.generators.some(
      (gen) => gen.name === 'swagger',
    );

    expect(hasSwagger).toBe(false);
  });
});
