'use strict';

// Preloaded into the generated server with `node --require`.
//
// Nest's `enableShutdownHooks()` runs every shutdown hook (Prisma / Redis
// disconnect, ...) and only then re-raises the signal with
// `process.kill(process.pid, signal)`. A server *without* hooks is also
// terminated by SIGTERM, so the exit status alone cannot tell the two apart.
// This marker is written right before the re-raise, which proves the hooks ran
// to completion.

const fs = require('node:fs');

const originalKill = process.kill.bind(process);

process.kill = (pid, signal) => {
  if (pid === process.pid && (signal === 'SIGTERM' || signal === 'SIGINT')) {
    fs.writeSync(2, `[ironveil-e2e] shutdown-complete signal=${signal}\n`);
  }

  return originalKill(pid, signal);
};
