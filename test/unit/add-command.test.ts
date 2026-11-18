import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCli } from '../../src/cli/index.js';
import { resolveConfig } from '../../src/config/index.js';
import { generateProject } from '../../src/generators/generate-project.js';

describe('ironveil add', () => {
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
    workspace = await mkdtemp(path.join(os.tmpdir(), 'ironveil-add-cmd-'));
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
    createCli().parseAsync(['node', 'ironveil', 'add', ...args]);

  const read = (relative: string) => readFile(path.join(project, relative), 'utf8');
  const exists = (relative: string) =>
    readFile(path.join(project, relative)).then(
      () => true,
      () => false,
    );
  const printed = (spy: ReturnType<typeof vi.spyOn>) =>
    spy.mock.calls.map((call) => String(call[0])).join('\n');

  function git(...args: string[]): void {
    execFileSync(
      'git',
      ['-c', 'user.name=Test', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args],
      { cwd: project, stdio: 'ignore' },
    );
  }

  it('registers add with the shared safety options', () => {
    const add = createCli().commands.find((c) => c.name() === 'add');

    expect(add).toBeDefined();
    expect(add?.options.map((option) => option.long)).toEqual(
      expect.arrayContaining(['--force', '--dry-run']),
    );
  });

  it('adds a feature and prints what changed', async () => {
    await makeProject({ ci: false });

    await run('ci');

    expect(process.exitCode).toBeUndefined();
    expect(await exists('.github/workflows/ci.yml')).toBe(true);
    const output = printed(log);
    expect(output).toContain('Added ci');
    expect(output).toContain('.github/workflows/ci.yml');
  });

  it('tells the user to install when dependencies changed, with their package manager', async () => {
    await makeProject({ testing: false, packageManager: 'pnpm' });

    await run('testing');

    const output = printed(log);
    expect(output).toContain('pnpm install');
    expect(output).toContain('pnpm test');
  });

  it('does not mention installing when package.json did not change', async () => {
    await makeProject({ ci: false });

    await run('ci');

    expect(printed(log)).not.toMatch(/install/);
  });

  it('points at the docker scripts after adding docker', async () => {
    await makeProject({ docker: false });

    await run('docker');

    expect(printed(log)).toContain('npm run docker:up');
  });

  it('tells the user to set REDIS_URL in their own .env after adding redis', async () => {
    await makeProject({ redis: false });

    await run('redis');

    const output = printed(log);
    expect(output).toContain('npm install');
    expect(output).toMatch(/REDIS_URL.*\.env/);
    expect(output).toContain('docker compose up -d redis');
    expect(await read('.env.example')).toContain('REDIS_URL');
  });

  it('does not suggest a redis container when the project has no docker setup', async () => {
    await makeProject({ redis: false, docker: false });

    await run('redis');

    expect(printed(log)).not.toContain('docker compose');
  });

  it('points at the Swagger UI after adding swagger', async () => {
    await makeProject({ swagger: false });

    await run('swagger');

    expect(printed(log)).toContain('/api/docs');
  });

  it('takes an ai mode', async () => {
    await makeProject({ ai: 'none' });

    await run('ai', 'all');

    expect(await exists('AGENTS.md')).toBe(true);
    expect(await exists('.github/copilot-instructions.md')).toBe(true);
  });

  it('shows the diff and writes nothing with --dry-run', async () => {
    await makeProject({ ci: false });

    await run('ci', '--dry-run');

    expect(process.exitCode).toBeUndefined();
    expect(await exists('.github/workflows/ci.yml')).toBe(false);
    expect((JSON.parse(await read('ironveil.json')) as { features: { ci: boolean } }).features.ci).toBe(false);
    expect(printed(log)).toMatch(/dry run/i);
    expect(printed(log)).toContain('+++ b/.github/workflows/ci.yml');
  });

  it('says so when the feature is already enabled', async () => {
    await makeProject();

    await run('docker');

    expect(process.exitCode).toBeUndefined();
    expect(printed(log)).toMatch(/already enabled/i);
  });

  it('prints the notes, such as a version mismatch', async () => {
    await makeProject({ ci: false });
    await writeFile(
      path.join(project, 'ironveil.json'),
      (await read('ironveil.json')).replace(/"ironveilVersion": "[^"]+"/, '"ironveilVersion": "0.0.1"'),
    );

    await run('ci');

    expect(printed(log)).toContain('0.0.1');
  });

  it('works from a subdirectory of the project', async () => {
    await makeProject({ ci: false });
    cwd.mockReturnValue(path.join(project, 'src'));

    await run('ci');

    expect(await exists('.github/workflows/ci.yml')).toBe(true);
  });

  it('exits 1 with "No files were changed" for an unknown feature', async () => {
    await makeProject();

    await run('banana');

    expect(process.exitCode).toBe(1);
    expect(printed(error)).toMatch(/Unknown feature "banana"/);
    expect(printed(error)).toContain('No files were changed.');
  });

  it('exits 1 outside an Ironveil project', async () => {
    await run('ci');

    expect(process.exitCode).toBe(1);
    expect(printed(error)).toMatch(/not inside an Ironveil project/i);
  });

  it('refuses a dirty git tree unless --force', async () => {
    await makeProject({ ci: false });
    git('init', '-q');
    git('add', '-A');
    git('commit', '-q', '-m', 'init');
    await writeFile(path.join(project, 'notes.txt'), 'uncommitted\n');

    await run('ci');
    expect(process.exitCode).toBe(1);
    expect(await exists('.github/workflows/ci.yml')).toBe(false);

    process.exitCode = undefined;
    await run('ci', '--force');
    expect(process.exitCode).toBeUndefined();
    expect(await exists('.github/workflows/ci.yml')).toBe(true);
  });
});
