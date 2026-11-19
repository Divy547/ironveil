import {
  spawn,
} from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SIGTERM_PROBE = fileURLToPath(
  new URL('./sigterm-probe.cjs', import.meta.url),
);

export const SHUTDOWN_MARKER =
  '[ironveil-e2e] shutdown-complete signal=SIGTERM';

export interface ShutdownResult {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  /** True when the server ignored SIGTERM and had to be SIGKILLed. */
  readonly forced: boolean;
  /** Combined stdout and stderr of the server process. */
  readonly output: string;
}

export interface TestServer {
  readonly process: ReturnType<typeof spawn>;
  readonly baseUrl: string;

  stop(): void;

  /**
   * Sends SIGTERM and waits for the process to exit, reporting how it exited.
   * Falls back to SIGKILL after `timeoutMs` so a hung shutdown fails the test
   * instead of leaking a process.
   */
  shutdown(timeoutMs?: number): Promise<ShutdownResult>;
}

export async function startTestServer(
  root: string,
  baseUrl: string,
  /**
   * Variables for this server only. They win over the generated `.env`, which
   * never overrides what is already in the environment, so this is how a test
   * picks `NODE_ENV` (vitest itself runs with `NODE_ENV=test`).
   */
  env: Record<string, string> = {},
): Promise<TestServer> {
  const serverProcess = spawn(
    'node',
    ['dist/main.js'],
    {
      cwd: root,
      env: {
        ...process.env,
        ...env,
        NODE_OPTIONS: [
          process.env.NODE_OPTIONS,
          `--require=${SIGTERM_PROBE}`,
        ]
          .filter(Boolean)
          .join(' '),
      },
      stdio: [
        'ignore',
        'pipe',
        'pipe',
      ],
    },
  );

  let output = '';
  const collect = (chunk: Buffer): void => {
    output += chunk.toString();
  };
  serverProcess.stdout?.on('data', collect);
  serverProcess.stderr?.on('data', collect);

  const closed = new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>((resolve) => {
    serverProcess.once('close', (code, signal) =>
      resolve({ code, signal }),
    );
  });

  const hasExited = (): boolean =>
    serverProcess.exitCode !== null ||
    serverProcess.signalCode !== null;

  try {
    await waitForServer(
      serverProcess,
      baseUrl,
    );
  } catch (error) {
    if (!hasExited()) {
      serverProcess.kill('SIGKILL');
    }

    const detail = output.trim();
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}${
        detail ? `\n--- server output ---\n${detail}` : ''
      }`,
    );
  }

  return {
    process: serverProcess,
    baseUrl,

    stop(): void {
      if (!hasExited()) {
        serverProcess.kill('SIGTERM');
      }
    },

    async shutdown(timeoutMs = 15_000): Promise<ShutdownResult> {
      let forced = false;
      let timer: NodeJS.Timeout | undefined;

      if (!hasExited()) {
        serverProcess.kill('SIGTERM');
        timer = setTimeout(() => {
          forced = true;
          serverProcess.kill('SIGKILL');
        }, timeoutMs);
      }

      const { code, signal } = await closed;

      if (timer) {
        clearTimeout(timer);
      }

      return { code, signal, forced, output };
    },
  };
}

async function waitForServer(
  process: ReturnType<typeof spawn>,
  url: string,
  timeout = 30_000,
): Promise<void> {
  const startedAt = Date.now();

  while (
    Date.now() - startedAt <
    timeout
  ) {
    if (process.exitCode !== null) {
      throw new Error(
        'Generated NestJS server exited before becoming ready.',
      );
    }

    try {
      await fetch(url);
      return;
    } catch {
      await new Promise(
        (resolve) =>
          setTimeout(resolve, 500),
      );
    }
  }

  throw new Error(
    `Generated NestJS server did not become ready within ${timeout}ms.`,
  );
}
