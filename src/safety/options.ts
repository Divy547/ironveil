import type { Command } from 'commander';

export interface SafetyOptions {
  readonly force?: boolean;
  readonly dryRun?: boolean;
}

/**
 * Adds the flags shared by every command that edits an existing project
 * (`generate`, `add`, ...), so they behave and read the same everywhere.
 */
export function addSafetyOptions(command: Command): Command {
  return command
    .option(
      '--force',
      'run even if the git working tree has uncommitted changes',
    )
    .option(
      '--dry-run',
      'show a diff of the planned changes without writing anything',
    );
}
