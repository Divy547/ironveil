import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.dirname(
  path.dirname(fileURLToPath(import.meta.url)),
);

const sourceDirectory = path.join(
  rootDirectory,
  'src',
  'templates',
);

const destinationDirectory = path.join(
  rootDirectory,
  'dist',
  'templates',
);

await rm(destinationDirectory, {
  recursive: true,
  force: true,
});

await mkdir(destinationDirectory, {
  recursive: true,
});

await cp(sourceDirectory, destinationDirectory, {
  recursive: true,
});

console.log('Copied template assets to dist/templates');