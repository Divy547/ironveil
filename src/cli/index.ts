import { Command } from 'commander';

import { registerCreateCommand } from './commands/create.command.js';


export function createCli(): Command {
  const program = new Command();

  program
    .name('ironveil')
    .description('Production-ready NestJS backend generator')
    .version('0.2.0');

  registerCreateCommand(program);

  return program;
}

export async function runCli(): Promise<void> {
  const program = createCli();

  await program.parseAsync(process.argv);
}