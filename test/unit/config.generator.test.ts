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
  ConfigGenerator,
} from '../../src/generators/features/config/config.generator.js';
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

describe('ConfigGenerator', () => {
  let temporaryDirectory: string;

  afterEach(async () => {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, {
        recursive: true,
        force: true,
      });
    }
  });

  it('has the config generator contract', () => {
    const generator = new ConfigGenerator();

    const config = resolveConfig({
      projectName: 'test-api',
    });

    expect(generator.name).toBe('config');
    expect(generator.shouldRun(config)).toBe(true);
  });

  it('generates configuration files', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(
        os.tmpdir(),
        'forgekit-config-',
      ),
    );

    const fs = createFileSystem();

    const config = resolveConfig({
      projectName: 'test-api',
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

    const generator = new ConfigGenerator();

    await generator.generate(context);

    expect(
      await fs.exists(
        path.join(
          temporaryDirectory,
          '.env.example',
        ),
      ),
    ).toBe(true);

    expect(
      await fs.exists(
        path.join(
          temporaryDirectory,
          'src',
          'infrastructure',
          'config',
          'configuration.ts',
        ),
      ),
    ).toBe(true);

    expect(
      await fs.exists(
        path.join(
          temporaryDirectory,
          'src',
          'infrastructure',
          'config',
          'environment.ts',
        ),
      ),
    ).toBe(true);
  });

  it('generates the expected default configuration', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(
        os.tmpdir(),
        'forgekit-config-',
      ),
    );

    const fs = createFileSystem();

    const config = resolveConfig({
      projectName: 'test-api',
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

    const generator = new ConfigGenerator();

    await generator.generate(context);

    const envExample = await fs.readFile(
      path.join(
        temporaryDirectory,
        '.env.example',
      ),
    );

    expect(envExample).toContain(
      'NODE_ENV=development',
    );

    expect(envExample).toContain(
      'PORT=3000',
    );

    const configuration = await fs.readFile(
      path.join(
        temporaryDirectory,
        'src',
        'infrastructure',
        'config',
        'configuration.ts',
      ),
    );

    expect(configuration).toContain(
      'export interface AppConfig',
    );

    expect(configuration).toContain(
      'loadConfiguration',
    );

    expect(configuration).toContain(
      'process.env.PORT',
    );

    const environment = await fs.readFile(
      path.join(
        temporaryDirectory,
        'src',
        'infrastructure',
        'config',
        'environment.ts',
      ),
    );

    expect(environment).toContain(
      'EnvironmentSchema',
    );

    expect(environment).toContain(
      'NODE_ENV',
    );

    expect(environment).toContain(
      'PORT',
    );

    expect(environment).toContain(
      'validateEnvironment',
    );

    expect(environment).toContain(
      'Environment validation failed',
    );
  });
});