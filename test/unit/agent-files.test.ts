import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../../src/config/index.js';
import { buildAgentsMd } from '../../src/generators/features/agents/agents-md.js';
import {
  buildClaudeMd,
  buildCopilotInstructions,
  buildCursorRules,
  getAgentFiles,
} from '../../src/generators/features/agents/agent-files.js';

type Overrides = Parameters<typeof resolveConfig>[0];

function config(overrides: Overrides = {}) {
  return resolveConfig({ projectName: 'test-api', ...overrides });
}

function paths(overrides: Overrides = {}): string[] {
  return getAgentFiles(config(overrides)).map((file) => file.path);
}

/** Every double-quoted string in a pointer file must name an AGENTS.md section. */
function referencedSections(content: string): string[] {
  return [...content.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
}

function headings(markdown: string): string[] {
  return [...markdown.matchAll(/^## (.+)$/gm)].map((m) => m[1]!);
}

describe('getAgentFiles', () => {
  it("writes nothing when ai is 'none'", () => {
    expect(paths({ ai: 'none' })).toEqual([]);
  });

  it("writes AGENTS.md and CLAUDE.md when ai is 'agents'", () => {
    expect(paths({ ai: 'agents' })).toEqual(['AGENTS.md', 'CLAUDE.md']);
  });

  it("also writes Cursor rules and Copilot instructions when ai is 'all'", () => {
    expect(paths({ ai: 'all' })).toEqual([
      'AGENTS.md',
      'CLAUDE.md',
      '.cursor/rules/project.mdc',
      '.cursor/rules/modules.mdc',
      '.cursor/rules/prisma.mdc',
      '.github/copilot-instructions.md',
    ]);
  });

  it('defaults to the agents level', () => {
    expect(paths()).toEqual(['AGENTS.md', 'CLAUDE.md']);
  });

  it('uses AGENTS.md content from buildAgentsMd, unchanged', () => {
    const cfg = config({ auth: 'jwt', ai: 'all' });
    const agents = getAgentFiles(cfg).find((f) => f.path === 'AGENTS.md');
    expect(agents?.content).toBe(buildAgentsMd(cfg));
  });

  it('never returns an absolute path, a parent traversal or an empty file', () => {
    for (const file of getAgentFiles(config({ ai: 'all' }))) {
      expect(file.path.startsWith('/')).toBe(false);
      expect(file.path).not.toContain('..');
      expect(file.content.trim().length).toBeGreaterThan(0);
      expect(file.content.endsWith('\n')).toBe(true);
    }
  });
});

describe('buildClaudeMd', () => {
  it('imports AGENTS.md instead of copying it', () => {
    const md = buildClaudeMd(config());

    expect(md).toMatch(/^# CLAUDE\.md$/m);
    expect(md).toMatch(/^@AGENTS\.md$/m);
    expect(md).not.toContain('## Architecture');
    expect(md).not.toContain('## Commands');
    expect(md.split('\n').length).toBeLessThan(15);
  });

  it('tells readers where Claude-specific notes belong', () => {
    expect(buildClaudeMd(config())).toMatch(/AGENTS\.md/g);
    expect(buildClaudeMd(config())).toMatch(/Claude/);
  });
});

describe('buildCursorRules', () => {
  const rules = buildCursorRules(config({ ai: 'all' }));

  it('creates a project-wide rule plus scoped ones', () => {
    expect(rules.map((rule) => rule.path)).toEqual([
      '.cursor/rules/project.mdc',
      '.cursor/rules/modules.mdc',
      '.cursor/rules/prisma.mdc',
    ]);
  });

  it.each(rules.map((rule) => [rule.path, rule.content] as const))(
    '%s has valid Cursor frontmatter',
    (_path, content) => {
      const match = /^---\n([\s\S]*?)\n---\n/.exec(content);
      expect(match, 'frontmatter block').not.toBeNull();

      const frontmatter = match![1]!;
      expect(frontmatter).toMatch(/^description: \S.+$/m);
      expect(frontmatter).toMatch(/^alwaysApply: (true|false)$/m);
      // The body must follow the frontmatter and point at AGENTS.md.
      expect(content.slice(match![0].length)).toContain('@AGENTS.md');
    },
  );

  it('applies the project rule to every request', () => {
    const project = rules[0]!.content;
    expect(project).toMatch(/^alwaysApply: true$/m);
    expect(project).not.toMatch(/^globs:/m);
  });

  it('scopes the other rules by file glob instead of always applying', () => {
    const modules = rules[1]!.content;
    const prisma = rules[2]!.content;

    expect(modules).toMatch(/^alwaysApply: false$/m);
    expect(modules).toMatch(/^globs: src\/modules\/\*\*\/\*\.ts$/m);
    expect(prisma).toMatch(/^alwaysApply: false$/m);
    expect(prisma).toMatch(/^globs: prisma\/\*\*\/\*$/m);
  });
});

describe('buildCopilotInstructions', () => {
  it('points at AGENTS.md and lists the commands to run before finishing', () => {
    const md = buildCopilotInstructions(config({ packageManager: 'pnpm' }));

    expect(md).toContain('AGENTS.md');
    expect(md).toContain('pnpm run lint');
    expect(md).toContain('pnpm run typecheck');
    expect(md).toContain('pnpm test');
    expect(md).toContain('pnpm run build');
  });

  it('drops the test command when testing is disabled', () => {
    const md = buildCopilotInstructions(config({ testing: false }));

    expect(md).toContain('npm run lint');
    expect(md).not.toContain('npm test');
  });
});

describe('single source of truth', () => {
  const variants: Overrides[] = [
    { ai: 'all' },
    { ai: 'all', auth: 'jwt', redis: true },
    { ai: 'all', swagger: false, testing: false, docker: false, ci: false },
  ];

  it('every section a pointer file names exists in AGENTS.md', () => {
    for (const overrides of variants) {
      const cfg = config(overrides);
      const agentsHeadings = headings(buildAgentsMd(cfg));

      for (const file of getAgentFiles(cfg)) {
        if (file.path === 'AGENTS.md') continue;

        for (const section of referencedSections(file.content)) {
          expect(
            agentsHeadings,
            `${file.path} references "${section}"`,
          ).toContain(section);
        }
      }
    }
  });

  it('the scoped rules do reference concrete sections (guards the check above)', () => {
    const [, modules, prisma] = buildCursorRules(config({ ai: 'all' }));

    expect(referencedSections(modules!.content)).toEqual([
      'How to add a module',
      'How to add an endpoint',
    ]);
    expect(referencedSections(prisma!.content)).toEqual([
      'How to add a Prisma model',
    ]);
  });

  it('pointer files do not copy AGENTS.md prose', () => {
    const agents = buildAgentsMd(config({ ai: 'all' }));
    const agentLines = new Set(
      agents.split('\n').filter((line) => line.trim().length > 40),
    );

    for (const file of getAgentFiles(config({ ai: 'all' }))) {
      if (file.path === 'AGENTS.md') continue;
      for (const line of file.content.split('\n')) {
        expect(
          agentLines.has(line),
          `${file.path} copies: ${line}`,
        ).toBe(false);
      }
    }
  });

  it('no file leaves placeholders or undefined behind', () => {
    for (const overrides of variants) {
      for (const file of getAgentFiles(config(overrides))) {
        expect(file.content).not.toMatch(/\{\{|undefined|\[object/);
      }
    }
  });
});
