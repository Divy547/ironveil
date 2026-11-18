import type { Command } from 'commander';
import { findProjectRoot } from '../../manifest/index.js';
import { addSafetyOptions, applyChanges, type SafetyOptions } from '../../safety/index.js';
import {
  COMPONENT_KINDS,
  deriveResourceNames,
  parseAuthPolicy,
  parseFields,
  planComponent,
  planResource,
  RESOURCE_AUTH_POLICIES,
  type ComponentKind,
  type FieldSpec,
} from '../../scaffolding/index.js';
import {
  formatComponentDryRun,
  formatComponentResult,
  formatEditFailure,
  formatResourceDryRun,
  formatResourceResult,
} from '../output/generate-output.js';
import { promptFields } from '../prompts/generate.prompts.js';

interface GenerateResourceOptions extends SafetyOptions {
  readonly fields: string[];
  readonly auth?: string;
  readonly yes?: boolean;
}

interface GenerateComponentOptions extends SafetyOptions {
  readonly module?: string;
  readonly fields?: string[];
}

const COMPONENT_DESCRIPTIONS: Record<ComponentKind, string> = {
  module: 'Generate an empty feature module and import it in AppModule',
  controller:
    'Generate a controller and register it in its feature module (the module is created when missing)',
  service:
    'Generate a service and register it as a provider in its feature module (the module is created when missing)',
  guard:
    'Generate a guard (src/common/guards, or <module>/guards); it rejects every request until you write its rule',
  dto: 'Generate a DTO class (src/common/dto, or <module>/dto), optionally with --fields',
};

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
    .option(
      '--auth <policy>',
      `who may call the routes (needs JWT auth): ${RESOURCE_AUTH_POLICIES.join(' | ')}. user (default) = any valid token; admin-writes = admin to create, update and delete; public-read = anyone may read, admin to write; admin = admin only`,
    )
    .option('-y, --yes', 'do not prompt for fields');

  addSafetyOptions(resource);

  for (const kind of COMPONENT_KINDS) {
    registerComponentCommand(generate, kind);
  }

  resource.action(async (name: string, options: GenerateResourceOptions) => {
    try {
      // Cheap checks first, so a typo does not cost the user a round of prompts.
      deriveResourceNames(name);
      const auth =
        options.auth === undefined ? undefined : parseAuthPolicy(options.auth);
      const root = await findProjectRoot(process.cwd());

      const fields = await resolveFields(options);
      const plan = await planResource({ root, name, fields, auth });
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

function registerComponentCommand(generate: Command, kind: ComponentKind): void {
  const command = generate
    .command(`${kind} <name>`)
    .description(COMPONENT_DESCRIPTIONS[kind]);

  if (kind !== 'module') {
    command.option(
      '--module <name>',
      kind === 'controller' || kind === 'service'
        ? 'put it in this existing feature module instead of one named after it'
        : 'put it in this existing feature module instead of src/common',
    );
  }

  if (kind === 'dto') {
    command.option(
      '--fields <spec>',
      'properties as "name:type"; a trailing ? makes one optional, e.g. "name:string total:decimal?". Repeatable',
      collect,
      [] as string[],
    );
  }

  addSafetyOptions(command);

  command.action(async (name: string, options: GenerateComponentOptions) => {
    try {
      const root = await findProjectRoot(process.cwd());
      const plan = await planComponent({
        root,
        kind,
        name,
        module: options.module,
        fields: parseFields(options.fields ?? []),
      });
      const result = await applyChanges(plan.changeSet, {
        dryRun: options.dryRun,
        force: options.force,
      });

      console.log(
        options.dryRun === true
          ? formatComponentDryRun(plan, result)
          : formatComponentResult(plan, result),
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
