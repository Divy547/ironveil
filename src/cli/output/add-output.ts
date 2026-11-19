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
    case 'swagger':
      steps.push('Start the API and open /api/docs for the interactive API documentation.');
      break;
    case 'redis':
      steps.push(
        'Copy REDIS_URL from .env.example into your own .env (it is required, and .env is never edited by add).',
      );
      if (plan.after.docker) {
        steps.push('docker compose up -d redis   # or point REDIS_URL at an existing Redis');
      }
      break;
    case 'queue':
      steps.push(
        'Register a queue in the module that owns it with BullModule.registerQueue({ name }) and write a @Processor class; the README has a "Background Jobs (BullMQ)" section.',
        'In tests, override both the queue (getQueueToken) and its processor, or they will try to reach Redis.',
      );
      break;
    case 'mail':
      steps.push(
        'Copy MAIL_HOST, MAIL_PORT, MAIL_SECURE, MAIL_USER, MAIL_PASSWORD and MAIL_FROM from .env.example into your own .env (MAIL_HOST and MAIL_FROM are required, and .env is never edited by add).',
      );
      if (plan.after.docker) {
        steps.push('docker compose up -d mailpit   # local SMTP catcher, inbox at http://localhost:8025');
      }
      steps.push(
        'Inject MailService and call send({ to, subject, text }); the README has an "Email (SMTP)" section.',
        'In tests, override MailService with overrideProvider(MailService).useValue({ send: jest.fn() }) so nothing connects to SMTP.',
      );
      break;
    case 'auth':
      steps.push(
        'Copy JWT_SECRET, JWT_ACCESS_TTL_SECONDS and JWT_REFRESH_TTL_DAYS from .env.example into your own .env, ' +
          'and set JWT_SECRET to a random string of at least 32 characters (the app will not start without it).',
        `${pm.run('db:generate')}   # the Prisma client needs the new Role and RefreshToken types`,
        `${pm.run('db:migrate')}   # applies ${plan.migration ?? 'the new migration'}; use db:migrate:deploy in CI and production`,
      );
      if (plan.after.testing) steps.push(pm.run('test'));
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
