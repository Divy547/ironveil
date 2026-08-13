import type { Command } from 'commander';

export function registerCreateCommand(program: Command): void {
  program
    .command('create <project-name>')
    .description('Create a new NestJS backend project')
    .action(async (projectName: string) => {
      console.log(`ForgeKit create: ${projectName}`);
      console.log('Project generation is not implemented yet.');
    });
}