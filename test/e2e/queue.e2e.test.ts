import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { planAdd } from '../../src/adding/index.js';
import { resolveConfig } from '../../src/config/index.js';
import { applyChanges } from '../../src/safety/index.js';
import { parseFields, planResource } from '../../src/scaffolding/index.js';
import { createGeneratedProject } from './helpers/generated-project.js';
import {
  assertBootsAndShutsDownCleanly,
  prepareProject,
} from './helpers/runtime-checks.js';
import type { TestServer } from './helpers/test-server.js';

// A fresh database per run: `migrate deploy` creates it.
const stamp = Date.now();
const CREATED_DATABASE_URL = `postgresql://postgres:postgres@localhost:5432/ironveil-queue-e2e-${stamp}?schema=public`;
const ADDED_DATABASE_URL = `postgresql://postgres:postgres@localhost:5432/ironveil-queue-add-e2e-${stamp}?schema=public`;
const REDIS_URL = 'redis://localhost:6379';

/**
 * A feature module written the way AGENTS.md tells an agent to write one: it
 * registers its own queue, has a `@Processor`, and enqueues through
 * `@InjectQueue`. Lint-clean on purpose, since the pipeline lints it.
 */
const JOBS_MODULE = `import {
  BullModule,
  InjectQueue,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq';
import { Controller, Get, Injectable, Module, Param, Post } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';

export const DOUBLE_QUEUE = 'double';

@Processor(DOUBLE_QUEUE)
export class DoubleProcessor extends WorkerHost {
  readonly results: Record<string, number> = {};

  process(job: Job<{ n: number }>): Promise<number> {
    const result = job.data.n * 2;
    this.results[String(job.id)] = result;
    return Promise.resolve(result);
  }

  get(id: string): number | undefined {
    return this.results[id];
  }
}

@Injectable()
export class JobsService {
  constructor(
    @InjectQueue(DOUBLE_QUEUE) readonly queue: Queue,
    private readonly processor: DoubleProcessor,
  ) {}

  async enqueue(n: number): Promise<string> {
    const job = await this.queue.add('double', { n });
    return String(job.id);
  }

  result(id: string): number | undefined {
    return this.processor.get(id);
  }
}

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post(':n')
  async enqueue(@Param('n') n: string): Promise<{ id: string }> {
    return { id: await this.jobs.enqueue(Number(n)) };
  }

  @Get(':id')
  result(@Param('id') id: string): { result: number | null } {
    return { result: this.jobs.result(id) ?? null };
  }
}

@Module({
  imports: [BullModule.registerQueue({ name: DOUBLE_QUEUE })],
  controllers: [JobsController],
  providers: [DoubleProcessor, JobsService],
})
export class JobsModule {}
`;

/**
 * The test AGENTS.md describes: override the queue AND its processor, so the
 * app boots with no Redis behind it.
 */
const JOBS_SPEC = `import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { RedisService } from '../src/infrastructure/redis/redis.service';

process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/test_db?schema=public';
// Nothing listens here: the test must not need Redis.
process.env.REDIS_URL = 'redis://localhost:6399';

describe('jobs (e2e)', () => {
  it('boots with the queue and its processor overridden, and enqueues through the queue', async () => {
    const { AppModule } = await import('../src/app.module');
    const { DOUBLE_QUEUE, DoubleProcessor, JobsService } = await import(
      '../src/modules/jobs/jobs.module'
    );
    const add = jest.fn().mockResolvedValue({ id: '1' });

    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        onModuleInit: jest.fn(),
        onModuleDestroy: jest.fn(),
        $connect: jest.fn(),
        $disconnect: jest.fn(),
      })
      .overrideProvider(RedisService)
      .useValue({
        onModuleInit: jest.fn(),
        onModuleDestroy: jest.fn(),
        connect: jest.fn(),
        quit: jest.fn(),
      })
      .overrideProvider(getQueueToken(DOUBLE_QUEUE))
      .useValue({ add })
      .overrideProvider(DoubleProcessor)
      .useValue({})
      .compile();

    const app = moduleFixture.createNestApplication();
    await app.init();

    await expect(app.get(JobsService).enqueue(21)).resolves.toBe('1');
    expect(add).toHaveBeenCalledWith('double', { n: 21 });

    await app.close();
  });
});
`;

const SPEC_IMPORTS = `import { getQueueToken } from '@nestjs/bullmq';
import { DOUBLE_QUEUE, DoubleProcessor } from '../src/modules/jobs/jobs.module';
`;

const OVERRIDES = `.overrideProvider(getQueueToken(DOUBLE_QUEUE))
      .useValue({ add: jest.fn() })
      .overrideProvider(DoubleProcessor)
      .useValue({})`;

/**
 * Follows what AGENTS.md says: once a queue exists, every spec that boots
 * AppModule overrides the queue and its processor. Each spec is patched at the
 * one place the generators put its \`compile()\`, and a spec whose shape changed
 * fails here instead of being silently left without the overrides.
 */
async function overrideQueueInSpecs(root: string): Promise<void> {
  const specs: ReadonlyArray<{
    file: string;
    imports: string;
    compile: string;
    patched: string;
  }> = [
    {
      file: 'src/app.module.spec.ts',
      imports: SPEC_IMPORTS.replaceAll("'../src/", "'./"),
      compile: '}).compile();',
      patched: `})\n      ${OVERRIDES}\n      .compile();`,
    },
    {
      file: 'test/app.e2e-spec.ts',
      imports: SPEC_IMPORTS,
      compile: 'const moduleFixture: TestingModule = await moduleBuilder.compile();',
      patched: `moduleBuilder\n      ${OVERRIDES};\n\n    const moduleFixture: TestingModule = await moduleBuilder.compile();`,
    },
    {
      file: 'test/products.e2e-spec.ts',
      imports: SPEC_IMPORTS,
      compile: '      .compile();',
      patched: `      ${OVERRIDES}\n      .compile();`,
    },
  ];

  for (const { file, imports, compile, patched } of specs) {
    const specPath = path.join(root, file);
    let text: string;
    try {
      text = await readFile(specPath, 'utf8');
    } catch {
      // The product resource only exists in one of the two scenarios.
      if (file.includes('products')) continue;
      throw new Error(`${file} was not generated`);
    }

    expect(text, `${file}: compile() not found`).toContain(compile);
    expect(text, `${file}: no @nestjs/testing import to anchor on`).toContain(
      "import { Test",
    );

    await writeFile(
      specPath,
      text.replace(compile, patched).replace("import { Test", `${imports}import { Test`),
    );
  }
}

async function addJobsModule(root: string): Promise<void> {
  await mkdir(path.join(root, 'src/modules/jobs'), { recursive: true });
  await writeFile(path.join(root, 'src/modules/jobs/jobs.module.ts'), JOBS_MODULE);
  await writeFile(path.join(root, 'test/jobs.e2e-spec.ts'), JOBS_SPEC);

  const appModulePath = path.join(root, 'src/app.module.ts');
  const appModule = await readFile(appModulePath, 'utf8');
  expect(appModule).toContain('HealthModule,');
  await writeFile(
    appModulePath,
    appModule
      .replace(
        "import { HealthModule }",
        "import { JobsModule } from './modules/jobs/jobs.module';\nimport { HealthModule }",
      )
      .replace('HealthModule,\n', 'HealthModule,\n    JobsModule,\n'),
  );

  await overrideQueueInSpecs(root);
}

/** Enqueues a job through the live server and waits for the worker to finish it. */
async function assertJobIsProcessed(server: TestServer): Promise<void> {
  const enqueued = await fetch(`${server.baseUrl}/jobs/21`, { method: 'POST' });
  expect(enqueued.status).toBe(201);
  const { id } = (await enqueued.json()) as { id: string };
  expect(id).toBeTruthy();

  let result: number | null = null;
  for (let attempt = 0; attempt < 50 && result === null; attempt += 1) {
    const response = await fetch(`${server.baseUrl}/jobs/${id}`);
    result = ((await response.json()) as { result: number | null }).result;
    if (result === null) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  expect(result, 'the worker never processed the job').toBe(42);
}

describe('Ironveil queue E2E', () => {
  let project: Awaited<ReturnType<typeof createGeneratedProject>> | undefined;

  afterEach(async () => {
    await project?.cleanup();
    project = undefined;
  });

  it(
    'a project created with the queue installs, lints, builds, passes tests that override the queue, processes a real job and shuts down cleanly',
    async () => {
      project = await createGeneratedProject(
        resolveConfig({
          projectName: 'generated-queue-api',
          redis: true,
          queue: true,
        }),
        'ironveil-queue-e2e',
      );
      await addJobsModule(project.root);

      await prepareProject(project, {
        databaseUrl: CREATED_DATABASE_URL,
        redisUrl: REDIS_URL,
      });

      await project.test();
      await project.testE2e();

      await assertBootsAndShutsDownCleanly(project, {
        redis: true,
        exercise: assertJobIsProcessed,
      });
    },
    900_000,
  );

  it(
    'a project that gains the queue with `add queue` next to an existing resource builds, passes its tests, processes a real job and shuts down cleanly',
    async () => {
      project = await createGeneratedProject(
        resolveConfig({
          projectName: 'generated-queue-add-api',
          redis: true,
        }),
        'ironveil-queue-add-e2e',
      );
      const root = project.root;

      const resource = await planResource({
        root,
        name: 'product',
        fields: parseFields('name:string price:decimal'),
      });
      await applyChanges(resource.changeSet);

      const plan = await planAdd({ root, feature: 'queue' });
      expect(plan.alreadyEnabled).toBe(false);
      await applyChanges(plan.changeSet);

      await addJobsModule(root);

      await prepareProject(project, {
        databaseUrl: ADDED_DATABASE_URL,
        redisUrl: REDIS_URL,
      });

      await project.test();
      await project.testE2e();

      await assertBootsAndShutsDownCleanly(project, {
        redis: true,
        exercise: assertJobIsProcessed,
      });
    },
    900_000,
  );
});
