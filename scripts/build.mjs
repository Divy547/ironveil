import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const rootDirectory = path.dirname(
  path.dirname(fileURLToPath(import.meta.url)),
);

const distDirectory = path.join(
  rootDirectory,
  'dist',
);

await rm(distDirectory, {
  recursive: true,
  force: true,
});

await runCommand(
  process.platform === 'win32'
    ? 'tsc.cmd'
    : 'tsc',
);

await runCommand(
  process.platform === 'win32'
    ? 'node.exe'
    : 'node',
  ['scripts/copy-templates.mjs'],
);

function runCommand(command, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDirectory,
      stdio: 'inherit',
      shell: false,
    });

    child.on('error', reject);

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${command} exited with code ${code}`,
        ),
      );
    });
  });
}