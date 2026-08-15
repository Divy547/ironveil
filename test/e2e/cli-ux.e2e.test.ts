import { mkdtemp, rm, readdir, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createFileSystem } from '../../src/utils/filesystem.js';

const execFileAsync = promisify(execFile);
const cliPath = path.resolve('dist/src/index.js');

describe('CLI UX & Configuration E2E', () => {
  let temporaryDirectory: string;

  afterEach(async () => {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it('generates a default project with --yes non-interactively', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'forgekit-cli-ux-yes-'),
    );

    const { stdout, stderr } = await execFileAsync(
      'node',
      [cliPath, 'create', 'cli-yes-api', '--yes'],
      { cwd: temporaryDirectory },
    );

    expect(stderr).toBe('');
    expect(stdout).toContain('Project created successfully.');
    expect(stdout).toContain('Project:  cli-yes-api');
    expect(stdout).toContain('• PostgreSQL + Prisma ORM');
    expect(stdout).toContain('• Swagger API Documentation');
    expect(stdout).toContain('• Docker & Docker Compose');
    expect(stdout).toContain('• Jest Unit & E2E Testing');
    expect(stdout).toContain('• GitHub Actions CI');
    expect(stdout).toContain('Files generated:');
    expect(stdout).toContain('Next steps:');

    const fs = createFileSystem();
    const projectPath = path.join(temporaryDirectory, 'cli-yes-api');
    expect(await fs.exists(projectPath)).toBe(true);
    expect(await fs.exists(path.join(projectPath, 'package.json'))).toBe(true);
    expect(await fs.exists(path.join(projectPath, 'prisma/schema.prisma'))).toBe(true);
    expect(await fs.exists(path.join(projectPath, 'src/infrastructure/redis'))).toBe(false);
  });

  it('overrides schema defaults with explicit CLI options and --yes', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'forgekit-cli-ux-override-'),
    );

    const { stdout } = await execFileAsync(
      'node',
      [
        cliPath,
        'create',
        'cli-override-api',
        '--yes',
        '--redis',
        '--no-docker',
      ],
      { cwd: temporaryDirectory },
    );

    expect(stdout).toContain('Project created successfully.');
    expect(stdout).toContain('• Redis Infrastructure');
    expect(stdout).not.toContain('• Docker & Docker Compose');

    const fs = createFileSystem();
    const projectPath = path.join(temporaryDirectory, 'cli-override-api');
    expect(await fs.exists(path.join(projectPath, 'src/infrastructure/redis'))).toBe(true);
    expect(await fs.exists(path.join(projectPath, 'Dockerfile'))).toBe(false);
  });

  it('runs --dry-run without creating files or leaving staging artifacts', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'forgekit-cli-ux-dryrun-'),
    );

    const { stdout } = await execFileAsync(
      'node',
      [cliPath, 'create', 'cli-dryrun-api', '--dry-run', '--yes'],
      { cwd: temporaryDirectory },
    );

    expect(stdout).toContain('Dry run completed.');
    expect(stdout).toContain('Project:     cli-dryrun-api');
    expect(stdout).toContain('Planned Features:');
    expect(stdout).toContain('Planned Generators:');
    expect(stdout).toContain('Files to generate:');
    expect(stdout).toContain('Note: Dry run complete. No project was created on disk.');

    const entries = await readdir(temporaryDirectory);
    expect(entries.length).toBe(0);
  });

  it('reports collision on existing destination during --dry-run without modifying it', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'forgekit-cli-ux-collision-'),
    );

    const destination = path.join(temporaryDirectory, 'existing-app');
    await mkdir(destination);
    const existingFile = path.join(destination, 'user-file.txt');
    await writeFile(existingFile, 'preserve me');

    try {
      await execFileAsync(
        'node',
        [cliPath, 'create', 'existing-app', '--dry-run', '--yes'],
        { cwd: temporaryDirectory },
      );
      expect.unreachable('Should have failed due to collision');
    } catch (error: any) {
      expect(error.code).toBe(1);
      expect(error.stderr).toContain('Generation failed');
      expect(error.stderr).toContain('Destination already exists');
    }

    const fs = createFileSystem();
    expect(await fs.exists(existingFile)).toBe(true);
    expect(await fs.readFile(existingFile)).toBe('preserve me');
  });

  it('reports readable error and exits with code 1 on invalid configuration', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'forgekit-cli-ux-invalid-'),
    );

    try {
      await execFileAsync(
        'node',
        [cliPath, 'create', 'Invalid_Project_Name_Caps', '--yes'],
        { cwd: temporaryDirectory },
      );
      expect.unreachable('Should have failed validation');
    } catch (error: any) {
      expect(error.code).toBe(1);
      expect(error.stderr).toContain('Invalid configuration');
      expect(error.stderr).toContain('projectName:');
      expect(error.stderr).not.toContain('at Object.');
    }
  });

  it('rejects --package-manager bun with readable error and exits with code 1', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'forgekit-cli-ux-bun-'),
    );

    try {
      await execFileAsync(
        'node',
        [cliPath, 'create', 'bun-api', '--package-manager', 'bun', '--yes'],
        { cwd: temporaryDirectory },
      );
      expect.unreachable('Should have rejected bun');
    } catch (error: any) {
      expect(error.code).toBe(1);
      expect(error.stderr).toContain('Invalid configuration');
      expect(error.stderr).toContain('packageManager:');
    }
  });

  it('creates a project with --package-manager pnpm and includes packageManager in package.json', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'forgekit-cli-ux-pnpm-'),
    );

    const { stdout } = await execFileAsync(
      'node',
      [cliPath, 'create', 'pnpm-e2e-api', '-p', 'pnpm', '--yes'],
      { cwd: temporaryDirectory },
    );

    expect(stdout).toContain('Project created successfully.');
    expect(stdout).toContain('pnpm install');

    const fs = createFileSystem();
    const projectPath = path.join(temporaryDirectory, 'pnpm-e2e-api');
    const pkg = JSON.parse(
      await fs.readFile(path.join(projectPath, 'package.json')),
    ) as { packageManager?: string };
    expect(pkg.packageManager).toBe('pnpm@10.5.2');
  });
});
