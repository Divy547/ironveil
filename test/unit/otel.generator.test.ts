import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveConfig } from '../../src/config/index.js';
import type { IronveilConfigInput } from '../../src/config/index.js';
import { IRONVEIL_VERSIONS } from '../../src/config/versions.js';
import { createGenerationContext } from '../../src/generators/core/generation-context.js';
import { OtelGenerator } from '../../src/generators/features/otel/otel.generator.js';
import { createTemplateLoader } from '../../src/rendering/template-loader.js';
import { createTemplateRenderer } from '../../src/rendering/template-renderer.js';
import { getTemplatesDirectory } from '../../src/rendering/template-path.js';
import { createFileSystem } from '../../src/utils/filesystem.js';

interface TelemetryOptions {
  enabled: boolean;
  serviceName: string;
  endpoint: string;
}

interface State {
  recordTelemetry(options: TelemetryOptions, shutdown?: () => Promise<void>): void;
  getTelemetryOptions(): TelemetryOptions | undefined;
  shutdownTelemetry(timeoutMs?: number): Promise<void>;
}

interface Helpers {
  resolveTelemetryOptions(
    env: Record<string, string | undefined>,
    defaultServiceName: string,
  ): TelemetryOptions;
  isIgnoredRequestPath(url: string | undefined): boolean;
}

describe('OtelGenerator', () => {
  // Some tests generate more than one project; remove every directory.
  const created: string[] = [];
  let dir: string | undefined;

  afterEach(async () => {
    await Promise.all(
      created.splice(0).map((path) => rm(path, { recursive: true, force: true })),
    );
    dir = undefined;
  });

  async function generate(overrides: Partial<IronveilConfigInput> = {}) {
    // Inside the repo so the generated helper file can be imported.
    const projectDir = await mkdtemp(path.join(process.cwd(), 'test', '.tmp-otel-'));
    created.push(projectDir);
    dir = projectDir;

    const fs = createFileSystem();
    const config = resolveConfig({ projectName: 'test-api', otel: true, ...overrides });

    await fs.writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'test-api', scripts: {}, dependencies: {}, devDependencies: {} }),
    );

    await new OtelGenerator().generate(
      createGenerationContext(
        config,
        dir,
        fs,
        createTemplateLoader(getTemplatesDirectory(), fs),
        createTemplateRenderer(),
      ),
    );

    const read = (relative: string) => readFile(path.join(projectDir, relative), 'utf8');
    const helpers = (await import(
      /* @vite-ignore */ pathToFileURL(
        path.join(dir, 'src/infrastructure/telemetry/telemetry-options.ts'),
      ).href
    )) as Helpers;
    const pkg = JSON.parse(await read('package.json')) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };

    // The directory is new for every call, so this module (which keeps
    // module-level state) is a fresh copy each time.
    const state = (await import(
      /* @vite-ignore */ pathToFileURL(
        path.join(dir, 'src/infrastructure/telemetry/telemetry-state.ts'),
      ).href
    )) as State;

    return { read, helpers, pkg, state };
  }

  it('has the otel generator contract', () => {
    const generator = new OtelGenerator();

    expect(generator.name).toBe('otel');
    expect(generator.shouldRun(resolveConfig({ projectName: 'test-api', otel: true }))).toBe(true);
    expect(generator.shouldRun(resolveConfig({ projectName: 'test-api' }))).toBe(false);
  });

  it('works without Redis and without auth, because tracing needs neither', () => {
    expect(resolveConfig({ projectName: 'test-api', otel: true }).otel).toBe(true);
  });

  it('writes the options helper, the state helper, the SDK bootstrap, the entry import and the module', async () => {
    const { read } = await generate();

    expect(await read('src/infrastructure/telemetry/telemetry-options.ts')).toContain(
      'resolveTelemetryOptions',
    );
    expect(await read('src/infrastructure/telemetry/telemetry-state.ts')).toContain(
      'shutdownTelemetry',
    );
    expect(await read('src/infrastructure/telemetry/telemetry-sdk.ts')).toContain('NodeSDK');
    expect(await read('src/infrastructure/telemetry/tracing.ts')).toContain('startTelemetry');
    expect(await read('src/infrastructure/telemetry/telemetry.module.ts')).toContain(
      'TelemetryModule',
    );
  });

  describe('dependencies', () => {
    it('adds the SDK, the OTLP exporter and the instrumentations as dependencies, pinned', async () => {
      const { pkg } = await generate();

      expect(pkg.dependencies).toEqual(IRONVEIL_VERSIONS.dependencies.otel);
      expect(pkg.dependencies['@opentelemetry/api']).toBe('1.10.0');
      expect(pkg.dependencies['@opentelemetry/sdk-node']).toBe('0.301.2');
      expect(pkg.dependencies['@opentelemetry/exporter-trace-otlp-http']).toBe('0.301.2');
      expect(pkg.dependencies['@opentelemetry/instrumentation-http']).toBe('0.301.2');
      expect(pkg.dependencies['@opentelemetry/instrumentation-express']).toBeDefined();
      expect(pkg.dependencies['@opentelemetry/instrumentation-nestjs-core']).toBeDefined();
      expect(pkg.dependencies['@opentelemetry/instrumentation-pino']).toBeDefined();
      expect(pkg.dependencies['@prisma/instrumentation']).toBeDefined();
    });

    it('adds no devDependencies', async () => {
      const { pkg } = await generate();

      expect(pkg.devDependencies).toEqual({});
    });

    it('adds the ioredis instrumentation only when Redis is enabled', async () => {
      const withRedis = await generate({ redis: true });
      expect(withRedis.pkg.dependencies['@opentelemetry/instrumentation-ioredis']).toBe(
        IRONVEIL_VERSIONS.dependencies.otelRedis['@opentelemetry/instrumentation-ioredis'],
      );

      const without = await generate({});
      expect(without.pkg.dependencies['@opentelemetry/instrumentation-ioredis']).toBeUndefined();
    });
  });

  describe('SDK bootstrap', () => {
    it('registers the instrumentations the generated app actually uses', async () => {
      const { read } = await generate();
      const sdk = await read('src/infrastructure/telemetry/telemetry-sdk.ts');

      for (const name of [
        'HttpInstrumentation',
        'ExpressInstrumentation',
        'NestInstrumentation',
        'PinoInstrumentation',
        'PrismaInstrumentation',
        'OTLPTraceExporter',
      ]) {
        expect(sdk).toContain(name);
      }
    });

    it('instruments ioredis only when Redis is enabled, and only inside a trace', async () => {
      const withRedis = await (await generate({ redis: true })).read(
        'src/infrastructure/telemetry/telemetry-sdk.ts',
      );
      expect(withRedis).toContain('IORedisInstrumentation');
      // The default of the instrumentation, spelled out on purpose: a BullMQ
      // worker polls Redis with no request around it, and `false` would turn
      // every poll into a root span (the e2e checks this on a live server).
      expect(withRedis).toMatch(/requireParentSpan:\s*true/);

      const without = await (await generate({})).read(
        'src/infrastructure/telemetry/telemetry-sdk.ts',
      );
      expect(without).not.toContain('IORedis');
      expect(without).not.toContain('ioredis');
    });

    it('does not trace health probes', async () => {
      const { read } = await generate();
      const sdk = await read('src/infrastructure/telemetry/telemetry-sdk.ts');

      expect(sdk).toContain('ignoreIncomingRequestHook');
      expect(sdk).toContain('isIgnoredRequestPath');
    });

    it('uses the project name as the default service name', async () => {
      const { read } = await generate();

      expect(await read('src/infrastructure/telemetry/telemetry-sdk.ts')).toContain("'test-api'");
    });

    it('lets the SDK read the standard OTLP environment variables itself', async () => {
      const { read } = await generate();
      const sdk = await read('src/infrastructure/telemetry/telemetry-sdk.ts');

      expect(sdk).toMatch(/new OTLPTraceExporter\(\)/);
    });

    it('does nothing when telemetry is disabled', async () => {
      const { read } = await generate();
      const sdk = await read('src/infrastructure/telemetry/telemetry-sdk.ts');

      expect(sdk).toMatch(/if \(!options\.enabled\)/);
    });

    it('must load before the libraries it patches, so it imports none of them', async () => {
      const { read } = await generate({ redis: true });

      for (const file of ['telemetry-sdk.ts', 'tracing.ts', 'telemetry-options.ts', 'telemetry-state.ts']) {
        const source = await read(`src/infrastructure/telemetry/${file}`);
        const imports = [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1]);

        for (const specifier of imports) {
          expect(specifier, `${file} imports ${specifier}`).not.toMatch(
            /^(@nestjs\/|express$|pino|nestjs-pino|ioredis|@prisma\/client)/,
          );
        }
      }
    });

    it('loads .env before starting, ignoring only a missing file', async () => {
      const { read } = await generate();
      const tracing = await read('src/infrastructure/telemetry/tracing.ts');

      // ConfigModule reads .env later, so the SDK would not see OTEL_* without this.
      expect(tracing).toContain('process.loadEnvFile()');
      expect(tracing).toContain("'ENOENT'");
      expect(tracing.indexOf('loadEnvFile')).toBeLessThan(tracing.indexOf('startTelemetry()'));
    });

    it('does not install a SIGTERM handler, which would stop Nest from exiting', async () => {
      const { read } = await generate();

      for (const file of ['telemetry-sdk.ts', 'telemetry-state.ts', 'tracing.ts', 'telemetry.module.ts']) {
        const source = await read(`src/infrastructure/telemetry/${file}`);
        expect(source, file).not.toMatch(/process\.(on|once)\(/);
        expect(source, file).not.toContain('SIGTERM');
      }
    });
  });

  describe('TelemetryModule', () => {
    it('flushes spans in onApplicationShutdown', async () => {
      const { read } = await generate();
      const source = await read('src/infrastructure/telemetry/telemetry.module.ts');

      expect(source).toContain('OnApplicationShutdown');
      expect(source).toMatch(/onApplicationShutdown\(\)[\s\S]*shutdownTelemetry\(\)/);
    });

    it('never starts the SDK itself, so compiling AppModule in a test stays inert', async () => {
      const { read } = await generate();
      const source = await read('src/infrastructure/telemetry/telemetry.module.ts');

      expect(source).not.toContain('startTelemetry(');
      expect(source).not.toContain("from './tracing'");
    });

    it('imports only the state helper, so a spec that compiles AppModule does not load the SDK', async () => {
      const { read } = await generate();
      const source = await read('src/infrastructure/telemetry/telemetry.module.ts');
      const imports = [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1]);

      expect(imports).toContain('./telemetry-state');
      expect(imports).not.toContain('./telemetry-sdk');
      expect(imports.filter((specifier) => specifier.startsWith('@opentelemetry'))).toEqual([]);
    });

    it('reports through the Nest logger, not console', async () => {
      const { read } = await generate();
      const source = await read('src/infrastructure/telemetry/telemetry.module.ts');

      expect(source).toContain('Logger');
      expect(source).not.toContain('console.');
    });
  });

  describe('resolveTelemetryOptions', () => {
    it('is enabled by default, named after the project, exporting to local OTLP', async () => {
      const { helpers } = await generate();

      expect(helpers.resolveTelemetryOptions({}, 'my-api')).toEqual({
        enabled: true,
        serviceName: 'my-api',
        endpoint: 'http://localhost:4318',
      });
    });

    it('is disabled by the standard OTEL_SDK_DISABLED switch, in any case or spacing', async () => {
      const { helpers } = await generate();

      for (const value of ['true', 'TRUE', ' true ']) {
        expect(
          helpers.resolveTelemetryOptions({ OTEL_SDK_DISABLED: value }, 'my-api').enabled,
          value,
        ).toBe(false);
      }
      expect(helpers.resolveTelemetryOptions({ OTEL_SDK_DISABLED: 'false' }, 'a').enabled).toBe(
        true,
      );
    });

    it('is always disabled when NODE_ENV is test', async () => {
      const { helpers } = await generate();

      expect(helpers.resolveTelemetryOptions({ NODE_ENV: 'test' }, 'a').enabled).toBe(false);
      expect(
        helpers.resolveTelemetryOptions({ NODE_ENV: 'test', OTEL_SDK_DISABLED: 'false' }, 'a')
          .enabled,
      ).toBe(false);
      expect(helpers.resolveTelemetryOptions({ NODE_ENV: 'production' }, 'a').enabled).toBe(true);
    });

    it('takes the service name from OTEL_SERVICE_NAME, trimmed, ignoring a blank value', async () => {
      const { helpers } = await generate();

      expect(
        helpers.resolveTelemetryOptions({ OTEL_SERVICE_NAME: ' billing ' }, 'my-api').serviceName,
      ).toBe('billing');
      expect(helpers.resolveTelemetryOptions({ OTEL_SERVICE_NAME: '  ' }, 'my-api').serviceName).toBe(
        'my-api',
      );
      expect(helpers.resolveTelemetryOptions({ OTEL_SERVICE_NAME: '' }, 'my-api').serviceName).toBe(
        'my-api',
      );
    });

    it('reports the traces endpoint first, then the general one, then the local default', async () => {
      const { helpers } = await generate();
      const endpoint = (env: Record<string, string>) =>
        helpers.resolveTelemetryOptions(env, 'a').endpoint;

      expect(
        endpoint({
          OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318',
          OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://traces:4318/v1/traces',
        }),
      ).toBe('http://traces:4318/v1/traces');
      expect(endpoint({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318' })).toBe(
        'http://collector:4318',
      );
      expect(endpoint({})).toBe('http://localhost:4318');
    });
  });

  describe('telemetry state', () => {
    const options: TelemetryOptions = {
      enabled: true,
      serviceName: 'svc',
      endpoint: 'http://localhost:4318',
    };

    it('knows nothing until the SDK records itself, and shutting down then does nothing', async () => {
      const { state } = await generate();

      expect(state.getTelemetryOptions()).toBeUndefined();
      await expect(state.shutdownTelemetry()).resolves.toBeUndefined();
    });

    it('returns what was recorded, also for a disabled run with no shutdown function', async () => {
      const { state } = await generate();

      state.recordTelemetry({ ...options, enabled: false });

      expect(state.getTelemetryOptions()).toEqual({ ...options, enabled: false });
      await expect(state.shutdownTelemetry()).resolves.toBeUndefined();
    });

    it('calls the SDK shutdown once, however often shutdown is requested', async () => {
      const { state } = await generate();
      let calls = 0;
      state.recordTelemetry(options, async () => {
        calls += 1;
      });

      await state.shutdownTelemetry();
      await state.shutdownTelemetry();

      expect(calls).toBe(1);
    });

    it('never rejects, so a collector that is down cannot break application shutdown', async () => {
      const { state } = await generate();
      state.recordTelemetry(options, () => Promise.reject(new Error('collector unreachable')));

      await expect(state.shutdownTelemetry()).resolves.toBeUndefined();
    });

    it('gives up waiting for the flush after the timeout', async () => {
      const { state } = await generate();
      state.recordTelemetry(options, () => new Promise<void>(() => {}));

      const started = Date.now();
      await state.shutdownTelemetry(30);

      expect(Date.now() - started).toBeLessThan(1000);
    });

    it('does not keep the process alive with its timeout timer', async () => {
      const { read } = await generate();

      expect(await read('src/infrastructure/telemetry/telemetry-state.ts')).toContain('.unref()');
    });

    it('waits at most 5 seconds by default, well inside a container stop grace period', async () => {
      const { read } = await generate();

      expect(await read('src/infrastructure/telemetry/telemetry-state.ts')).toMatch(
        /timeoutMs\s*=\s*5_?000/,
      );
    });
  });

  describe('isIgnoredRequestPath', () => {
    it('ignores the health probes, with or without a query string', async () => {
      const { helpers } = await generate();

      for (const url of ['/health', '/health/', '/health/ready', '/health?verbose=1', '/health/ready?x=1']) {
        expect(helpers.isIgnoredRequestPath(url), url).toBe(true);
      }
    });

    it('keeps every other path, including look-alikes', async () => {
      const { helpers } = await generate();

      for (const url of ['/', '/products', '/healthy', '/healthcheck', '/api/health', '/v1/health', undefined]) {
        expect(helpers.isIgnoredRequestPath(url), String(url)).toBe(false);
      }
    });
  });
});
