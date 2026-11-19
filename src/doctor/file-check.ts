import path from 'node:path';
import type { FileSystem } from '../utils/filesystem.js';
import type { Finding } from './types.js';

// Reported by the module check (with a clearer message).
const REPORTED_ELSEWHERE = new Set(['src/app.module.ts']);

/**
 * The source files `create` writes for this configuration that a project is
 * expected to keep. Specs, tests, docs and placeholders are left out: deleting
 * them is routine and breaks nothing.
 */
export function expectedSourceFiles(rendered: ReadonlyMap<string, string>): string[] {
  return [...rendered.keys()]
    .filter(
      (file) =>
        (file.startsWith('src/') || file === 'prisma/schema.prisma') &&
        !file.endsWith('.spec.ts') &&
        !file.endsWith('.gitkeep') &&
        !REPORTED_ELSEWHERE.has(file),
    )
    .sort();
}

export async function checkFiles(
  root: string,
  rendered: ReadonlyMap<string, string>,
  fs: FileSystem,
): Promise<Finding[]> {
  const findings: Finding[] = [];

  for (const file of expectedSourceFiles(rendered)) {
    if (!(await fs.exists(path.join(root, file)))) {
      findings.push({
        check: 'files',
        severity: 'warning',
        message: `${file} is missing; it belongs to a feature enabled in ironveil.json.`,
        fix: 'Restore it from version control, or run `ironveil doctor` again after removing the feature from ironveil.json if you dropped it on purpose.',
      });
    }
  }

  return findings;
}
