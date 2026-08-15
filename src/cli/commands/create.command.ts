import type { Command } from 'commander';
import { resolveConfig } from '../../config/index.js';
import { promptCreateOptions } from '../prompts/create.prompts.js';
import type { CreateCommandOptions } from '../options/create.options.js';
import { hasExplicitCreateOptions } from '../options/create.mode.js';
import { generateProject } from '../../generators/generate-project.js';
import {
  formatSuccessOutput,
  formatDryRunOutput,
  formatFailureOutput,
} from '../output/create-output.js';

export function registerCreateCommand(program: Command): void {
  program
    .command('create <project-name>')
    .description('Create a new NestJS backend project')
    .option('-y, --yes', 'Skip interactive prompts and use defaults')
    .option('--non-interactive', 'Run in non-interactive mode')
    .option('--dry-run', 'Simulate generation without writing files to disk')
    .option(
      '-p, --package-manager <pm>',
      'Package manager: npm, pnpm, or yarn',
    )
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
          packageManager: options.packageManager,
          redis: options.redis,
          auth: options.auth,
          swagger: options.swagger,
          docker: options.docker,
          ci: options.ci,
          testing: options.testing,
        };

        const isNonInteractive = Boolean(
          options.yes ||
          options.nonInteractive ||
          hasExplicitCreateOptions(command),
        );

        const resolvedOptions = isNonInteractive
          ? featureOptions
          : await promptCreateOptions();

        try {
          const config = resolveConfig({
            projectName,
            ...resolvedOptions,
          });

          const result = await generateProject(
            config,
            process.cwd(),
            undefined,
            { dryRun: options.dryRun },
          );

          if (options.dryRun) {
            console.log(formatDryRunOutput(result));
          } else {
            console.log(formatSuccessOutput(result));
          }
        } catch (error) {
          process.exitCode = 1;
          console.error(formatFailureOutput(error));
        }
      },
    );
}