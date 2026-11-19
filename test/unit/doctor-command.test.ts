import { mkdir, mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCli } from '../../src/cli/index.js';
import { resolveConfig } from '../../src/config/index.js';
import { generateProject } from '../../src/generators/generate-project.js';

describe('ironveil doctor', () => {
  let workspace: string;
  let project: string;
  let cwd: ReturnType<typeof vi.spyOn>;
  let log: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;

  async function makeProject(overrides: Parameters<typeof resolveConfig>[0] = {}) {
    const result = await generateProject(
      resolveConfig({ projectName: 'shop-api', ...overrides }),
      workspace,
    );
    project = result.destination;
    cwd.mockReturnValue(project);
  }

  beforeEach(async () => {
    workspace = await mkdtemp(path.join(os.tmpdir(), 'ironveil-doctor-cmd-'));
    cwd = vi.spyOn(process, 'cwd').mockReturnValue(workspace);
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
    createCli().parseAsync(['node', 'ironveil', 'doctor', ...args]);
  const printed = (spy: ReturnType<typeof vi.spyOn>) =>
    spy.mock.calls.map((call) => String(call[0])).join('\n');

  it('is registered with a --strict option', () => {
    const doctor = createCli().commands.find((c) => c.name() === 'doctor');

    expect(doctor).toBeDefined();
    expect(doctor?.options.map((option) => option.long)).toContain('--strict');
  });

  it('says so when there is nothing to report', async () => {
    await makeProject();
    await writeFile(path.join(project, '.env'), await readFile(path.join(project, '.env.example'), 'utf8'));

    await run();

    expect(process.exitCode).toBeUndefined();
    expect(printed(log)).toContain('shop-api');
    expect(printed(log)).toContain('No problems found');
  });

  it('prints each finding with its check, severity and fix, and fails on an error', async () => {
    await makeProject({ redis: true });
    const packagePath = path.join(project, 'package.json');
    const json = JSON.parse(await readFile(packagePath, 'utf8')) as {
      dependencies: Record<string, string>;
    };
    delete json.dependencies.ioredis;
    await writeFile(packagePath, JSON.stringify(json, null, 2));

    await run();

    const output = printed(log);
    expect(process.exitCode).toBe(1);
    expect(output).toMatch(/error.*\[dependencies\].*ioredis/);
    expect(output).toMatch(/1 error/);
  });

  it('exits 0 for warnings unless --strict is given', async () => {
    await makeProject();
    await mkdir(path.join(project, 'src/modules/orders'), { recursive: true });
    await writeFile(
      path.join(project, 'src/modules/orders/orders.module.ts'),
      "import { Module } from '@nestjs/common';\n@Module({})\nexport class OrdersModule {}\n",
    );

    await run();
    expect(process.exitCode).toBeUndefined();
    expect(printed(log)).toMatch(/warning.*\[modules\].*OrdersModule/);

    await run('--strict');
    expect(process.exitCode).toBe(1);
  });

  it('works from a subfolder of the project', async () => {
    await makeProject();
    cwd.mockReturnValue(path.join(project, 'src', 'modules'));

    await run();

    expect(process.exitCode).toBeUndefined();
    expect(printed(log)).toContain('shop-api');
  });

  it('explains when it is not run inside an Ironveil project', async () => {
    await run();

    expect(process.exitCode).toBe(1);
    expect(printed(error)).toContain('not inside an Ironveil project');
  });

  it('never writes anything', async () => {
    await makeProject({ redis: true });
    const before = await readFile(path.join(project, 'package.json'), 'utf8');

    await run();

    expect(await readFile(path.join(project, 'package.json'), 'utf8')).toBe(before);
  });
});
