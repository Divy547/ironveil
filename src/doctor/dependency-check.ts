import path from 'node:path';
import type { IronveilConfig } from '../config/index.js';
import { getPackageManagerSpec } from '../utils/package-manager.js';
import type { PackageJson } from '../utils/package-manifest.js';
import type { FileSystem } from '../utils/filesystem.js';
import { createPackageValidator } from '../validation/index.js';
import type { Finding } from './types.js';

/**
 * Checks package.json against what the enabled features need, using the same
 * validator `create` runs on a new project. Only two kinds of issue matter to
 * an existing project: a package that is missing (the feature will not build)
 * and a version that differs from the one Ironveil pins (drift, which may be a
 * deliberate upgrade). Extra packages and renamed projects are the user's call.
 */
export async function checkDependencies(
  root: string,
  config: IronveilConfig,
  fs: FileSystem,
): Promise<Finding[]> {
  const packagePath = path.join(root, 'package.json');

  let manifest: PackageJson;
  try {
    manifest = JSON.parse(await fs.readFile(packagePath)) as PackageJson;
  } catch (error) {
    return [
      {
        check: 'dependencies',
        severity: 'error',
        message: `package.json could not be read: ${error instanceof Error ? error.message : String(error)}`,
        fix: 'Restore it from version control.',
      },
    ];
  }

  const install = getPackageManagerSpec(config.packageManager).install;
  const findings: Finding[] = [];

  for (const issue of createPackageValidator().validate(manifest, config).issues) {
    if (issue.code === 'MISSING_DEPENDENCY' || issue.code === 'MISSING_DEV_DEPENDENCY') {
      findings.push({
        check: 'dependencies',
        severity: 'error',
        message: issue.message,
        fix: `Add it to package.json, then run: ${install}`,
      });
    } else if (issue.code === 'VERSION_DECLARATION_DRIFT') {
      findings.push({
        check: 'dependencies',
        severity: 'warning',
        message: issue.message,
        fix: 'Fine if you upgraded on purpose; otherwise set the version Ironveil pins.',
      });
    }
  }

  return findings;
}
