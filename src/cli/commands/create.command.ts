import type { Command } from 'commander';
import { resolveConfig } from '../../config/index.js';
import { promptCreateOptions } from '../prompts/create.prompts.js';
import type { CreateCommandOptions } from '../options/create.options.js';
import { hasExplicitCreateOptions } from '../options/create.mode.js';

export function registerCreateCommand(program: Command): void {
  program
    .command('create <project-name>')
    .description('Create a new NestJS backend project')
    .option('--redis', 'Enable Redis')
    .option('--auth <type>', 'Authentication type: none or jwt')
    .option('--no-swagger', 'Disable Swagger')
    .option('--no-docker', 'Disable Docker')
    .option('--no-ci', 'Disable GitHub Actions')
    .option('--no-testing', 'Disable testing')
    .action(
      async (
        projectName: string,
        options: CreateCommandOptions,
        command: Command,
      ) => {
        const featureOptions: CreateCommandOptions = {
          redis: options.redis,
          auth: options.auth,
          swagger: options.swagger,
          docker: options.docker,
          ci: options.ci,
          testing: options.testing,
        };

        const resolvedOptions = hasExplicitCreateOptions(command)
          ? featureOptions
          : await promptCreateOptions();

        const config = resolveConfig({
          projectName,
          ...resolvedOptions,
        });

        console.log(config);
      },
    );
}