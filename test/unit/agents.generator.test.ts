import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveConfig } from '../../src/config/index.js';
import { generateProject } from '../../src/generators/generate-project.js';
import { AgentsGenerator } from '../../src/generators/features/agents/agents.generator.js';
import { buildAgentsMd } from '../../src/generators/features/agents/agents-md.js';
import { createFileSystem } from '../../src/utils/filesystem.js';

type Overrides = Parameters<typeof resolveConfig>[0];

function render(overrides: Overrides = {}): string {
  return buildAgentsMd(resolveConfig({ projectName: 'test-api', ...overrides }));
}

describe('AgentsGenerator', () => {
  let temporaryDirectory: string;

  afterEach(async () => {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it('always runs', () => {
    const generator = new AgentsGenerator();
    expect(generator.name).toBe('agents');
    expect(generator.shouldRun(resolveConfig({ projectName: 'a' }))).toBe(true);
  });

  it('writes AGENTS.md at the project root', async () => {
    temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'ironveil-agents-'),
    );
    const config = resolveConfig({ projectName: 'test-api', auth: 'jwt' });
    const { destination, files } = await generateProject(
      config,
      temporaryDirectory,
    );

    expect(files).toContain('AGENTS.md');
    const content = await createFileSystem().readFile(
      path.join(destination, 'AGENTS.md'),
    );
    expect(content).toBe(buildAgentsMd(config));
  });
});

describe('AgentsGenerator ai levels', () => {
  let dir: string;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  async function files(ai: 'none' | 'agents' | 'all') {
    dir = await mkdtemp(path.join(os.tmpdir(), 'ironveil-ai-'));
    const result = await generateProject(
      resolveConfig({ projectName: 'test-api', ai }),
      dir,
    );
    const fs = createFileSystem();
    return {
      generated: result.files,
      read: (file: string) => fs.readFile(path.join(result.destination, file)),
    };
  }

  const AI_FILES = [
    'AGENTS.md',
    'CLAUDE.md',
    '.cursor/rules/project.mdc',
    '.cursor/rules/modules.mdc',
    '.cursor/rules/prisma.mdc',
    '.github/copilot-instructions.md',
  ];

  it("generates no AI files when ai is 'none'", async () => {
    const { generated } = await files('none');
    for (const file of AI_FILES) expect(generated).not.toContain(file);
  });

  it("generates AGENTS.md and CLAUDE.md for 'agents'", async () => {
    const { generated, read } = await files('agents');

    expect(generated).toContain('AGENTS.md');
    expect(generated).toContain('CLAUDE.md');
    expect(generated.filter((f) => f.startsWith('.cursor/'))).toEqual([]);
    expect(generated).not.toContain('.github/copilot-instructions.md');
    expect(await read('CLAUDE.md')).toContain('@AGENTS.md');
  });

  it("generates every AI file for 'all', next to the CI workflow", async () => {
    const { generated, read } = await files('all');

    for (const file of AI_FILES) expect(generated).toContain(file);
    expect(generated).toContain('.github/workflows/ci.yml');
    expect(await read('.cursor/rules/project.mdc')).toContain('@AGENTS.md');
    expect(await read('.github/copilot-instructions.md')).toContain(
      'AGENTS.md',
    );
  });
});

describe('buildAgentsMd', () => {
  it('names the project and covers the core sections', () => {
    const md = render();

    expect(md).toContain('# AGENTS.md');
    expect(md).toContain('**test-api**');
    for (const heading of [
      '## Architecture',
      '## Commands',
      '## How to add a module',
      '## How to add a Prisma model',
      '## How to add an endpoint',
      '## Conventions',
      '## Testing',
      '## Do not',
    ]) {
      expect(md).toContain(heading);
    }
  });

  it('explains common vs infrastructure vs modules', () => {
    const md = render();

    expect(md).toContain('src/modules/<feature>/');
    expect(md).toContain('src/infrastructure/');
    expect(md).toContain('src/common/');
    expect(md).toContain('src/app.module.ts');
  });

  it('never leaves unresolved placeholders and ends with a newline', () => {
    for (const overrides of [
      {},
      { auth: 'jwt' as const, redis: true },
      { swagger: false, docker: false, ci: false, testing: false },
    ]) {
      const md = render(overrides);
      expect(md).not.toMatch(/\{\{|undefined|\[object/);
      expect(md.endsWith('\n')).toBe(true);
      expect(md.endsWith('\n\n')).toBe(false);
    }
  });

  describe('package manager commands', () => {
    it.each([
      ['npm', 'npm run lint', 'npx prisma migrate dev --name <change>'],
      ['pnpm', 'pnpm run lint', 'pnpm exec prisma migrate dev --name <change>'],
      ['yarn', 'yarn lint', 'yarn prisma migrate dev --name <change>'],
    ] as const)('uses %s commands only', (packageManager, lint, migrate) => {
      const md = render({ packageManager });

      expect(md).toContain(lint);
      expect(md).toContain(migrate);

      const others = (['npm', 'pnpm', 'yarn'] as const).filter(
        (name) => name !== packageManager,
      );
      for (const other of others) {
        // `pnpm exec` contains no "npm run", but "npx" must not leak into pnpm/yarn.
        expect(md).not.toMatch(new RegExp(`\\b${other} (run|install|exec)\\b`));
      }
      if (packageManager !== 'npm') {
        expect(md).not.toContain('npx ');
      }
    });
  });

  describe('feature-dependent sections', () => {
    it('includes auth guidance only with --auth jwt', () => {
      const withAuth = render({ auth: 'jwt' });
      expect(withAuth).toContain('## Authentication and authorization');
      expect(withAuth).toContain('@Public()');
      expect(withAuth).toContain('@Roles(Role.ADMIN)');
      expect(withAuth).toContain('@CurrentUser()');
      expect(withAuth).toContain('src/modules/auth/');

      const withoutAuth = render({ auth: 'none' });
      expect(withoutAuth).not.toContain('Authentication and authorization');
      expect(withoutAuth).not.toContain('@Public()');
      expect(withoutAuth).not.toContain('@Roles');
      expect(withoutAuth).not.toContain('@CurrentUser');
      expect(withoutAuth).not.toContain('JwtAuthGuard');
      expect(withoutAuth).not.toContain('JWT_SECRET');
      expect(withoutAuth).not.toContain('src/modules/auth');
    });

    it('includes Redis guidance only with --redis', () => {
      const withRedis = render({ redis: true });
      expect(withRedis).toContain('## Redis');
      expect(withRedis).toContain('RedisService');
      expect(withRedis).toContain('docker compose up -d postgres redis');

      const withoutRedis = render({ redis: false });
      expect(withoutRedis).not.toContain('## Redis');
      expect(withoutRedis).not.toContain('RedisService');
      expect(withoutRedis).not.toContain('RedisModule');
      expect(withoutRedis).toContain('docker compose up -d postgres');
      expect(withoutRedis).not.toContain('postgres redis');
    });

    it('includes job queue guidance only with --queue', () => {
      const withQueue = render({ redis: true, queue: true });
      expect(withQueue).toContain('## Job queue (BullMQ)');
      expect(withQueue).toContain('src/infrastructure/queue/');
      expect(withQueue).toContain('BullModule.registerQueue');
      expect(withQueue).toContain('@Processor');
      expect(withQueue).toContain('@InjectQueue');
      expect(withQueue).toContain('getQueueToken');
      expect(withQueue).toContain('queue/');
      expect(withQueue).toMatch(/idempotent/i);
      expect(withQueue).toMatch(/every spec that boots `AppModule`/i);
      expect(withQueue).toContain('Worker requires a connection');

      const withoutQueue = render({ redis: true });
      expect(withoutQueue).not.toContain('## Job queue');
      expect(withoutQueue).not.toContain('BullMQ');
      expect(withoutQueue).not.toContain('@Processor');
    });

    it('lists the queue folder in the architecture tree right after redis', () => {
      const lines = render({ redis: true, queue: true }).split('\n');
      const redis = lines.findIndex((line) => line.includes('redis/') && line.includes('RedisModule'));

      expect(redis).toBeGreaterThan(-1);
      expect(lines[redis + 1]).toMatch(/queue\/\s+# global BullMQ connection/);
    });

    it('includes Swagger guidance only when Swagger is enabled', () => {
      const withSwagger = render({ swagger: true });
      expect(withSwagger).toContain('## API documentation');
      expect(withSwagger).toContain('/api/docs');
      expect(withSwagger).toContain('@ApiProperty');

      const withoutSwagger = render({ swagger: false });
      expect(withoutSwagger).not.toContain('## API documentation');
      expect(withoutSwagger).not.toMatch(/swagger/i);
      expect(withoutSwagger).not.toContain('@ApiProperty');
    });

    it('only lists Docker commands when Docker is enabled', () => {
      expect(render({ docker: true })).toContain('docker:up');
      const md = render({ docker: false });
      expect(md).not.toContain('docker');
      expect(md).not.toContain('Docker');
    });

    it('mentions CI only when CI is enabled', () => {
      expect(render({ ci: true })).toContain('.github/workflows/ci.yml');
      expect(render({ ci: false })).not.toContain('ci.yml');
    });

    it('drops test commands when testing is disabled', () => {
      const withTesting = render({ testing: true });
      expect(withTesting).toContain('npm test');
      expect(withTesting).toContain('npm run test:e2e');
      expect(withTesting).toContain('*.spec.ts');
      expect(withTesting).toContain('*.e2e-spec.ts');

      const withoutTesting = render({ testing: false });
      expect(withoutTesting).not.toContain('npm test');
      expect(withoutTesting).not.toContain('test:e2e');
      expect(withoutTesting).not.toContain('jest');
      expect(withoutTesting).toContain('generated without a test runner');
    });
  });

  it('draws a well-formed architecture tree for every combination', () => {
    for (const overrides of [
      {},
      { auth: 'jwt' as const, redis: true },
      { swagger: false },
    ]) {
      const md = render(overrides);
      const tree = md.split('```')[1] ?? '';
      const lines = tree.split('\n').filter(Boolean);

      // Exactly one last top-level entry, and it is the final top-level line.
      const topLevel = lines.filter((line) => /^[├└]── /.test(line));
      expect(topLevel.filter((line) => line.startsWith('└── '))).toHaveLength(1);
      expect(topLevel[topLevel.length - 1]).toMatch(/^└── modules\//);

      // Every nested group closes with └── and has no └── followed by a sibling.
      lines.forEach((line, index) => {
        const next = lines[index + 1];
        if (/^(│   |    )└── /.test(line) && next) {
          expect(next).toMatch(/^[├└]── /);
        }
      });
    }
  });

  it('keeps commands and their comments separated', () => {
    const md = render({ packageManager: 'npm' });
    const block = md.split('```bash')[1]?.split('```')[0] ?? '';

    for (const line of block.split('\n').filter((l) => l.includes('#'))) {
      expect(line).toMatch(/\S {2,}# /);
    }
  });

  it('numbers steps consecutively whatever features are enabled', () => {
    for (const overrides of [
      {},
      { auth: 'jwt' as const },
      { swagger: false, testing: false },
      { auth: 'jwt' as const, swagger: false, testing: false },
    ]) {
      const md = render(overrides);
      const sections = md.split('\n## ').filter((section) =>
        section.startsWith('How to add'),
      );
      expect(sections).toHaveLength(3);

      for (const section of sections) {
        const numbers = [...section.matchAll(/^(\d+)\. /gm)].map((m) =>
          Number(m[1]),
        );
        expect(numbers).toEqual(numbers.map((_, index) => index + 1));
      }
    }
  });

  it('documents the project conventions the generated code actually follows', () => {
    const md = render({ auth: 'jwt' });

    expect(md).toContain('ValidationPipe');
    expect(md).toContain('class-validator');
    expect(md).toContain('AllExceptionsFilter');
    expect(md).toContain('requestId');
    expect(md).toContain('P2002');
    expect(md).toContain('P2025');
    expect(md).toContain('ConfigService');
    expect(md).toContain('.env.example');
    expect(md).toContain('prisma/migrations/');
    expect(md).toContain('PrismaService');
  });
});
