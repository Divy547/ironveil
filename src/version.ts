import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_NAME = 'ironveil';

/**
 * Finds Ironveil's own `package.json` by walking up from `startDirectory`.
 *
 * The depth differs between layouts (`src/version.ts` under tsx and vitest,
 * `dist/src/version.js` once built), so a fixed relative path would break one
 * of them. A `package.json` that belongs to another package is skipped.
 */
export function readPackageVersion(startDirectory: string): string {
  let directory = path.resolve(startDirectory);

  for (;;) {
    const candidate = path.join(directory, 'package.json');

    if (existsSync(candidate)) {
      const parsed = JSON.parse(readFileSync(candidate, 'utf8')) as {
        name?: unknown;
        version?: unknown;
      };

      if (
        parsed.name === PACKAGE_NAME &&
        typeof parsed.version === 'string' &&
        parsed.version !== ''
      ) {
        return parsed.version;
      }
    }

    const parent = path.dirname(directory);

    if (parent === directory) {
      throw new Error(
        `Could not find Ironveil's package.json above ${startDirectory}`,
      );
    }

    directory = parent;
  }
}

/** The running Ironveil version; `package.json` is the single source of truth. */
export const IRONVEIL_VERSION: string = readPackageVersion(
  path.dirname(fileURLToPath(import.meta.url)),
);
