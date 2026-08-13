import {
  spawn,
} from 'node:child_process';

export interface TestServer {
  readonly process: ReturnType<typeof spawn>;
  readonly baseUrl: string;

  stop(): void;
}

export async function startTestServer(
  root: string,
  baseUrl: string,
): Promise<TestServer> {
  const serverProcess = spawn(
    'node',
    ['dist/main.js'],
    {
      cwd: root,
      stdio: [
        'ignore',
        'pipe',
        'pipe',
      ],
    },
  );

  await waitForServer(
    serverProcess,
    baseUrl,
  );

  return {
    process: serverProcess,
    baseUrl,

    stop(): void {
      if (
        serverProcess.exitCode === null
      ) {
        serverProcess.kill('SIGTERM');
      }
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