import { expect } from 'vitest';

import type { GeneratedProject } from './generated-project.js';
import {
  SHUTDOWN_MARKER,
  startTestServer,
  type ShutdownResult,
  type TestServer,
} from './test-server.js';

interface TerminusBody {
  status?: string;
  info?: Record<string, { status?: string }>;
  error?: Record<string, unknown>;
}

/**
 * The shared "does this project really work" pipeline used by the matrix:
 * install, Prisma generate + migrate, lint, typecheck and build.
 *
 * `prisma migrate deploy` also creates the database when it is missing, which
 * the booted server needs because Prisma connects on module init.
 */
export async function prepareProject(
  project: GeneratedProject,
  env: {
    databaseUrl: string;
    redisUrl?: string;
    jwtSecret?: string;
    extra?: Record<string, string>;
  },
): Promise<void> {
  await project.writeEnv(env);

  await project.install();
  await project.prismaGenerate();
  await project.prismaMigrateDeploy();

  await project.lint();
  await project.typecheck();
  await project.build();

  expect(
    await project.fs.exists(`${project.root}/dist/main.js`),
  ).toBe(true);
}

/**
 * Asserts liveness and readiness against a running server. Readiness must
 * report the database as up, and Redis too when it is enabled.
 */
export async function assertHealthy(
  baseUrl: string,
  options: { redis: boolean },
): Promise<void> {
  const live = await fetch(`${baseUrl}/health`);
  expect(live.status).toBe(200);
  expect(((await live.json()) as TerminusBody).status).toBe('ok');

  const ready = await fetch(`${baseUrl}/health/ready`);
  const readyBody = (await ready.json()) as TerminusBody;
  expect(ready.status, JSON.stringify(readyBody)).toBe(200);
  expect(readyBody.status).toBe('ok');
  expect(readyBody.info?.database?.status).toBe('up');

  if (options.redis) {
    expect(readyBody.info?.redis?.status).toBe('up');
  } else {
    expect(readyBody.info?.redis).toBeUndefined();
  }
}

/**
 * Asserts a SIGTERM was handled by the shutdown hooks: the process exited on
 * its own (no SIGKILL), re-raised the signal only after the hooks finished,
 * and did not report a shutdown error.
 */
export function assertCleanShutdown(result: ShutdownResult): void {
  const detail = `\n--- server output ---\n${result.output}`;

  expect(result.forced, `SIGTERM was ignored${detail}`).toBe(false);
  expect(
    result.code === 0 || result.signal === 'SIGTERM',
    `unexpected exit (code=${result.code}, signal=${result.signal})${detail}`,
  ).toBe(true);
  expect(
    result.output,
    `shutdown hooks did not complete${detail}`,
  ).toContain(SHUTDOWN_MARKER);
}

/**
 * Boots the built project, checks `/health` and `/health/ready`, then sends
 * SIGTERM and checks the shutdown. `exercise` runs against the live server in
 * between, for feature-specific checks.
 */
export async function assertBootsAndShutsDownCleanly(
  project: GeneratedProject,
  options: {
    redis: boolean;
    exercise?: (server: TestServer) => Promise<void>;
  },
): Promise<void> {
  const server = await startTestServer(
    project.root,
    project.baseUrl,
  );

  try {
    await assertHealthy(server.baseUrl, { redis: options.redis });
    await options.exercise?.(server);
  } catch (error) {
    server.stop();
    throw error;
  }

  assertCleanShutdown(await server.shutdown());
}
