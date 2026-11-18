import { Command } from 'commander';
import { describe, expect, it } from 'vitest';
import {
  addSafetyOptions,
  type SafetyOptions,
} from '../../src/safety/index.js';

function parse(args: string[]): SafetyOptions {
  const command = addSafetyOptions(new Command('probe'));
  command.parse(args, { from: 'user' });
  return command.opts<SafetyOptions>();
}

describe('addSafetyOptions', () => {
  it('defaults both flags to off', () => {
    const options = parse([]);

    expect(Boolean(options.force)).toBe(false);
    expect(Boolean(options.dryRun)).toBe(false);
  });

  it('parses --force', () => {
    expect(parse(['--force']).force).toBe(true);
  });

  it('parses --dry-run', () => {
    expect(parse(['--dry-run']).dryRun).toBe(true);
  });

  it('documents both flags in the command help', () => {
    const help = addSafetyOptions(new Command('probe')).helpInformation();

    expect(help).toContain('--force');
    expect(help).toContain('--dry-run');
    expect(help).toMatch(/uncommitted/i);
    expect(help).toMatch(/diff/i);
  });

  it('returns the same command so it can be chained', () => {
    const command = new Command('probe');

    expect(addSafetyOptions(command)).toBe(command);
  });
});
