import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCli } from '../../src/cli/index.js';
import { createFileSystem } from '../../src/utils/filesystem.js';

describe('ForgeKit CLI', () => {
  let temporaryDirectory: string;

  afterEach(async () => {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it('creates the CLI program', () => {
    const cli = createCli();

    expect(cli.name()).toBe('ironveil');
    expect(cli.version()).toBe('0.1.0');
  });

  it('registers the create command', () => {
    const cli = createCli();

    const command = cli.commands.find(
      (registeredCommand) => registeredCommand.name() === 'create',
    );

    expect(command).toBeDefined();
  });

  it('registers create command options including F11 UX options', () => {
    const cli = createCli();

    const command = cli.commands.find(
      (registeredCommand) => registeredCommand.name() === 'create',
    );

    expect(command).toBeDefined();

    const optionNames = command?.options.map(
      (option) => option.long,
    );

    expect(optionNames).toContain('--yes');
    expect(optionNames).toContain('--non-interactive');
    expect(optionNames).toContain('--dry-run');
    expect(optionNames).toContain('--package-manager');
    expect(optionNames).toContain('--redis');
    expect(optionNames).toContain('--auth');
    expect(optionNames).toContain('--no-swagger');
    expect(optionNames).toContain('--no-docker');
    expect(optionNames).toContain('--no-ci');
    expect(optionNames).toContain('--no-testing');

    const yesOption = command?.options.find((o) => o.long === '--yes');
    expect(yesOption?.short).toBe('-y');

    const pmOption = command?.options.find(
      (o) => o.long === '--package-manager',
    );
    expect(pmOption?.short).toBe('-p');
  });

  it('creates a project with --yes non-interactively using defaults', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'forgekit-cli-yes-'),
    );

    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(temporaryDirectory);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const cli = createCli();

    try {
      await cli.parseAsync([
        'node',
        'forgekit',
        'create',
        'yes-app',
        '--yes',
      ]);

      const fs = createFileSystem();
      const projectPath = path.join(temporaryDirectory, 'yes-app');

      expect(await fs.exists(projectPath)).toBe(true);
      expect(await fs.exists(path.join(projectPath, 'package.json'))).toBe(true);
      expect(await fs.exists(path.join(projectPath, 'prisma/schema.prisma'))).toBe(true);
      expect(await fs.exists(path.join(projectPath, 'src/infrastructure/redis'))).toBe(false);

      expect(logSpy).toHaveBeenCalled();
      const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(output).toContain('Project created successfully.');
      expect(output).toContain('Project:  yes-app');
      expect(output).toContain('• PostgreSQL + Prisma ORM');
    } finally {
      cwdSpy.mockRestore();
      logSpy.mockRestore();
    }
  });

  it('respects explicit options with --yes', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'forgekit-cli-override-'),
    );

    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(temporaryDirectory);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const cli = createCli();

    try {
      await cli.parseAsync([
        'node',
        'forgekit',
        'create',
        'override-app',
        '-y',
        '--redis',
        '--no-docker',
      ]);

      const fs = createFileSystem();
      const projectPath = path.join(temporaryDirectory, 'override-app');

      expect(await fs.exists(projectPath)).toBe(true);
      expect(await fs.exists(path.join(projectPath, 'src/infrastructure/redis'))).toBe(true);
      expect(await fs.exists(path.join(projectPath, 'Dockerfile'))).toBe(false);

      const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(output).toContain('• Redis Infrastructure');
      expect(output).not.toContain('• Docker & Docker Compose');
    } finally {
      cwdSpy.mockRestore();
      logSpy.mockRestore();
    }
  });

  it('runs --dry-run without creating files on disk', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'forgekit-cli-dryrun-'),
    );

    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(temporaryDirectory);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const cli = createCli();

    try {
      await cli.parseAsync([
        'node',
        'forgekit',
        'create',
        'dry-app',
        '--dry-run',
        '--yes',
      ]);

      const fs = createFileSystem();
      const projectPath = path.join(temporaryDirectory, 'dry-app');

      expect(await fs.exists(projectPath)).toBe(false);

      const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(output).toContain('Dry run completed.');
      expect(output).toContain('Project:     dry-app');
      expect(output).toContain('Note: Dry run complete. No project was created on disk.');
    } finally {
      cwdSpy.mockRestore();
      logSpy.mockRestore();
    }
  });

  it('handles invalid configuration error and sets process.exitCode = 1', async () => {
    const cli = createCli();
    const originalExitCode = process.exitCode;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await cli.parseAsync([
        'node',
        'forgekit',
        'create',
        'invalid-!name',
        '--yes',
      ]);
      expect(process.exitCode).toBe(1);
      expect(errorSpy).toHaveBeenCalled();
      const errOutput = errorSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(errOutput).toContain('Invalid configuration');
      expect(errOutput).toContain('projectName:');
    } finally {
      process.exitCode = originalExitCode;
      errorSpy.mockRestore();
    }
  });

  it('creates a project with --package-manager pnpm and includes packageManager field', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'forgekit-cli-pnpm-'),
    );

    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(temporaryDirectory);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const cli = createCli();

    try {
      await cli.parseAsync([
        'node',
        'forgekit',
        'create',
        'pnpm-cli-app',
        '--yes',
        '--package-manager',
        'pnpm',
      ]);

      const fs = createFileSystem();
      const projectPath = path.join(temporaryDirectory, 'pnpm-cli-app');
      expect(await fs.exists(projectPath)).toBe(true);

      const pkg = JSON.parse(
        await fs.readFile(path.join(projectPath, 'package.json')),
      ) as { packageManager?: string };
      expect(pkg.packageManager).toBe('pnpm@10.5.2');

      const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(output).toContain('pnpm install');
      expect(output).toContain('pnpm exec prisma generate');
      expect(output).toContain('pnpm run start:dev');
    } finally {
      cwdSpy.mockRestore();
      logSpy.mockRestore();
    }
  });

  it('creates a project with -p yarn and includes packageManager field', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'forgekit-cli-yarn-'),
    );

    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(temporaryDirectory);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const cli = createCli();

    try {
      await cli.parseAsync([
        'node',
        'forgekit',
        'create',
        'yarn-cli-app',
        '--yes',
        '-p',
        'yarn',
      ]);

      const fs = createFileSystem();
      const projectPath = path.join(temporaryDirectory, 'yarn-cli-app');
      expect(await fs.exists(projectPath)).toBe(true);

      const pkg = JSON.parse(
        await fs.readFile(path.join(projectPath, 'package.json')),
      ) as { packageManager?: string };
      expect(pkg.packageManager).toBe('yarn@1.22.22');

      const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(output).toContain('yarn install');
      expect(output).toContain('yarn prisma generate');
      expect(output).toContain('yarn start:dev');
    } finally {
      cwdSpy.mockRestore();
      logSpy.mockRestore();
    }
  });

  it('rejects --package-manager bun with error and code 1', async () => {
    const cli = createCli();
    const originalExitCode = process.exitCode;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await cli.parseAsync([
        'node',
        'forgekit',
        'create',
        'bun-app',
        '--yes',
        '--package-manager',
        'bun',
      ]);
      expect(process.exitCode).toBe(1);
      expect(errorSpy).toHaveBeenCalled();
      const errOutput = errorSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(errOutput).toContain('Invalid configuration');
      expect(errOutput).toContain('packageManager:');
    } finally {
      process.exitCode = originalExitCode;
      errorSpy.mockRestore();
    }
  });
});