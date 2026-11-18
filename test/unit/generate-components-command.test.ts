import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCli } from '../../src/cli/index.js';
import { resolveConfig } from '../../src/config/index.js';
import { generateProject } from '../../src/generators/generate-project.js';

describe('ironveil generate module|controller|service|guard|dto', () => {
  let workspace: string;
  let project: string;
  let cwd: ReturnType<typeof vi.spyOn>;
  let log: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    workspace = await mkdtemp(path.join(os.tmpdir(), 'ironveil-gen-small-'));
    const result = await generateProject(
      resolveConfig({ projectName: 'shop-api' }),
      workspace,
    );
    project = result.destination;
    cwd = vi.spyOn(process, 'cwd').mockReturnValue(project);
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
    error = vi.spyOn(console, 'error').mockImplementation(() => {});
    process.exitCode = undefined;
  });

  afterEach(async () => {
    cwd.mockRestore();
    log.mockRestore();
    error.mockRestore();
    process.exitCode = undefined;
    await rm(workspace, { recursive: true, force: true });
  });

  const run = (...args: string[]) =>
    createCli().parseAsync(['node', 'ironveil', 'generate', ...args]);

  const read = (relative: string) => readFile(path.join(project, relative), 'utf8');
  const exists = (relative: string) =>
    readFile(path.join(project, relative)).then(
      () => true,
      () => false,
    );
  const printed = (spy: ReturnType<typeof vi.spyOn>) =>
    spy.mock.calls.map((call) => String(call[0])).join('\n');

  const generate = () => createCli().commands.find((c) => c.name() === 'generate');
  const subcommand = (name: string) => generate()?.commands.find((c) => c.name() === name);
  const optionsOf = (name: string) =>
    subcommand(name)?.options.map((option) => option.long);

  it('registers all five subcommands next to resource', () => {
    expect(generate()?.commands.map((c) => c.name()).sort()).toEqual(
      ['controller', 'dto', 'guard', 'module', 'resource', 'service'],
    );
  });

  it.each(['module', 'controller', 'service', 'guard', 'dto'])(
    '%s has the shared safety options',
    (name) => {
      expect(optionsOf(name)).toEqual(expect.arrayContaining(['--force', '--dry-run']));
    },
  );

  it('offers --module on everything but module, and --fields only on dto', () => {
    expect(optionsOf('module')).not.toContain('--module');
    for (const name of ['controller', 'service', 'guard', 'dto']) {
      expect(optionsOf(name)).toContain('--module');
    }
    expect(optionsOf('dto')).toContain('--fields');
    for (const name of ['module', 'controller', 'service', 'guard']) {
      expect(optionsOf(name)).not.toContain('--fields');
    }
  });

  it('generates a service and prints what it wrote', async () => {
    await run('service', 'billing');

    expect(process.exitCode).toBeUndefined();
    expect(await exists('src/modules/billing/billing.service.ts')).toBe(true);
    expect(await read('src/app.module.ts')).toContain('BillingModule');
    const output = printed(log);
    expect(output).toContain('Generated service Billing');
    expect(output).toContain('src/modules/billing/billing.service.ts');
    expect(output).toContain('src/modules/billing/billing.module.ts');
  });

  it('generates a controller and a guard', async () => {
    await run('controller', 'billing');
    await run('guard', 'api-key');

    expect(process.exitCode).toBeUndefined();
    expect(await exists('src/modules/billing/billing.controller.ts')).toBe(true);
    expect(await exists('src/common/guards/api-key.guard.ts')).toBe(true);
  });

  it('generates a module', async () => {
    await run('module', 'billing');

    expect(await exists('src/modules/billing/billing.module.ts')).toBe(true);
    expect(await read('src/app.module.ts')).toContain('BillingModule');
  });

  it('generates a dto from --fields, accepting the flag more than once', async () => {
    await run('dto', 'create-invoice', '--fields', 'number:string', '--fields', 'total:int?');

    const dto = await read('src/common/dto/create-invoice.dto.ts');
    expect(dto).toContain('number!: string;');
    expect(dto).toContain('total?: number;');
  });

  it('honours --module', async () => {
    await run('module', 'billing');
    await run('service', 'tax', '--module', 'billing');

    expect(await exists('src/modules/billing/tax.service.ts')).toBe(true);
    expect(await exists('src/modules/tax/tax.module.ts')).toBe(false);
  });

  it('shows the diff and writes nothing with --dry-run', async () => {
    await run('service', 'billing', '--dry-run');

    expect(process.exitCode).toBeUndefined();
    expect(await exists('src/modules/billing/billing.service.ts')).toBe(false);
    expect(await read('src/app.module.ts')).not.toContain('BillingModule');
    expect(printed(log)).toMatch(/dry run/i);
    expect(printed(log)).toContain('+++ b/src/modules/billing/billing.service.ts');
  });

  it('is a no-op the second time', async () => {
    await run('service', 'billing');
    log.mockClear();

    await run('service', 'billing');

    expect(process.exitCode).toBeUndefined();
    expect(printed(log)).toMatch(/already/i);
  });

  it('exits 1 with a "no files were changed" message on a bad name', async () => {
    await run('service', 'bad name');

    expect(process.exitCode).toBe(1);
    expect(printed(error)).toMatch(/invalid service name/i);
    expect(printed(error)).toContain('No files were changed.');
  });

  it('exits 1 and writes nothing when --module names a module that does not exist', async () => {
    await run('service', 'billing', '--module', 'nope');

    expect(process.exitCode).toBe(1);
    expect(await exists('src/modules/billing/billing.service.ts')).toBe(false);
  });
});
