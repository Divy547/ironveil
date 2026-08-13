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
  generateProject,
} from '../../src/generators/generate-project.js';
import {
  createFileSystem,
} from '../../src/utils/filesystem.js';

describe('generateProject', () => {
  let temporaryDirectory: string;

  afterEach(async () => {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, {
        recursive: true,
        force: true,
      });
    }
  });

  async function createProject(): Promise<{
    destination: string;
    fs: ReturnType<typeof createFileSystem>;
  }> {
    temporaryDirectory = await mkdtemp(
      path.join(
        os.tmpdir(),
        'forgekit-generation-',
      ),
    );

    const config = resolveConfig({
      projectName: 'test-api',
    });

    const destination = await generateProject(
      config,
      temporaryDirectory,
    );

    return {
      destination,
      fs: createFileSystem(),
    };
  }

  it('generates the expected project structure', async () => {
    const {
      destination,
      fs,
    } = await createProject();

    const expectedFiles = [
      'package.json',
      'README.md',
      'nest-cli.json',
      'tsconfig.json',
      'tsconfig.build.json',
      '.env.example',

      'src/main.ts',
      'src/app.module.ts',

      'src/common/common.module.ts',

      'src/infrastructure/infrastructure.module.ts',
      'src/infrastructure/config/configuration.ts',
      'src/infrastructure/config/environment.ts',

      'src/modules/.gitkeep',
    ];

    for (const file of expectedFiles) {
      expect(
        await fs.exists(
          path.join(
            destination,
            file,
          ),
        ),
        `Expected generated file: ${file}`,
      ).toBe(true);
    }
  });

  it('preserves the application architecture', async () => {
    const {
      destination,
      fs,
    } = await createProject();

    const appModule = await fs.readFile(
      path.join(
        destination,
        'src',
        'app.module.ts',
      ),
    );

    expect(appModule).toContain(
      "from './common/common.module'",
    );

    expect(appModule).toContain(
      "from './infrastructure/infrastructure.module'",
    );

    expect(appModule).toContain(
      'CommonModule',
    );

    expect(appModule).toContain(
      'InfrastructureModule',
    );

    expect(appModule).not.toContain(
      'ConfigModule.forRoot',
    );

    const infrastructureModule =
      await fs.readFile(
        path.join(
          destination,
          'src',
          'infrastructure',
          'infrastructure.module.ts',
        ),
      );

    expect(infrastructureModule).toContain(
      'ConfigModule.forRoot',
    );

    expect(infrastructureModule).toContain(
      'loadConfiguration',
    );

    expect(infrastructureModule).toContain(
      'validateEnvironment',
    );

    const commonModule = await fs.readFile(
      path.join(
        destination,
        'src',
        'common',
        'common.module.ts',
      ),
    );

    expect(commonModule).toContain(
      'CommonModule',
    );

    const main = await fs.readFile(
      path.join(
        destination,
        'src',
        'main.ts',
      ),
    );

    expect(main).toContain(
      'NestFactory.create(AppModule)',
    );
  });

  it('generates configuration under infrastructure', async () => {
    const {
      destination,
      fs,
    } = await createProject();

    const configuration = await fs.readFile(
      path.join(
        destination,
        'src',
        'infrastructure',
        'config',
        'configuration.ts',
      ),
    );

    expect(configuration).toContain(
      'loadConfiguration',
    );

    expect(configuration).toContain(
      'process.env.NODE_ENV',
    );

    const environment = await fs.readFile(
      path.join(
        destination,
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
      'validateEnvironment',
    );
  });

  it('does not leak template files into the generated project', async () => {
    const {
      destination,
      fs,
    } = await createProject();

    const templateFiles = [
      'src/main.ts.template',
      'src/app.module.ts.template',
      'src/common/common.module.ts.template',
      'src/infrastructure/infrastructure.module.ts.template',
      'src/infrastructure/config/configuration.ts.template',
      'src/infrastructure/config/environment.ts.template',
    ];

    for (const file of templateFiles) {
      expect(
        await fs.exists(
          path.join(
            destination,
            file,
          ),
        ),
        `Template leaked into generated project: ${file}`,
      ).toBe(false);
    }
  });

  it('rejects an existing destination', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(
        os.tmpdir(),
        'forgekit-generation-',
      ),
    );

    const destination = path.join(
      temporaryDirectory,
      'test-api',
    );

    const { mkdir } = await import(
      'node:fs/promises'
    );

    await mkdir(destination);

    const config = resolveConfig({
      projectName: 'test-api',
    });

    await expect(
      generateProject(
        config,
        temporaryDirectory,
      ),
    ).rejects.toThrow(
      'Destination already exists',
    );
  });
});