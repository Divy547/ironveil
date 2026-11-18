import { ConfigError } from '../../config/resolve.js';
import { EditError } from '../../editing/index.js';
import { ManifestError } from '../../manifest/index.js';
import { SafetyError, type ApplyResult } from '../../safety/index.js';
import {
  DEFAULT_AUTH_POLICY,
  GenerateError,
  routeAccess,
  type ComponentPlan,
  type ResourcePlan,
  type RouteKind,
} from '../../scaffolding/index.js';
import { getPackageManagerSpec } from '../../utils/package-manager.js';

function fileLines(plan: { changeSet: ResourcePlan['changeSet'] }, labels: { create: string; modify: string }): string[] {
  return plan.changeSet.changes.map(
    (change) => `  ${labels[change.kind]}  ${change.path}`,
  );
}

const ACCESS_LABELS = { token: 'any valid token', public: 'public', admin: 'admin only' } as const;

function routeLines(plan: ResourcePlan): string[] {
  const route = `/${plan.names.pluralKebab}`;
  const routes: Array<[string, string, RouteKind]> = [
    ['POST  ', route, 'write'],
    ['GET   ', `${route}?page=1&limit=20`, 'read'],
    ['GET   ', `${route}/:id`, 'read'],
    ['PATCH ', `${route}/:id`, 'write'],
    ['DELETE', `${route}/:id`, 'write'],
  ];
  // The default policy is what every route does anyway: say nothing about it.
  const annotate = plan.auth !== DEFAULT_AUTH_POLICY;
  const width = Math.max(...routes.map(([, path]) => path.length));

  return routes.map(([verb, path, kind]) =>
    annotate
      ? `  ${verb} ${path.padEnd(width)}  ${ACCESS_LABELS[routeAccess(plan.auth, kind)]}`
      : `  ${verb} ${path}`,
  );
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

const COMPONENT_HINTS: Partial<Record<ComponentPlan['kind'], string>> = {
  guard:
    'It rejects every request until you write its rule. Apply it with @UseGuards(...) on a controller or route.',
  dto: 'Import it where you need it; add --fields to generate its properties.',
};

export function formatComponentResult(
  plan: ComponentPlan,
  result: ApplyResult,
): string {
  const label = `${plan.kind} ${plan.names.pascal}`;

  if (result.files.length === 0) {
    return `The ${label} is already generated; nothing to do.`;
  }

  const hint = COMPONENT_HINTS[plan.kind];

  return [
    `Generated ${label}.`,
    '',
    'Files:',
    ...fileLines(plan, { create: 'created', modify: 'updated' }),
    ...(hint === undefined ? [] : ['', hint]),
  ].join('\n');
}

export function formatComponentDryRun(
  plan: ComponentPlan,
  result: ApplyResult,
): string {
  const label = `${plan.kind} ${plan.names.pascal}`;

  if (result.files.length === 0) {
    return `Dry run: the ${label} is already generated; nothing would change.`;
  }

  return [
    `Dry run: ${label} would change ${result.files.length} file(s).`,
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
