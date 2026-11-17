import {
  mkdtemp,
  readFile,
  rm,
} from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  afterEach,
  describe,
  expect,
  it,
} from 'vitest';
import { resolveConfig } from '../../src/config/index.js';
import { createGenerationContext } from '../../src/generators/core/generation-context.js';
import { ConfigGenerator } from '../../src/generators/features/config/config.generator.js';
import { createTemplateLoader } from '../../src/rendering/template-loader.js';
import { createTemplateRenderer } from '../../src/rendering/template-renderer.js';
import { getTemplatesDirectory } from '../../src/rendering/template-path.js';
import { createFileSystem } from '../../src/utils/filesystem.js';

type Validate = (
  env: Record<string, unknown>,
) => Record<string, unknown>;

const VALID_SECRET =
  'a-valid-secret-that-is-at-least-32-chars';

const COMBINATIONS = [
  { name: 'default', redis: false, auth: 'none' },
  { name: 'redis', redis: true, auth: 'none' },
  { name: 'jwt', redis: false, auth: 'jwt' },
  { name: 'redis + jwt', redis: true, auth: 'jwt' },
] as const;

describe('generated environment validation', () => {
  let dir: string | undefined;

  afterEach(async () => {
    if (dir) {
      await rm(dir, { recursive: true, force: true });
      dir = undefined;
    }
  });

  async function generate(
    redis: boolean,
    auth: 'none' | 'jwt',
  ) {
    // Inside the repo so the generated file can resolve `zod`.
    dir = await mkdtemp(
      path.join(process.cwd(), 'test', '.tmp-env-'),
    );

    const fs = createFileSystem();
    const config = resolveConfig({
      projectName: 'env-api',
      redis,
      auth,
    });

    await new ConfigGenerator().generate(
      createGenerationContext(
        config,
        dir,
        fs,
        createTemplateLoader(getTemplatesDirectory(), fs),
        createTemplateRenderer(),
      ),
    );

    const environmentSource = await readFile(
      path.join(
        dir,
        'src/infrastructure/config/environment.ts',
      ),
      'utf8',
    );
    const envExample = await readFile(
      path.join(dir, '.env.example'),
      'utf8',
    );

    // Load the generated file through vitest's TS transform and run it against the real zod.
    const loaded = (await import(
      /* @vite-ignore */ pathToFileURL(
        path.join(
          dir,
          'src/infrastructure/config/environment.ts',
        ),
      ).href
    )) as { validateEnvironment: Validate };

    return {
      environmentSource,
      envExample,
      validate: loaded.validateEnvironment,
    };
  }

  function exampleValues(envExample: string) {
    const values: Record<string, string> = {};

    for (const line of envExample.split('\n')) {
      const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());

      if (match) {
        values[match[1]] = match[2].replace(/^"|"$/g, '');
      }
    }

    return values;
  }

  function schemaKeys(source: string) {
    const body = source.slice(
      source.indexOf('z.object({'),
      source.indexOf('export type Environment'),
    );

    return [
      ...body.matchAll(/^ {2}([A-Z][A-Z0-9_]*):/gm),
    ].map((match) => match[1]);
  }

  describe.each(COMBINATIONS)(
    '$name',
    ({ redis, auth }) => {
      it('accepts the shipped .env.example as-is', async () => {
        const { envExample, validate } = await generate(redis, auth);

        expect(() =>
          validate(exampleValues(envExample)),
        ).not.toThrow();
      });

      it('keeps the schema and .env.example in sync', async () => {
        const { environmentSource, envExample } =
          await generate(redis, auth);

        expect(
          Object.keys(exampleValues(envExample)).sort(),
        ).toEqual(schemaKeys(environmentSource).sort());
      });
    },
  );

  it('reports every missing required variable at once with a clear message', async () => {
    const { validate } = await generate(true, 'jwt');

    expect(() => validate({})).toThrowError(
      /Invalid environment configuration:[\s\S]*- DATABASE_URL is required[\s\S]*- REDIS_URL is required[\s\S]*- JWT_SECRET is required[\s\S]*\.env\.example/,
    );
  });

  it('does not say "received undefined" for missing variables', async () => {
    const { validate } = await generate(true, 'jwt');

    expect(() => validate({})).not.toThrowError(/undefined/);
  });

  it('requires JWT_SECRET when jwt auth is enabled', async () => {
    const { validate, envExample } = await generate(false, 'jwt');
    const { JWT_SECRET: _omitted, ...rest } =
      exampleValues(envExample);

    expect(() => validate(rest)).toThrowError(
      /JWT_SECRET is required/,
    );
  });

  it('rejects a short JWT_SECRET and an empty DATABASE_URL', async () => {
    const { validate, envExample } = await generate(false, 'jwt');

    expect(() =>
      validate({
        ...exampleValues(envExample),
        JWT_SECRET: 'too-short',
        DATABASE_URL: '',
      }),
    ).toThrowError(
      /- DATABASE_URL must not be empty\n  - JWT_SECRET must be at least 32 characters\n\n/,
    );
  });

  it('rejects URLs with the wrong scheme', async () => {
    const { validate, envExample } = await generate(true, 'none');

    expect(() =>
      validate({
        ...exampleValues(envExample),
        DATABASE_URL: 'mysql://localhost/db',
        REDIS_URL: 'http://localhost:6379',
      }),
    ).toThrowError(
      /DATABASE_URL must start with postgresql:\/\/[\s\S]*REDIS_URL must start with redis:\/\//,
    );
  });

  it('rejects out-of-range and malformed optional values', async () => {
    const { validate, envExample } = await generate(false, 'none');

    expect(() =>
      validate({
        ...exampleValues(envExample),
        PORT: '99999',
        LOG_LEVEL: 'loud',
        THROTTLE_LIMIT: 'lots',
      }),
    ).toThrowError(
      /- PORT:[\s\S]*- LOG_LEVEL:[\s\S]*- THROTTLE_LIMIT:/,
    );
  });

  it('applies defaults and coerces numbers', async () => {
    const { validate } = await generate(false, 'jwt');

    const env = validate({
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      JWT_SECRET: VALID_SECRET,
      PORT: '4000',
    });

    expect(env).toMatchObject({
      PORT: 4000,
      NODE_ENV: 'development',
      LOG_LEVEL: 'info',
      JWT_ACCESS_TTL_SECONDS: 900,
      JWT_REFRESH_TTL_DAYS: 7,
    });
  });
});
