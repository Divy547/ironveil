import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveConfig } from '../../src/config/index.js';
import { generateProject } from '../../src/generators/generate-project.js';
import { LintGenerator } from '../../src/generators/features/lint/lint.generator.js';
import { createFileSystem } from '../../src/utils/filesystem.js';

describe('LintGenerator', () => {
  let temporaryDirectory: string;

  afterEach(async () => {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  async function generate(
    overrides: Parameters<typeof resolveConfig>[0] = {},
  ) {
    temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'ironveil-lint-'),
    );
    const { destination } = await generateProject(
      resolveConfig({ projectName: 'test-api', ...overrides }),
      temporaryDirectory,
    );
    const fs = createFileSystem();
    const read = (...segments: string[]) =>
      fs.readFile(path.join(destination, ...segments));
    return { fs, destination, read };
  }

  it('always runs', () => {
    const generator = new LintGenerator();
    expect(generator.name).toBe('lint');
    expect(generator.shouldRun(resolveConfig({ projectName: 'a' }))).toBe(true);
  });

  it('ships a flat ESLint config with typescript-eslint and Prettier compat', async () => {
    const { read } = await generate();
    const config = await read('eslint.config.mjs');

    expect(config).toContain("from 'typescript-eslint'");
    expect(config).toContain('recommendedTypeChecked');
    expect(config).toContain('eslintConfigPrettier');
    expect(config).toContain('projectService: true');
    expect(config).toContain("'src/generated/**'");
    expect(config).not.toContain('{{');
  });

  it('ships Prettier config and ignore files', async () => {
    const { read } = await generate();

    const prettierrc = JSON.parse(await read('.prettierrc')) as Record<
      string,
      unknown
    >;
    expect(prettierrc).toEqual({ singleQuote: true, trailingComma: 'all' });

    const ignore = await read('.prettierignore');
    expect(ignore).toContain('dist');
    expect(ignore).toContain('src/generated');
  });

  it('adds lint tooling to devDependencies and removes nothing else', async () => {
    const { read } = await generate();
    const pkg = JSON.parse(await read('package.json')) as {
      devDependencies?: Record<string, string>;
    };

    for (const name of [
      '@eslint/js',
      'eslint',
      'eslint-config-prettier',
      'globals',
      'prettier',
      'typescript-eslint',
    ]) {
      expect(pkg.devDependencies?.[name], name).toBeDefined();
    }
  });

  it('exposes lint, lint:fix and format scripts, with lint not rewriting files', async () => {
    const { read } = await generate();
    const pkg = JSON.parse(await read('package.json')) as {
      scripts: Record<string, string>;
    };

    expect(pkg.scripts.lint).toBe('eslint "{src,test}/**/*.ts"');
    expect(pkg.scripts.lint).not.toContain('--fix');
    expect(pkg.scripts['lint:fix']).toContain('--fix');
    expect(pkg.scripts.format).toContain('prettier --write');
  });

  it('runs lint in the generated CI after Prisma generate and before typecheck', async () => {
    const { read } = await generate({ ci: true, packageManager: 'pnpm' });
    const ci = await read('.github/workflows/ci.yml');

    expect(ci).toContain('pnpm run lint');
    expect(ci).not.toContain('{{');
    expect(ci.indexOf('Generate Prisma Client')).toBeLessThan(
      ci.indexOf('Run lint'),
    );
    expect(ci.indexOf('Run lint')).toBeLessThan(ci.indexOf('Run typecheck'));
  });

  it('lists the lint step in the generated README CI section', async () => {
    const { read } = await generate({ ci: true });
    const readme = await read('README.md');
    expect(readme).toContain('Lint (`npm run lint`)');
  });

  it('ships lint config even when every optional feature is off', async () => {
    const { fs, destination } = await generate({
      ci: false,
      docker: false,
      testing: false,
      swagger: false,
    });
    expect(await fs.exists(path.join(destination, 'eslint.config.mjs'))).toBe(true);
    expect(await fs.exists(path.join(destination, '.prettierrc'))).toBe(true);
  });
});
