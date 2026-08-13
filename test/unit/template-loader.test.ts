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
import {
  createTemplateLoader,
} from '../../src/rendering/template-loader.js';
import {
  createFileSystem,
} from '../../src/utils/filesystem.js';

describe('TemplateLoader', () => {
  let temporaryDirectory: string;

  afterEach(async () => {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, {
        recursive: true,
        force: true,
      });
    }
  });

  it('loads a template by relative path', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(
        os.tmpdir(),
        'forgekit-template-',
      ),
    );

    const fs = createFileSystem();

    await fs.writeFile(
      path.join(
        temporaryDirectory,
        'base',
        'README.md',
      ),
      '# {{projectName}}\n',
    );

    const loader = createTemplateLoader(
      temporaryDirectory,
      fs,
    );

    const result = await loader.load(
      'base/README.md',
    );

    expect(result).toBe(
      '# {{projectName}}\n',
    );
  });
});