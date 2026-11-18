import type { Command } from 'commander';
import { findProjectRoot } from '../../manifest/index.js';
import { addSafetyOptions, applyChanges, type SafetyOptions } from '../../safety/index.js';
import {
  deriveResourceNames,
  parseFields,
  planResource,
  type FieldSpec,
} from '../../scaffolding/index.js';
import {
  formatEditFailure,
  formatResourceDryRun,
  formatResourceResult,
} from '../output/generate-output.js';
import { promptFields } from '../prompts/generate.prompts.js';

interface GenerateResourceOptions extends SafetyOptions {
  readonly fields: string[];
  readonly yes?: boolean;
}

const collect = (value: string, previous: string[]): string[] => [
  ...previous,
  value,
];

export function registerGenerateCommand(program: Command): void {
  const generate = program
    .command('generate')
    .description('Generate code inside an existing Ironveil project');

  const resource = generate
    .command('resource <name>')
    .description(
      'Generate a CRUD resource: module, controller, service, DTOs, Prisma model and migration, pagination and tests',
    )
    .option(
      '--fields <spec>',
      'fields as "name:type"; a trailing ? makes one optional, e.g. "name:string price:decimal?" (types: string, text, int, float, decimal, boolean, datetime). Repeatable',
      collect,
      [] as string[],
    )
    .option('-y, --yes', 'do not prompt for fields');

  addSafetyOptions(resource);

  resource.action(async (name: string, options: GenerateResourceOptions) => {
    try {
      // Cheap checks first, so a typo does not cost the user a round of prompts.
      deriveResourceNames(name);
      const root = await findProjectRoot(process.cwd());

      const fields = await resolveFields(options);
      const plan = await planResource({ root, name, fields });
      const result = await applyChanges(plan.changeSet, {
        dryRun: options.dryRun,
        force: options.force,
      });

      console.log(
        options.dryRun === true
          ? formatResourceDryRun(plan, result)
          : formatResourceResult(plan, result),
      );
    } catch (error) {
      process.exitCode = 1;
      console.error(formatEditFailure(error));
    }
  });
}

async function resolveFields(
  options: GenerateResourceOptions,
): Promise<FieldSpec[]> {
  if (options.fields.length > 0) {
    return parseFields(options.fields);
  }

  const interactive =
    options.yes !== true &&
    process.stdin.isTTY === true &&
    process.stdout.isTTY === true;

  return interactive ? promptFields() : [];
}
