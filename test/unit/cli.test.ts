import { describe, expect, it } from 'vitest';
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
});