import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../../src/config/index.js';
import {
  buildCopilotInstructions,
  getAgentFiles,
} from '../../src/generators/features/agents/agent-files.js';
import { buildAgentsMd } from '../../src/generators/features/agents/agents-md.js';

type Overrides = Parameters<typeof resolveConfig>[0];

const SNAPSHOT_DIR = path.join(import.meta.dirname, '__snapshots__', 'agents');

/**
 * One reviewable `.md` snapshot per feature combination. A generator change
 * that alters what agents are told shows up as a diff in these files. After an
 * intended change, run `pnpm exec vitest run -u test/unit/agents-snapshots.test.ts`
 * and review the diff before committing.
 */
const COMBINATIONS: ReadonlyArray<readonly [string, Overrides]> = [
  ['default', {}],
  ['jwt', { auth: 'jwt' }],
  ['redis', { redis: true }],
  ['jwt-redis', { auth: 'jwt', redis: true }],
  ['jwt-redis-queue', { auth: 'jwt', redis: true, queue: true }],
  ['jwt-mail', { auth: 'jwt', mail: true }],
  ['redis-otel', { redis: true, otel: true }],
  ['no-swagger', { swagger: false }],
  ['no-testing', { testing: false }],
  ['no-docker-no-ci', { docker: false, ci: false }],
  [
    'minimal',
    { swagger: false, docker: false, ci: false, testing: false },
  ],
  ['pnpm-full', { packageManager: 'pnpm', auth: 'jwt', redis: true }],
  ['yarn-full', { packageManager: 'yarn', auth: 'jwt', redis: true }],
];

function config(overrides: Overrides) {
  return resolveConfig({ projectName: 'snapshot-api', ...overrides });
}

describe('AGENTS.md snapshots', () => {
  for (const [name, overrides] of COMBINATIONS) {
    it(name, async () => {
      await expect(buildAgentsMd(config(overrides))).toMatchFileSnapshot(
        path.join(SNAPSHOT_DIR, `${name}.AGENTS.md`),
      );
    });
  }
});

describe('companion agent file snapshots', () => {
  it('ai=all writes the expected files, in a stable order', async () => {
    const files = getAgentFiles(config({ ai: 'all', auth: 'jwt' }));

    await expect(
      files.map((file) => file.path).join('\n') + '\n',
    ).toMatchFileSnapshot(path.join(SNAPSHOT_DIR, 'ai-all.files.txt'));
  });

  it('ai=agents and ai=none write the expected files', () => {
    expect(getAgentFiles(config({ ai: 'agents' })).map((f) => f.path)).toEqual([
      'AGENTS.md',
      'CLAUDE.md',
    ]);
    expect(getAgentFiles(config({ ai: 'none' }))).toEqual([]);
  });

  it('ai=all files (CLAUDE.md, Cursor rules, Copilot)', async () => {
    const files = getAgentFiles(config({ ai: 'all' }))
      .filter((file) => file.path !== 'AGENTS.md')
      .map((file) => `=== ${file.path} ===\n${file.content}`)
      .join('\n');

    await expect(files).toMatchFileSnapshot(
      path.join(SNAPSHOT_DIR, 'ai-all.companions.txt'),
    );
  });

  for (const pm of ['npm', 'pnpm', 'yarn'] as const) {
    for (const testing of [true, false]) {
      it(`copilot instructions, ${pm}, testing=${testing}`, async () => {
        await expect(
          buildCopilotInstructions(config({ packageManager: pm, testing })),
        ).toMatchFileSnapshot(
          path.join(SNAPSHOT_DIR, `copilot-${pm}-${testing ? 'test' : 'notest'}.md`),
        );
      });
    }
  }
});
