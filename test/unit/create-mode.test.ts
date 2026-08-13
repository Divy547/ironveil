import { Command } from 'commander';
import { describe, expect, it } from 'vitest';
import { hasExplicitCreateOptions } from '../../src/cli/options/create.mode.js';

function createTestCommand(): Command {
  const command = new Command();

  command
    .option('--redis', 'Enable Redis')
    .option('--auth <type>', 'Authentication type: none or jwt')
    .option('--no-swagger')
    .option('--no-docker')
    .option('--no-ci')
    .option('--no-testing');

  return command;
}

describe('create command mode detection', () => {
  it('detects interactive mode when no options are provided', () => {
    const command = createTestCommand();

    command.parse(['node', 'forgekit']);

    expect(hasExplicitCreateOptions(command)).toBe(false);
  });

  it('detects non-interactive mode when an option is provided', () => {
    const command = createTestCommand();

    command.parse(['node', 'forgekit', '--redis']);

    expect(hasExplicitCreateOptions(command)).toBe(true);
  });

  it('detects explicit negative options', () => {
    const command = createTestCommand();

    command.parse(['node', 'forgekit', '--no-docker']);

    expect(hasExplicitCreateOptions(command)).toBe(true);
  });
});