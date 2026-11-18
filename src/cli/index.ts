import { Command } from 'commander';

import { IRONVEIL_VERSION } from '../version.js';
import { registerAddCommand } from './commands/add.command.js';
import { registerCreateCommand } from './commands/create.command.js';
import { registerGenerateCommand } from './commands/generate.command.js';


export function createCli(): Command {
  const program = new Command();

  program
    .name('ironveil')
    .description('Production-ready NestJS backend generator')
    .version(IRONVEIL_VERSION);

  registerCreateCommand(program);
  registerGenerateCommand(program);
  registerAddCommand(program);

  return program;
}

export async function runCli(): Promise<void> {
  const program = createCli();

  await program.parseAsync(process.argv);
}