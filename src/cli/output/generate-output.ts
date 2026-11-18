import { ConfigError } from '../../config/resolve.js';
import { EditError } from '../../editing/index.js';
import { ManifestError } from '../../manifest/index.js';
import { SafetyError, type ApplyResult } from '../../safety/index.js';
import { GenerateError, type ResourcePlan } from '../../scaffolding/index.js';
import { getPackageManagerSpec } from '../../utils/package-manager.js';

function fileLines(plan: ResourcePlan, labels: { create: string; modify: string }): string[] {
  return plan.changeSet.changes.map(
    (change) => `  ${labels[change.kind]}  ${change.path}`,
  );
}

function routeLines(plan: ResourcePlan): string[] {
  const route = `/${plan.names.pluralKebab}`;
  return [
    `  POST   ${route}`,
    `  GET    ${route}?page=1&limit=20`,
    `  GET    ${route}/:id`,
    `  PATCH  ${route}/:id`,
    `  DELETE ${route}/:id`,
  ];
}

export function formatResourceResult(
  plan: ResourcePlan,
  result: ApplyResult,
): string {
  const { pascal } = plan.names;

  if (result.files.length === 0) {
    return `Resource ${pascal} is already generated; nothing to do.`;
  }

  const pm = getPackageManagerSpec(plan.config.packageManager);
  const lines = [
    `Generated resource ${pascal}.`,
    '',
    'Files:',
    ...fileLines(plan, { create: 'created', modify: 'updated' }),
    '',
    'Routes:',
    ...routeLines(plan),
  ];

  if (plan.migration !== null) {
    lines.push(
      '',
      'Next steps:',
      `  ${pm.run('db:generate')}   # refresh the Prisma client with the new model`,
      `  ${pm.run('db:migrate')}   # apply prisma/migrations/${plan.migration}`,
      ...(plan.config.testing ? [`  ${pm.run('test')}`] : []),
    );
  }

  return lines.join('\n');
}

export function formatResourceDryRun(
  plan: ResourcePlan,
  result: ApplyResult,
): string {
  if (result.files.length === 0) {
    return `Dry run: resource ${plan.names.pascal} is already generated; nothing would change.`;
  }

  return [
    `Dry run: resource ${plan.names.pascal} would change ${result.files.length} file(s).`,
    '',
    ...fileLines(plan, { create: 'create', modify: 'modify' }),
    '',
    result.diff.trimEnd(),
    '',
    'No files were written.',
  ].join('\n');
}

/**
 * Errors the editing commands throw on purpose, all of which happen before
 * (or roll back) any write, so it is safe to say nothing was changed.
 */
export function formatEditFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (
    error instanceof GenerateError ||
    error instanceof SafetyError ||
    error instanceof ManifestError ||
    error instanceof EditError ||
    error instanceof ConfigError
  ) {
    return `${message}\n\nNo files were changed.`;
  }

  return message;
}
