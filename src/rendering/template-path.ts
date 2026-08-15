import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function getTemplatesDirectory(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDirectory = path.dirname(currentFile);

  const candidates = [
    path.resolve(currentDirectory, '../templates'),
    path.resolve(currentDirectory, '../../templates'),
  ];

  const templatesDirectory = candidates.find((candidate) =>
    existsSync(candidate),
  );

  if (!templatesDirectory) {
    throw new Error(
      `Could not locate Ironveil templates. Searched:\n${candidates.join('\n')}`,
    );
  }

  return templatesDirectory;
}