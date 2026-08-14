import type { Command } from 'commander';
import { resolveConfig } from '../../config/index.js';
import { promptCreateOptions } from '../prompts/create.prompts.js';
import type { CreateCommandOptions } from '../options/create.options.js';
import { hasExplicitCreateOptions } from '../options/create.mode.js';
import { generateProject } from '../../generators/generate-project.js';
import { GenerationError } from '../../generators/core/generation-error.js';

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

        try {
          const config = resolveConfig({
            projectName,
            ...resolvedOptions,
          });

          const destination = await generateProject(
            config,
          );

          console.log(
            `Created ${config.projectName} at ${destination}`,
          );
        } catch (error) {
          process.exitCode = 1;

          if (error instanceof GenerationError) {
            console.error('\nGeneration failed\n');
            if (error.projectName) {
              console.error(`Project: ${error.projectName}`);
            }
            if (error.generatorName) {
              console.error(`Generator: ${error.generatorName}`);
            }
            console.error(`Reason: ${error.message}`);
            if (
              error.cause &&
              error.cause instanceof Error &&
              error.cause.message !== error.message
            ) {
              console.error(`Original error: ${error.cause.message}`);
            }
          } else {
            console.error('\nGeneration failed\n');
            console.error(
              `Reason: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      },
    );
}