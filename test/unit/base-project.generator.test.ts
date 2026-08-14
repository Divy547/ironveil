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
  BaseProjectGenerator,
} from '../../src/generators/project/base-project.generator.js';
import {
  createTemplateLoader,
} from '../../src/rendering/template-loader.js';
import {
  createTemplateRenderer,
} from '../../src/rendering/template-renderer.js';
import {
  createFileSystem,
} from '../../src/utils/filesystem.js';

describe('BaseProjectGenerator', () => {
  let temporaryDirectory: string;
  let templateDirectory: string;

  afterEach(async () => {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, {
        recursive: true,
        force: true,
      });
    }

    if (templateDirectory) {
      await rm(templateDirectory, {
        recursive: true,
        force: true,
      });
    }
  });

  it('has the base generator contract', () => {
    const generator = new BaseProjectGenerator();

    const config = resolveConfig({
      projectName: 'test-api',
    });

    expect(generator.name).toBe('base');
    expect(generator.shouldRun(config)).toBe(true);
  });

  it('generates the base project from templates', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(
        os.tmpdir(),
        'forgekit-project-',
      ),
    );

    templateDirectory = await mkdtemp(
      path.join(
        os.tmpdir(),
        'forgekit-templates-',
      ),
    );

    const fs = createFileSystem();

    await fs.writeFile(
      path.join(
        templateDirectory,
        'base',
        'package.json',
      ),
      '{"name":"{{projectName}}"}',
    );

    await fs.writeFile(
      path.join(
        templateDirectory,
        'base',
        'tsconfig.json',
      ),
      '{}',
    );

    await fs.writeFile(
      path.join(
        templateDirectory,
        'base',
        'tsconfig.build.json',
      ),
      '{}',
    );

    await fs.writeFile(
      path.join(
        templateDirectory,
        'base',
        'nest-cli.json',
      ),
      '{}',
    );

    await fs.writeFile(
      path.join(
        templateDirectory,
        'base',
        'README.md.template',
      ),
      '# {{projectName}}\n',
    );

    await fs.writeFile(
      path.join(
        templateDirectory,
        'base',
        'src',
        'main.ts.template',
      ),
      '// {{projectName}}\n',
    );

    await fs.writeFile(
      path.join(
        templateDirectory,
        'base',
        'src',
        'app.module.ts.template',
      ),
      '// {{projectName}}\n',
    );

    await fs.writeFile(
      path.join(
        templateDirectory,
        'base',
        'src',
        'common',
        'common.module.ts.template',
      ),
      '// common {{projectName}}\n',
    );

    await fs.writeFile(
      path.join(
        templateDirectory,
        'base',
        'src',
        'infrastructure',
        'infrastructure.module.ts.template',
      ),
      '// infrastructure {{projectName}}\n',
    );

    await fs.writeFile(
      path.join(
        templateDirectory,
        'base',
        'src',
        'modules',
        '.gitkeep',
      ),
      '',
    );

    const config = resolveConfig({
      projectName: 'test-api',
    });

    const loader = createTemplateLoader(
      templateDirectory,
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

    const generator =
      new BaseProjectGenerator();

    await generator.generate(context);

    expect(
      await fs.readFile(
        path.join(
          temporaryDirectory,
          'package.json',
        ),
      ),
    ).toBe('{"name":"test-api"}');

    expect(
      await fs.readFile(
        path.join(
          temporaryDirectory,
          'README.md',
        ),
      ),
    ).toBe('# test-api\n');

    expect(
      await fs.readFile(
        path.join(
          temporaryDirectory,
          'src',
          'main.ts',
        ),
      ),
    ).toBe('// test-api\n');

    expect(
      await fs.readFile(
        path.join(
          temporaryDirectory,
          'src',
          'common',
          'common.module.ts',
        ),
      ),
    ).toBe('// common test-api\n');

    expect(
      await fs.readFile(
        path.join(
          temporaryDirectory,
          'src',
          'infrastructure',
          'infrastructure.module.ts',
        ),
      ),
    ).toBe('// infrastructure test-api\n');

    expect(
      await fs.exists(
        path.join(
          temporaryDirectory,
          'src',
          'modules',
          '.gitkeep',
        ),
      ),
    ).toBe(true);

    expect(
      await fs.exists(
        path.join(
          temporaryDirectory,
          'src',
          'main.ts.template',
        ),
      ),
    ).toBe(false);
  });
});