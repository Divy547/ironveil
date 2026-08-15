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

describe('generated architecture contract', () => {
  let temporaryDirectory: string;

  afterEach(async () => {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, {
        recursive: true,
        force: true,
      });
    }
  });

  async function generate(): Promise<{
    destination: string;
    fs: ReturnType<typeof createFileSystem>;
  }> {
    temporaryDirectory = await mkdtemp(
      path.join(
        os.tmpdir(),
        'forgekit-architecture-',
      ),
    );

    const config = resolveConfig({
      projectName: 'test-api',
    });

    const result = await generateProject(
      config,
      temporaryDirectory,
    );

    return {
      destination: result.destination,
      fs: createFileSystem(),
    };
  }

  it('keeps common code outside feature modules', async () => {
    const {
      destination,
      fs,
    } = await generate();

    expect(
      await fs.exists(
        path.join(
          destination,
          'src',
          'common',
          'common.module.ts',
        ),
      ),
    ).toBe(true);

    expect(
      await fs.exists(
        path.join(
          destination,
          'src',
          'modules',
          'common.module.ts',
        ),
      ),
    ).toBe(false);
  });

  it('keeps infrastructure separate from feature modules', async () => {
    const {
      destination,
      fs,
    } = await generate();

    expect(
      await fs.exists(
        path.join(
          destination,
          'src',
          'infrastructure',
          'infrastructure.module.ts',
        ),
      ),
    ).toBe(true);

    expect(
      await fs.exists(
        path.join(
          destination,
          'src',
          'modules',
          'infrastructure.module.ts',
        ),
      ),
    ).toBe(false);
  });

  it('keeps configuration inside infrastructure', async () => {
    const {
      destination,
      fs,
    } = await generate();

    expect(
      await fs.exists(
        path.join(
          destination,
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
          destination,
          'src',
          'config',
          'configuration.ts',
        ),
      ),
    ).toBe(false);
  });

  it('keeps business modules isolated as a dedicated boundary', async () => {
    const {
      destination,
      fs,
    } = await generate();

    expect(
      await fs.exists(
        path.join(
          destination,
          'src',
          'modules',
        ),
      ),
    ).toBe(true);

    expect(
      await fs.exists(
        path.join(
          destination,
          'src',
          'modules',
          '.gitkeep',
        ),
      ),
    ).toBe(true);
  });
});