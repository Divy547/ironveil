import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { IronveilConfig } from '../config/index.js';
import { generateProject } from '../generators/generate-project.js';

/**
 * Generates a project for `config` into a throwaway directory and returns its
 * files (relative POSIX path to text). This is what `create` would write, which
 * is why `add` can rely on the existing generators instead of re-implementing
 * each feature as an edit.
 */
export async function renderProject(
  config: IronveilConfig,
): Promise<Map<string, string>> {
  const scratch = await mkdtemp(path.join(os.tmpdir(), 'ironveil-render-'));

  try {
    const result = await generateProject(config, scratch);
    const files = new Map<string, string>();

    for (const file of result.files) {
      files.set(file, await readFile(path.join(result.destination, file), 'utf8'));
    }

    return files;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
