import { describe, expect, it, vi } from 'vitest';
import { createCli } from '../../src/cli/index.js';

describe('ForgeKit CLI', () => {
  it('creates the CLI program', () => {
    const cli = createCli();

    expect(cli.name()).toBe('forgekit');
    expect(cli.version()).toBe('0.1.0');
  });

  it('registers the create command', () => {
    const cli = createCli();

    const command = cli.commands.find(
      (registeredCommand) => registeredCommand.name() === 'create',
    );

    expect(command).toBeDefined();
  });

  it('registers create command options', () => {
    const cli = createCli();

    const command = cli.commands.find(
      (registeredCommand) => registeredCommand.name() === 'create',
    );

    expect(command).toBeDefined();

    const optionNames = command?.options.map(
      (option) => option.long,
    );

    expect(optionNames).toContain('--redis');
    expect(optionNames).toContain('--auth');
    expect(optionNames).toContain('--no-swagger');
    expect(optionNames).toContain('--no-docker');
    expect(optionNames).toContain('--no-ci');
    expect(optionNames).toContain('--no-testing');
  });

  it('handles generation error and sets process.exitCode = 1', async () => {
    const cli = createCli();
    const originalExitCode = process.exitCode;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await cli.parseAsync([
        'node',
        'forgekit',
        'create',
        'invalid-!name',
        '--no-swagger',
        '--no-docker',
        '--no-ci',
        '--no-testing',
      ]);
      expect(process.exitCode).toBe(1);
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      process.exitCode = originalExitCode;
      errorSpy.mockRestore();
    }
  });
});