import { mkdir, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
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
const CREATED_DATABASE_URL = `postgresql://postgres:postgres@localhost:5432/ironveil-otel-e2e-${stamp}?schema=public`;
const ADDED_DATABASE_URL = `postgresql://postgres:postgres@localhost:5432/ironveil-otel-add-e2e-${stamp}?schema=public`;
const REDIS_URL = 'redis://localhost:6379';
const SERVICE_NAME = 'otel-e2e';

interface SpanRecord {
  readonly service: string | undefined;
  readonly scope: string;
  readonly name: string;
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId: string;
  readonly kind: number;
  /** Every attribute value, flattened to text so tests can search it. */
  readonly attributes: string;
}

interface OtlpSink {
  readonly port: number;
  readonly spans: SpanRecord[];
  close(): Promise<void>;
}

interface OtlpValue {
  stringValue?: string;
  intValue?: string | number;
  boolValue?: boolean;
}

interface OtlpPayload {
  resourceSpans?: Array<{
    resource?: { attributes?: Array<{ key: string; value: OtlpValue }> };
    scopeSpans?: Array<{
      scope?: { name?: string };
      spans?: Array<{
        traceId: string;
        spanId: string;
        parentSpanId?: string;
        name: string;
        kind: number;
        attributes?: Array<{ key: string; value: OtlpValue }>;
      }>;
    }>;
  }>;
}

/**
 * A minimal OTLP/HTTP collector: accepts the JSON trace export the generated
 * app sends and keeps the spans, which is all the tests need to know what was
 * traced and what was not.
 */
async function startOtlpSink(): Promise<OtlpSink> {
  const spans: SpanRecord[] = [];

  const server = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      try {
        let body = Buffer.concat(chunks);
        if (request.headers['content-encoding'] === 'gzip') {
          body = gunzipSync(body);
        }
        const payload = JSON.parse(body.toString('utf8')) as OtlpPayload;

        for (const resourceSpans of payload.resourceSpans ?? []) {
          const service = resourceSpans.resource?.attributes?.find(
            (attribute) => attribute.key === 'service.name',
          )?.value.stringValue;

          for (const scopeSpans of resourceSpans.scopeSpans ?? []) {
            for (const span of scopeSpans.spans ?? []) {
              spans.push({
                service,
                scope: scopeSpans.scope?.name ?? '',
                name: span.name,
                traceId: span.traceId,
                spanId: span.spanId,
                parentSpanId: span.parentSpanId ?? '',
                kind: span.kind,
                attributes: (span.attributes ?? [])
                  .map(
                    ({ key, value }) =>
                      `${key}=${value.stringValue ?? value.intValue ?? value.boolValue}`,
                  )
                  .join(' '),
              });
            }
          }
        }
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end('{}');
      } catch {
        response.writeHead(400);
        response.end();
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as net.AddressInfo;

  return {
    port,
    spans,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** A port nothing listens on, for the "collector is down" case. */
async function closedPort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as net.AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

async function waitFor(condition: () => boolean, timeoutMs = 20_000): Promise<void> {
  const startedAt = Date.now();
  while (!condition()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Condition not met within ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A feature module written the way AGENTS.md tells an agent to write one: it
 * logs through the Nest logger, makes a custom span with `@opentelemetry/api`
 * and uses the global RedisService. Lint-clean on purpose, since the pipeline
 * lints it.
 */
const PROBE_MODULE = `import {
  Controller,
  Get,
  Logger,
  Module,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import { RedisService } from '../../infrastructure/redis/redis.service';

@Controller('probe')
export class ProbeController implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProbeController.name);

  constructor(private readonly redis: RedisService) {}

  // A Redis call with no request around it, like a background worker polling:
  // it must not become a root span.
  async onApplicationBootstrap(): Promise<void> {
    await this.redis.ping();
  }

  @Get()
  async probe(): Promise<{ ok: true }> {
    this.logger.log('probe handled');

    await trace
      .getTracer('e2e')
      .startActiveSpan('probe-work', async (span) => {
        try {
          await this.redis.set('ironveil:otel-e2e', '1');
        } finally {
          span.end();
        }
      });

    return { ok: true };
  }
}

@Module({ controllers: [ProbeController] })
export class ProbeModule {}
`;

async function addProbeModule(root: string): Promise<void> {
  await mkdir(path.join(root, 'src/modules/probe'), { recursive: true });
  await writeFile(path.join(root, 'src/modules/probe/probe.module.ts'), PROBE_MODULE);

  const appModulePath = path.join(root, 'src/app.module.ts');
  const appModule = await readFile(appModulePath, 'utf8');
  expect(appModule).toContain('HealthModule,');
  await writeFile(
    appModulePath,
    appModule
      .replace(
        "import { HealthModule }",
        "import { ProbeModule } from './modules/probe/probe.module';\nimport { HealthModule }",
      )
      .replace('HealthModule,\n', 'HealthModule,\n    ProbeModule,\n'),
  );
}

/** Environment for the booted server: production, so logs are JSON and tracing may run. */
function productionEnv(endpoint: string): Record<string, string> {
  return {
    NODE_ENV: 'production',
    OTEL_EXPORTER_OTLP_ENDPOINT: endpoint,
    // Export almost immediately instead of every 5 seconds.
    OTEL_BSP_SCHEDULE_DELAY: '200',
  };
}

/**
 * Sends traffic to the live server and checks what reached the collector: one
 * trace holding the HTTP request, Express, Nest, a custom span and a Redis
 * call, a Prisma span for a database request, and nothing for health probes.
 * Returns the trace id so the logs can be checked after shutdown.
 */
function assertTracesAreExported(sink: OtlpSink, found: { traceId?: string }) {
  return async (server: TestServer): Promise<void> => {
    expect((await fetch(`${server.baseUrl}/probe`)).status).toBe(200);
    expect((await fetch(`${server.baseUrl}/products`)).status).toBe(200);

    await waitFor(() => sink.spans.some((span) => span.name === 'probe-work'));

    // The request for /products and the Prisma spans its query produced.
    const productsTraceId = (): string | undefined =>
      sink.spans.find((span) => span.kind === 2 && span.attributes.includes('/products'))
        ?.traceId;
    await waitFor(() => {
      const traceId = productsTraceId();
      return (
        traceId !== undefined &&
        sink.spans.some((span) => span.traceId === traceId && span.scope === 'prisma')
      );
    });

    // Every span says which service it came from.
    expect(new Set(sink.spans.map((span) => span.service))).toEqual(new Set([SERVICE_NAME]));

    const custom = sink.spans.find((span) => span.name === 'probe-work');
    expect(custom?.scope).toBe('e2e');
    const traceId = custom?.traceId as string;
    const inTrace = sink.spans.filter((span) => span.traceId === traceId);
    const scopes = new Set(inTrace.map((span) => span.scope));

    // The request is the root of that trace (a server span) and everything
    // else hangs off it: Express, Nest, the custom span and the Redis call.
    const root = inTrace.find((span) => span.kind === 2);
    expect(root, 'no server span in the probe trace').toBeDefined();
    expect(root?.attributes).toContain('/probe');
    expect(scopes).toContain('@opentelemetry/instrumentation-express');
    expect(scopes).toContain('@opentelemetry/instrumentation-nestjs-core');
    expect(scopes).toContain('@opentelemetry/instrumentation-ioredis');
    expect(custom?.parentSpanId).not.toBe('');

    // The database request is traced under its own request, through Prisma.
    const productsSpans = sink.spans.filter((span) => span.traceId === productsTraceId());
    expect(productsSpans.map((span) => span.scope)).toContain('prisma');
    expect(productsSpans.some((span) => span.name.startsWith('prisma:client:operation'))).toBe(true);

    // Redis is only traced inside a request: the PING at bootstrap, like a
    // BullMQ worker polling, must not become a root span.
    const redisSpans = sink.spans.filter(
      (span) => span.scope === '@opentelemetry/instrumentation-ioredis',
    );
    expect(redisSpans.length).toBeGreaterThan(0);
    for (const span of redisSpans) {
      expect(span.parentSpanId, `root ioredis span "${span.name}"`).not.toBe('');
    }

    // The health probes already ran in assertHealthy; none of them is traced.
    for (const span of sink.spans) {
      expect(span.attributes, `span "${span.name}" mentions /health`).not.toContain('/health');
    }

    found.traceId = traceId;
  };
}

describe('Ironveil otel E2E', () => {
  let project: Awaited<ReturnType<typeof createGeneratedProject>> | undefined;
  let sink: OtlpSink | undefined;

  afterEach(async () => {
    await project?.cleanup();
    await sink?.close();
    project = undefined;
    sink = undefined;
  });

  function otelEnv(port: number): Record<string, string> {
    return {
      OTEL_SERVICE_NAME: SERVICE_NAME,
      OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${port}`,
    };
  }

  it(
    'a project created with otel installs, lints, builds, passes its tests, stays silent under NODE_ENV=test, exports correlated traces in production and shuts down cleanly even when the collector is down',
    async () => {
      sink = await startOtlpSink();
      project = await createGeneratedProject(
        resolveConfig({ projectName: 'generated-otel-api', redis: true, otel: true }),
        'ironveil-otel-e2e',
      );
      const root = project.root;

      const resource = await planResource({
        root,
        name: 'product',
        fields: parseFields('name:string price:decimal'),
      });
      await applyChanges(resource.changeSet);
      await addProbeModule(root);

      await prepareProject(project, {
        databaseUrl: CREATED_DATABASE_URL,
        redisUrl: REDIS_URL,
        extra: otelEnv(sink.port),
      });

      await project.assertManifestMatchesVersions();
      // Compiling AppModule with TelemetryModule must not start the SDK: these
      // would hang or fail if it did, with no collector in the jest run.
      await project.test();
      await project.testE2e();

      // 1. NODE_ENV=test: the app works and nothing is exported.
      await assertBootsAndShutsDownCleanly(project, {
        redis: true,
        serverEnv: { NODE_ENV: 'test', OTEL_BSP_SCHEDULE_DELAY: '200' },
        exercise: async (server) => {
          expect((await fetch(`${server.baseUrl}/probe`)).status).toBe(200);
          await sleep(1500);
          expect(sink?.spans).toHaveLength(0);
        },
      });

      // 2. Production: spans arrive, correlated with the logs.
      const found: { traceId?: string } = {};
      await assertBootsAndShutsDownCleanly(project, {
        redis: true,
        serverEnv: productionEnv(`http://127.0.0.1:${sink.port}`),
        exercise: assertTracesAreExported(sink, found),
        afterShutdown: (result) => {
          expect(found.traceId).toBeDefined();
          expect(
            result.output,
            'no log line carries the trace id of the traced request',
          ).toContain(`"trace_id":"${found.traceId}"`);
          expect(result.output).toContain('Tracing enabled for');
        },
      });

      // 3. The collector is down: requests still work, and SIGTERM neither
      //    hangs nor fails (the flush gives up after 5 seconds at most).
      const down = await closedPort();
      let requested = 0;
      await assertBootsAndShutsDownCleanly(project, {
        redis: true,
        serverEnv: productionEnv(`http://127.0.0.1:${down}`),
        exercise: async (server) => {
          expect((await fetch(`${server.baseUrl}/probe`)).status).toBe(200);
          await sleep(500);
          requested = Date.now();
        },
        afterShutdown: () => {
          expect(Date.now() - requested).toBeLessThan(12_000);
        },
      });
    },
    900_000,
  );

  it(
    'a project that gains otel with `add otel` next to an existing resource and Redis builds, passes its tests, exports traces and shuts down cleanly',
    async () => {
      sink = await startOtlpSink();
      project = await createGeneratedProject(
        resolveConfig({ projectName: 'generated-otel-add-api', redis: true }),
        'ironveil-otel-add-e2e',
      );
      const root = project.root;

      const resource = await planResource({
        root,
        name: 'product',
        fields: parseFields('name:string price:decimal'),
      });
      await applyChanges(resource.changeSet);

      const plan = await planAdd({ root, feature: 'otel' });
      expect(plan.alreadyEnabled).toBe(false);
      await applyChanges(plan.changeSet);

      // The tracing import went to the very top of main.ts.
      expect((await readFile(path.join(root, 'src/main.ts'), 'utf8')).split('\n')[0]).toBe(
        "import './infrastructure/telemetry/tracing';",
      );

      await addProbeModule(root);

      await prepareProject(project, {
        databaseUrl: ADDED_DATABASE_URL,
        redisUrl: REDIS_URL,
        extra: otelEnv(sink.port),
      });

      await project.test();
      await project.testE2e();

      const found: { traceId?: string } = {};
      await assertBootsAndShutsDownCleanly(project, {
        redis: true,
        serverEnv: productionEnv(`http://127.0.0.1:${sink.port}`),
        exercise: assertTracesAreExported(sink, found),
        afterShutdown: (result) => {
          expect(result.output).toContain(`"trace_id":"${found.traceId}"`);
        },
      });
    },
    900_000,
  );
});
