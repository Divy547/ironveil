import { runCli } from './cli/index.js';

runCli().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});