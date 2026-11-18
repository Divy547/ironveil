import type { AddPlan } from '../../adding/index.js';
import type { ApplyResult } from '../../safety/index.js';
import { getPackageManagerSpec } from '../../utils/package-manager.js';

function label(plan: AddPlan): string {
  return plan.feature === 'ai' ? `ai (${plan.after.ai})` : plan.feature;
}

function fileLines(plan: AddPlan, labels: { create: string; modify: string }): string[] {
  return plan.changeSet.changes.map(
    (change) => `  ${labels[change.kind]}  ${change.path}`,
  );
}

function noteLines(plan: AddPlan): string[] {
  return plan.notes.length === 0
    ? []
    : ['', 'Notes:', ...plan.notes.map((note) => `  - ${note}`)];
}

function nextSteps(plan: AddPlan): string[] {
  const pm = getPackageManagerSpec(plan.after.packageManager);
  const steps: string[] = [];

  if (plan.dependenciesChanged) {
    steps.push(`${pm.install}   # install what ${plan.feature} added to package.json`);
  }

  switch (plan.feature) {
    case 'testing':
      steps.push(pm.run('test'));
      break;
    case 'docker':
      steps.push(`${pm.run('docker:up')}   # build and start the API with its services`);
      break;
    case 'ci':
      steps.push('Commit .github/workflows/ci.yml; it runs on pushes and pull requests.');
      break;
    case 'ai':
      steps.push('Read AGENTS.md and adjust it to your project before committing.');
      break;
  }

  return ['', 'Next steps:', ...steps.map((step) => `  ${step}`)];
}

export function formatAddResult(plan: AddPlan, result: ApplyResult): string {
  if (plan.alreadyEnabled) {
    return `${label(plan)} is already enabled in this project; nothing to do.`;
  }

  if (result.files.length === 0) {
    return `Nothing to change: this project already has everything ${label(plan)} adds.`;
  }

  return [
    `Added ${label(plan)}.`,
    '',
    'Files:',
    ...fileLines(plan, { create: 'created', modify: 'updated' }),
    ...noteLines(plan),
    ...nextSteps(plan),
  ].join('\n');
}

export function formatAddDryRun(plan: AddPlan, result: ApplyResult): string {
  if (plan.alreadyEnabled) {
    return `Dry run: ${label(plan)} is already enabled in this project; nothing would change.`;
  }

  if (result.files.length === 0) {
    return `Dry run: this project already has everything ${label(plan)} adds; nothing would change.`;
  }

  return [
    `Dry run: adding ${label(plan)} would change ${result.files.length} file(s).`,
    '',
    ...fileLines(plan, { create: 'create', modify: 'modify' }),
    ...noteLines(plan),
    '',
    result.diff.trimEnd(),
    '',
    'No files were written.',
  ].join('\n');
}
