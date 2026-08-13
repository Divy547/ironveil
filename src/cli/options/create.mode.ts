import type { Command } from 'commander';

const CREATE_OPTION_NAMES = [
  'redis',
  'auth',
  'swagger',
  'docker',
  'ci',
  'testing',
] as const;

export function hasExplicitCreateOptions(
  command: Command,
): boolean {
  return CREATE_OPTION_NAMES.some(
    (optionName) =>
      command.getOptionValueSource(optionName) === 'cli',
  );
}