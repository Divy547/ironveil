import type { IronveilConfig } from '../../../config/index.js';
import { getPackageManagerSpec } from '../../../utils/package-manager.js';
import { buildAgentsMd } from './agents-md.js';

export interface AgentFile {
  /** Path relative to the project root, with forward slashes. */
  readonly path: string;
  readonly content: string;
}

/**
 * Every AI-agent file for the chosen `ai` level.
 *
 * `AGENTS.md` is the single source of truth. Every other file only points at
 * it (naming sections that `agent-files.test.ts` verifies exist), so there is
 * nothing to keep in sync by hand.
 */
export function getAgentFiles(
  config: IronveilConfig,
): readonly AgentFile[] {
  if (config.ai === 'none') {
    return [];
  }

  const files: AgentFile[] = [
    { path: 'AGENTS.md', content: buildAgentsMd(config) },
    { path: 'CLAUDE.md', content: buildClaudeMd(config) },
  ];

  if (config.ai === 'all') {
    files.push(
      ...buildCursorRules(config),
      {
        path: '.github/copilot-instructions.md',
        content: buildCopilotInstructions(config),
      },
    );
  }

  return files;
}

export function buildClaudeMd(_config: IronveilConfig): string {
  return [
    '# CLAUDE.md',
    '',
    '@AGENTS.md',
    '',
    'The shared rules for every AI tool live in `AGENTS.md`, imported above. Put guidance that only applies to Claude Code below this line and keep everything else in `AGENTS.md`.',
    '',
  ].join('\n');
}

export function buildCursorRules(
  _config: IronveilConfig,
): readonly AgentFile[] {
  return [
    {
      path: '.cursor/rules/project.mdc',
      content: mdc({
        description:
          'Project architecture, commands and conventions for this NestJS backend',
        alwaysApply: true,
        body: 'Follow @AGENTS.md for the architecture, commands and conventions of this project. Run the checks listed in its "Commands" section before finishing a task.',
      }),
    },
    {
      path: '.cursor/rules/modules.mdc',
      content: mdc({
        description: 'Adding or changing NestJS modules, controllers and DTOs',
        globs: 'src/modules/**/*.ts',
        alwaysApply: false,
        body: 'Follow the "How to add a module" and "How to add an endpoint" sections of @AGENTS.md.',
      }),
    },
    {
      path: '.cursor/rules/prisma.mdc',
      content: mdc({
        description: 'Changing the Prisma schema and migrations',
        globs: 'prisma/**/*',
        alwaysApply: false,
        body: 'Follow the "How to add a Prisma model" section of @AGENTS.md. Never edit a migration that was already applied or committed.',
      }),
    },
  ];
}

export function buildCopilotInstructions(
  config: IronveilConfig,
): string {
  const pm = getPackageManagerSpec(config.packageManager);
  const checks = [
    pm.run('lint'),
    pm.run('typecheck'),
    ...(config.testing ? [pm.run('test')] : []),
    pm.run('build'),
  ];

  return [
    '# Copilot instructions',
    '',
    'Read and follow `AGENTS.md` in the repository root. It describes the architecture (`src/common`, `src/infrastructure`, `src/modules`), the commands, how to add a module, Prisma model or endpoint, and the coding conventions.',
    '',
    `Before finishing a task, run ${checks.map((check) => `\`${check}\``).join(', ')} and fix what they report.`,
    '',
  ].join('\n');
}

function mdc(options: {
  readonly description: string;
  readonly globs?: string;
  readonly alwaysApply: boolean;
  readonly body: string;
}): string {
  return [
    '---',
    `description: ${options.description}`,
    ...(options.globs ? [`globs: ${options.globs}`] : []),
    `alwaysApply: ${options.alwaysApply}`,
    '---',
    '',
    options.body,
    '',
  ].join('\n');
}
