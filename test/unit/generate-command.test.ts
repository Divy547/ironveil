import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const promptFields = vi.fn();
vi.mock('../../src/cli/prompts/generate.prompts.js', () => ({
  promptFields: () => promptFields(),
}));

import { createCli } from '../../src/cli/index.js';
import { resolveConfig } from '../../src/config/index.js';
import { generateProject } from '../../src/generators/generate-project.js';

describe('ironveil generate resource', () => {
  let workspace: string;
  let project: string;
  let cwd: ReturnType<typeof vi.spyOn>;
  let log: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;
  let originalStdinTty: boolean | undefined;
  let originalStdoutTty: boolean | undefined;

  beforeEach(async () => {
    workspace = await mkdtemp(path.join(os.tmpdir(), 'ironveil-gen-cmd-'));
    const result = await generateProject(
      resolveConfig({ projectName: 'shop-api' }),
      workspace,
    );
    project = result.destination;
    cwd = vi.spyOn(process, 'cwd').mockReturnValue(project);
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
    error = vi.spyOn(console, 'error').mockImplementation(() => {});
    promptFields.mockReset();
    originalStdinTty = process.stdin.isTTY;
    originalStdoutTty = process.stdout.isTTY;
    process.exitCode = undefined;
  });

  afterEach(async () => {
    cwd.mockRestore();
    log.mockRestore();
    error.mockRestore();
    Object.defineProperty(process.stdin, 'isTTY', {
      value: originalStdinTty,
      configurable: true,
    });
    Object.defineProperty(process.stdout, 'isTTY', {
      value: originalStdoutTty,
      configurable: true,
    });
    process.exitCode = undefined;
    await rm(workspace, { recursive: true, force: true });
  });

  const run = (...args: string[]) =>
    createCli().parseAsync(['node', 'ironveil', 'generate', 'resource', ...args]);

  const read = (relative: string) => readFile(path.join(project, relative), 'utf8');
  const exists = (relative: string) =>
    readFile(path.join(project, relative)).then(
      () => true,
      () => false,
    );
  const printed = (spy: ReturnType<typeof vi.spyOn>) =>
    spy.mock.calls.map((call) => String(call[0])).join('\n');

  function setTty(value: boolean): void {
    Object.defineProperty(process.stdin, 'isTTY', { value, configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value, configurable: true });
  }

  function git(...args: string[]): void {
    execFileSync(
      'git',
      ['-c', 'user.name=Test', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args],
      { cwd: project, stdio: 'ignore' },
    );
  }

  it('registers generate with a resource subcommand and its options', () => {
    const generate = createCli().commands.find((c) => c.name() === 'generate');
    const resource = generate?.commands.find((c) => c.name() === 'resource');

    expect(generate).toBeDefined();
    expect(resource).toBeDefined();
    expect(resource?.options.map((option) => option.long)).toEqual(
      expect.arrayContaining(['--fields', '--force', '--dry-run', '--yes']),
    );
  });

  it('generates the resource from --fields and prints a summary', async () => {
    await run('product', '--fields', 'name:string price:decimal?');

    expect(process.exitCode).toBeUndefined();
    expect(await exists('src/modules/products/products.service.ts')).toBe(true);
    expect(await read('src/app.module.ts')).toContain('ProductsModule');
    expect(await read('prisma/schema.prisma')).toContain('price     Decimal?');
    expect(printed(log)).toContain('Generated resource Product');
    expect(promptFields).not.toHaveBeenCalled();
  });

  it('accepts --fields more than once', async () => {
    await run('product', '--fields', 'name:string', '--fields', 'stock:int');

    const schema = await read('prisma/schema.prisma');
    expect(schema).toContain('name      String');
    expect(schema).toContain('stock     Int');
  });

  it('shows the diff and writes nothing with --dry-run', async () => {
    await run('product', '--fields', 'name:string', '--dry-run');

    expect(process.exitCode).toBeUndefined();
    expect(await exists('src/modules/products/products.service.ts')).toBe(false);
    expect(await read('src/app.module.ts')).not.toContain('ProductsModule');
    expect(printed(log)).toMatch(/dry run/i);
    expect(printed(log)).toContain('+++ b/src/modules/products/products.module.ts');
  });

  it('works from a subdirectory of the project', async () => {
    const nested = path.join(project, 'src', 'modules');
    await mkdir(nested, { recursive: true });
    cwd.mockReturnValue(nested);

    await run('product', '--fields', 'name:string');

    expect(await exists('src/modules/products/products.module.ts')).toBe(true);
  });

  it('is a no-op the second time', async () => {
    await run('product', '--fields', 'name:string');
    log.mockClear();

    await run('product', '--fields', 'name:string');

    expect(process.exitCode).toBeUndefined();
    expect(printed(log)).toMatch(/already/i);
  });

  describe('fields', () => {
    it('prompts for fields on an interactive terminal when --fields is absent', async () => {
      setTty(true);
      promptFields.mockResolvedValue([
        { name: 'title', type: 'string', optional: false },
      ]);

      await run('post');

      expect(promptFields).toHaveBeenCalledTimes(1);
      expect(await read('prisma/schema.prisma')).toContain('title     String');
    });

    it('does not prompt when --fields is given', async () => {
      setTty(true);

      await run('post', '--fields', 'title:string');

      expect(promptFields).not.toHaveBeenCalled();
    });

    it('does not prompt with --yes, and generates a resource without fields', async () => {
      setTty(true);

      await run('post', '--yes');

      expect(promptFields).not.toHaveBeenCalled();
      expect(await exists('src/modules/posts/posts.module.ts')).toBe(true);
    });

    it('does not prompt when there is no terminal (scripts, CI, agents)', async () => {
      setTty(false);

      await run('post');

      expect(promptFields).not.toHaveBeenCalled();
      expect(await exists('src/modules/posts/posts.module.ts')).toBe(true);
    });

    it('fails on a bad field spec without writing anything', async () => {
      await run('product', '--fields', 'name:varchar');

      expect(process.exitCode).toBe(1);
      expect(printed(error)).toContain('varchar');
      expect(await exists('src/modules/products/products.module.ts')).toBe(false);
    });
  });

  describe('safety', () => {
    async function commitProject(): Promise<void> {
      git('init', '-q');
      git('add', '-A');
      git('commit', '-q', '-m', 'init');
    }

    it('refuses to run on a dirty git tree and says how to override', async () => {
      await commitProject();
      await writeFile(path.join(project, 'README.md'), 'edited\n');

      await run('product', '--fields', 'name:string');

      expect(process.exitCode).toBe(1);
      expect(printed(error)).toContain('README.md');
      expect(printed(error)).toContain('--force');
      expect(await exists('src/modules/products/products.module.ts')).toBe(false);
    });

    it('runs on a dirty tree with --force', async () => {
      await commitProject();
      await writeFile(path.join(project, 'README.md'), 'edited\n');

      await run('product', '--fields', 'name:string', '--force');

      expect(process.exitCode).toBeUndefined();
      expect(await exists('src/modules/products/products.module.ts')).toBe(true);
    });

    it('runs on a clean git tree', async () => {
      await commitProject();

      await run('product', '--fields', 'name:string');

      expect(process.exitCode).toBeUndefined();
      expect(await exists('src/modules/products/products.module.ts')).toBe(true);
    });

    it('--dry-run does not need a clean tree', async () => {
      await commitProject();
      await writeFile(path.join(project, 'README.md'), 'edited\n');

      await run('product', '--fields', 'name:string', '--dry-run');

      expect(process.exitCode).toBeUndefined();
      expect(printed(log)).toMatch(/dry run/i);
    });
  });

  describe('errors', () => {
    it('explains when run outside an Ironveil project', async () => {
      cwd.mockReturnValue(workspace);

      await run('product');

      expect(process.exitCode).toBe(1);
      expect(printed(error)).toMatch(/not inside an Ironveil project/i);
    });

    it('rejects an invalid name', async () => {
      await run('1bad');

      expect(process.exitCode).toBe(1);
      expect(printed(error)).toContain('1bad');
    });

    it('refuses a name that already has a Prisma model', async () => {
      await run('user');

      expect(process.exitCode).toBe(1);
      expect(printed(error)).toMatch(/"User" already exists/);
    });
  });
});
