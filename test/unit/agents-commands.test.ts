import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { resolveConfig } from '../../src/config/index.js';
import { generateProject } from '../../src/generators/generate-project.js';
import type { PackageManager } from '../../src/utils/package-manager.js';

type Overrides = Parameters<typeof resolveConfig>[0];

interface PackageJson {
  readonly scripts?: Record<string, string>;
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
}

const ROOT_FILES = [
  'AGENTS.md',
  'CLAUDE.md',
  '.cursor/rules/project.mdc',
  '.cursor/rules/modules.mdc',
  '.cursor/rules/prisma.mdc',
  '.github/copilot-instructions.md',
];

const FEATURE_SETS: ReadonlyArray<readonly [string, Overrides]> = [
  ['default', {}],
  ['jwt', { auth: 'jwt' }],
  ['redis', { redis: true }],
  ['jwt + redis', { auth: 'jwt', redis: true }],
  ['no testing', { testing: false }],
  [
    'minimal',
    { swagger: false, docker: false, ci: false, testing: false },
  ],
];

const PACKAGE_MANAGERS: readonly PackageManager[] = ['npm', 'pnpm', 'yarn'];

const PM_BINARIES = ['npm', 'npx', 'pnpm', 'yarn'];

/** Commands the agent files tell an agent to run, in the order they appear. */
export function extractCommands(markdown: string): string[] {
  const commands: string[] = [];
  // Notes after `#` in a fenced line are prose: keep them so inline commands
  // mentioned there (e.g. `npm run lint:fix`) are checked too.
  const withoutFences = markdown.replace(
    /```bash\n([\s\S]*?)```/g,
    (_match, block: string) => {
      const notes: string[] = [];
      for (const line of block.split('\n')) {
        const [command, ...note] = line.split(/\s+#\s/);
        if (command?.trim()) commands.push(command.trim());
        notes.push(note.join(' # '));
      }
      return notes.join('\n');
    },
  );

  for (const span of withoutFences.matchAll(/`([^`\n]+)`/g)) {
    for (const part of (span[1] ?? '').split(/\s+&&\s+/)) {
      const first = part.trim().split(/\s+/)[0] ?? '';
      if ([...PM_BINARIES, 'docker'].includes(first)) {
        commands.push(part.trim());
      }
    }
  }

  return commands;
}

function composeServices(compose: string): string[] {
  const block = /^services:\n((?:[ \t]+.*\n|\n)*)/m.exec(compose)?.[1] ?? '';
  return [...block.matchAll(/^ {2}([\w-]+):/gm)].map((m) => m[1] as string);
}

/** Returns a description of what is wrong with `command`, or null if valid. */
export function problemWith(
  command: string,
  pm: PackageManager,
  pkg: PackageJson,
  services: readonly string[],
): string | null {
  const [bin = '', ...args] = command.split(/\s+/);
  const scripts = pkg.scripts ?? {};
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  if (bin === 'docker') {
    if (args[0] !== 'compose') return `unexpected docker command`;
    const up = args.indexOf('up');
    const named = up === -1 ? [] : args.slice(up + 1).filter((a) => !a.startsWith('-'));
    const missing = named.filter((name) => !services.includes(name));
    return missing.length > 0
      ? `docker-compose.yml has no service ${missing.join(', ')}`
      : null;
  }

  const expectedBinaries = { npm: ['npm', 'npx'], pnpm: ['pnpm'], yarn: ['yarn'] }[pm];
  if (!expectedBinaries.includes(bin)) {
    return `uses ${bin} but the project's package manager is ${pm}`;
  }

  let scriptName: string | undefined;
  let tool: string | undefined;

  if (bin === 'npx') tool = args[0];
  else if (bin === 'pnpm' && args[0] === 'exec') tool = args[1];
  else if (bin === 'npm' && args[0] === 'run') scriptName = args[1];
  else if (bin === 'pnpm' && args[0] === 'run') scriptName = args[1];
  else if (args[0] === 'install') return null;
  else if (args[0] === 'test' && bin !== 'yarn') scriptName = 'test';
  else if (bin === 'yarn') {
    // `yarn <x>` runs a script if one exists, otherwise a local binary.
    const target = args[0] ?? '';
    if (target in scripts) scriptName = target;
    else tool = target;
  } else return `cannot interpret "${command}"`;

  if (scriptName !== undefined) {
    return scriptName in scripts
      ? null
      : `package.json has no "${scriptName}" script`;
  }
  if (tool === 'prisma') {
    const sub = (bin === 'npx' ? args.slice(1) : bin === 'pnpm' ? args.slice(2) : args.slice(1))
      .join(' ');
    if (!deps['prisma']) return 'prisma is not a dependency';
    return /^(generate|migrate dev --name \S+|migrate deploy)$/.test(sub)
      ? null
      : `unexpected prisma subcommand "${sub}"`;
  }
  return `unknown tool ${tool ?? '(none)'}`;
}

describe('extractCommands / problemWith (helpers)', () => {
  const pkg: PackageJson = {
    scripts: { lint: 'x', test: 'x', 'docker:up': 'x' },
    devDependencies: { prisma: '1' },
  };

  it('extracts fenced commands without notes and inline commands', () => {
    const md = [
      '```bash',
      'npm install            # install',
      'npm run lint          # ESLint; `npm run lint:fix` fixes',
      '```',
      'Run `npm run lint` && `npm test` first.',
      'Use `PrismaService`, not `console.log`.',
    ].join('\n');

    expect(extractCommands(md)).toEqual([
      'npm install',
      'npm run lint',
      'npm run lint:fix',
      'npm run lint',
      'npm test',
    ]);
  });

  it('accepts a real script and rejects a missing one', () => {
    expect(problemWith('npm run lint', 'npm', pkg, [])).toBeNull();
    expect(problemWith('npm run nope', 'npm', pkg, [])).toContain('"nope"');
  });

  it('rejects another package manager', () => {
    expect(problemWith('pnpm run lint', 'npm', pkg, [])).toContain('package manager');
  });

  it('checks docker compose services', () => {
    expect(problemWith('docker compose up -d postgres redis', 'npm', pkg, ['postgres'])).toContain('redis');
  });

  it('checks yarn scripts and binaries', () => {
    expect(problemWith('yarn lint', 'yarn', pkg, [])).toBeNull();
    expect(problemWith('yarn prisma generate', 'yarn', pkg, [])).toBeNull();
    expect(problemWith('yarn nope', 'yarn', pkg, [])).toContain('unknown tool');
  });
});

describe('every command in the agent files exists in the generated project', () => {
  const directories: string[] = [];

  afterAll(async () => {
    await Promise.all(
      directories.map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  for (const pm of PACKAGE_MANAGERS) {
    for (const [label, overrides] of FEATURE_SETS) {
      it(`${pm}, ${label}`, async () => {
        const dir = await mkdtemp(path.join(os.tmpdir(), 'ironveil-cmds-'));
        directories.push(dir);

        const { destination } = await generateProject(
          resolveConfig({
            projectName: 'cmd-api',
            packageManager: pm,
            ai: 'all',
            ...overrides,
          }),
          dir,
        );

        const pkg = JSON.parse(
          await readFile(path.join(destination, 'package.json'), 'utf8'),
        ) as PackageJson;
        const services = await readFile(
          path.join(destination, 'docker-compose.yml'),
          'utf8',
        ).then(composeServices, () => []);

        const problems: string[] = [];
        let checked = 0;

        for (const file of ROOT_FILES) {
          const markdown = await readFile(path.join(destination, file), 'utf8');
          for (const command of extractCommands(markdown)) {
            checked += 1;
            const problem = problemWith(command, pm, pkg, services);
            if (problem) problems.push(`${file}: \`${command}\` -> ${problem}`);
          }
        }

        expect(checked).toBeGreaterThan(5);
        expect(problems).toEqual([]);
      });
    }
  }
});
