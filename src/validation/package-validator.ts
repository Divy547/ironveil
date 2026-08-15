import type { ForgeKitConfig } from '../config/index.js';
import { FORGEKIT_VERSIONS } from '../config/versions.js';
import { GenerationError } from '../generators/core/generation-error.js';
import type { PackageJson } from '../utils/package-manifest.js';

export type PackageValidationIssueCode =
  | 'INVALID_STRUCTURE'
  | 'MISSING_DEPENDENCY'
  | 'FEATURE_DEPENDENCY_LEAKAGE'
  | 'VERSION_DECLARATION_DRIFT'
  | 'MISSING_DEV_DEPENDENCY'
  | 'FEATURE_DEV_DEPENDENCY_LEAKAGE'
  | 'MISSING_SCRIPT'
  | 'FEATURE_SCRIPT_LEAKAGE'
  | 'SCRIPT_CONTENT_MISMATCH'
  | 'CONFLICTING_DEPENDENCY'
  | 'INVALID_PACKAGE_MANAGER';

export interface PackageValidationIssue {
  readonly code: PackageValidationIssueCode;
  readonly message: string;
  readonly path: string;
}

export interface PackageValidationResult {
  readonly valid: boolean;
  readonly issues: readonly PackageValidationIssue[];
}

export class PackageValidationError extends GenerationError {
  readonly issues: readonly PackageValidationIssue[];

  constructor(
    projectName: string,
    issues: readonly PackageValidationIssue[],
    destination?: string,
  ) {
    const issuesSummary = issues
      .map((issue) => `  ✗ ${issue.message}`)
      .join('\n');
    const message = `Package validation failed for "${projectName}":\n${issuesSummary}`;
    super(message, {
      projectName,
      generatorName: 'package-validator',
      destination,
    });
    this.name = 'PackageValidationError';
    this.issues = issues;
  }
}

export interface PackageValidator {
  validate(
    manifest: PackageJson,
    config: ForgeKitConfig,
  ): PackageValidationResult;

  validateOrThrow(
    manifest: PackageJson,
    config: ForgeKitConfig,
    destination?: string,
  ): void;
}

export function createPackageValidator(): PackageValidator {
  return {
    validate(
      manifest: PackageJson,
      config: ForgeKitConfig,
    ): PackageValidationResult {
      const issues: PackageValidationIssue[] = [];

      // ── A. Manifest Structure ──────────────────────────────────────────
      if (typeof manifest !== 'object' || manifest === null) {
        issues.push({
          code: 'INVALID_STRUCTURE',
          message: 'Manifest must be a valid JSON object',
          path: '',
        });
        return { valid: false, issues };
      }

      if (manifest.name !== config.projectName) {
        issues.push({
          code: 'INVALID_STRUCTURE',
          message: `Package name mismatch: expected "${config.projectName}", got "${manifest.name}"`,
          path: 'name',
        });
      }

      if (typeof manifest.version !== 'string' || manifest.version.trim() === '') {
        issues.push({
          code: 'INVALID_STRUCTURE',
          message: 'Package version must be a non-empty string',
          path: 'version',
        });
      }

      if (manifest.private !== true) {
        issues.push({
          code: 'INVALID_STRUCTURE',
          message: 'Package must be marked as private: true',
          path: 'private',
        });
      }

      if (
        manifest.dependencies !== undefined &&
        (typeof manifest.dependencies !== 'object' || manifest.dependencies === null)
      ) {
        issues.push({
          code: 'INVALID_STRUCTURE',
          message: 'Field "dependencies" must be an object if defined',
          path: 'dependencies',
        });
      }

      if (
        manifest.devDependencies !== undefined &&
        (typeof manifest.devDependencies !== 'object' ||
          manifest.devDependencies === null)
      ) {
        issues.push({
          code: 'INVALID_STRUCTURE',
          message: 'Field "devDependencies" must be an object if defined',
          path: 'devDependencies',
        });
      }

      if (
        manifest.scripts !== undefined &&
        (typeof manifest.scripts !== 'object' || manifest.scripts === null)
      ) {
        issues.push({
          code: 'INVALID_STRUCTURE',
          message: 'Field "scripts" must be an object if defined',
          path: 'scripts',
        });
      }

      const hasPrisma =
        config.database === 'postgres' && config.orm === 'prisma';

      // ── B. Required Dependencies & Version Drift ───────────────────────
      const requiredDependencies: Record<string, string> = {
        ...FORGEKIT_VERSIONS.dependencies.base,
      };

      if (config.auth === 'jwt') {
        Object.assign(
          requiredDependencies,
          FORGEKIT_VERSIONS.dependencies.auth,
        );
      }

      if (hasPrisma) {
        Object.assign(
          requiredDependencies,
          FORGEKIT_VERSIONS.dependencies.prisma,
        );
      }

      if (config.redis) {
        Object.assign(
          requiredDependencies,
          FORGEKIT_VERSIONS.dependencies.redis,
        );
      }

      if (config.swagger) {
        Object.assign(
          requiredDependencies,
          FORGEKIT_VERSIONS.dependencies.swagger,
        );
      }

      const manifestDependencies = manifest.dependencies ?? {};

      for (const [pkg, expectedVersion] of Object.entries(requiredDependencies)) {
        const actualVersion = manifestDependencies[pkg];
        if (actualVersion === undefined) {
          issues.push({
            code: 'MISSING_DEPENDENCY',
            message: `Missing required dependency "${pkg}" (expected "${expectedVersion}")`,
            path: `dependencies.${pkg}`,
          });
        } else if (actualVersion !== expectedVersion) {
          issues.push({
            code: 'VERSION_DECLARATION_DRIFT',
            message: `Version declaration drift for dependency "${pkg}": expected "${expectedVersion}", got "${actualVersion}"`,
            path: `dependencies.${pkg}`,
          });
        }
      }

      // ── C. Feature Dependency Leakage ──────────────────────────────────
      if (config.auth !== 'jwt') {
        for (const pkg of Object.keys(FORGEKIT_VERSIONS.dependencies.auth)) {
          if (manifestDependencies[pkg] !== undefined) {
            issues.push({
              code: 'FEATURE_DEPENDENCY_LEAKAGE',
              message: `Leaked dependency "${pkg}": feature "auth" is disabled`,
              path: `dependencies.${pkg}`,
            });
          }
        }
      }

      if (!hasPrisma) {
        for (const pkg of Object.keys(FORGEKIT_VERSIONS.dependencies.prisma)) {
          if (manifestDependencies[pkg] !== undefined) {
            issues.push({
              code: 'FEATURE_DEPENDENCY_LEAKAGE',
              message: `Leaked dependency "${pkg}": feature "prisma" is disabled`,
              path: `dependencies.${pkg}`,
            });
          }
        }
      }

      if (!config.redis) {
        for (const pkg of Object.keys(FORGEKIT_VERSIONS.dependencies.redis)) {
          if (manifestDependencies[pkg] !== undefined) {
            issues.push({
              code: 'FEATURE_DEPENDENCY_LEAKAGE',
              message: `Leaked dependency "${pkg}": feature "redis" is disabled`,
              path: `dependencies.${pkg}`,
            });
          }
        }
      }

      if (!config.swagger) {
        for (const pkg of Object.keys(FORGEKIT_VERSIONS.dependencies.swagger)) {
          if (manifestDependencies[pkg] !== undefined) {
            issues.push({
              code: 'FEATURE_DEPENDENCY_LEAKAGE',
              message: `Leaked dependency "${pkg}": feature "swagger" is disabled`,
              path: `dependencies.${pkg}`,
            });
          }
        }
      }

      // ── D. Required devDependencies & Version Drift ────────────────────
      const requiredDevDependencies: Record<string, string> = {
        ...FORGEKIT_VERSIONS.devDependencies.base,
      };

      if (config.auth === 'jwt') {
        Object.assign(
          requiredDevDependencies,
          FORGEKIT_VERSIONS.devDependencies.auth,
        );
      }

      if (hasPrisma) {
        Object.assign(
          requiredDevDependencies,
          FORGEKIT_VERSIONS.devDependencies.prisma,
        );
      }

      if (config.testing) {
        Object.assign(
          requiredDevDependencies,
          FORGEKIT_VERSIONS.devDependencies.testing,
        );
      }

      const manifestDevDependencies = manifest.devDependencies ?? {};

      for (const [pkg, expectedVersion] of Object.entries(requiredDevDependencies)) {
        const actualVersion = manifestDevDependencies[pkg];
        if (actualVersion === undefined) {
          issues.push({
            code: 'MISSING_DEV_DEPENDENCY',
            message: `Missing required devDependency "${pkg}" (expected "${expectedVersion}")`,
            path: `devDependencies.${pkg}`,
          });
        } else if (actualVersion !== expectedVersion) {
          issues.push({
            code: 'VERSION_DECLARATION_DRIFT',
            message: `Version declaration drift for devDependency "${pkg}": expected "${expectedVersion}", got "${actualVersion}"`,
            path: `devDependencies.${pkg}`,
          });
        }
      }

      // ── E. Feature devDependency Leakage ───────────────────────────────
      if (config.auth !== 'jwt') {
        for (const pkg of Object.keys(FORGEKIT_VERSIONS.devDependencies.auth)) {
          if (manifestDevDependencies[pkg] !== undefined) {
            issues.push({
              code: 'FEATURE_DEV_DEPENDENCY_LEAKAGE',
              message: `Leaked devDependency "${pkg}": feature "auth" is disabled`,
              path: `devDependencies.${pkg}`,
            });
          }
        }
      }

      if (!hasPrisma) {
        for (const pkg of Object.keys(FORGEKIT_VERSIONS.devDependencies.prisma)) {
          if (manifestDevDependencies[pkg] !== undefined) {
            issues.push({
              code: 'FEATURE_DEV_DEPENDENCY_LEAKAGE',
              message: `Leaked devDependency "${pkg}": feature "prisma" is disabled`,
              path: `devDependencies.${pkg}`,
            });
          }
        }
      }

      if (!config.testing) {
        for (const pkg of Object.keys(FORGEKIT_VERSIONS.devDependencies.testing)) {
          if (manifestDevDependencies[pkg] !== undefined) {
            issues.push({
              code: 'FEATURE_DEV_DEPENDENCY_LEAKAGE',
              message: `Leaked devDependency "${pkg}": feature "testing" is disabled`,
              path: `devDependencies.${pkg}`,
            });
          }
        }
      }

      // ── F. Cross-Section Conflicts ─────────────────────────────────────
      for (const pkg of Object.keys(manifestDependencies)) {
        if (manifestDevDependencies[pkg] !== undefined) {
          issues.push({
            code: 'CONFLICTING_DEPENDENCY',
            message: `Conflicting dependency "${pkg}": package is declared in both dependencies and devDependencies`,
            path: `dependencies.${pkg}`,
          });
        }
      }

      // ── G. Required Scripts & Content Mismatches ───────────────────────
      const requiredScripts: Record<string, string> = {
        build: 'nest build',
        typecheck: 'tsc --noEmit',
        start: 'nest start',
        'start:dev': 'nest start --watch',
        'start:debug': 'nest start --debug --watch',
        'start:prod': 'node dist/main',
        lint: 'eslint "{src,apps,libs,test}/**/*.ts" --fix',
      };

      if (hasPrisma) {
        Object.assign(requiredScripts, {
          'db:generate': 'prisma generate',
          'db:migrate': 'prisma migrate dev',
          'db:migrate:deploy': 'prisma migrate deploy',
          'db:studio': 'prisma studio',
        });
      }

      if (config.docker) {
        Object.assign(requiredScripts, {
          'docker:up': 'docker compose up --build',
          'docker:down': 'docker compose down',
        });
      }

      if (config.testing) {
        Object.assign(requiredScripts, {
          test: 'jest',
          'test:watch': 'jest --watch',
          'test:cov': 'jest --coverage',
          'test:e2e': 'jest --config ./test/jest-e2e.json',
        });
      }

      const manifestScripts = manifest.scripts ?? {};

      for (const [scriptName, expectedCommand] of Object.entries(requiredScripts)) {
        const actualCommand = manifestScripts[scriptName];
        if (actualCommand === undefined) {
          issues.push({
            code: 'MISSING_SCRIPT',
            message: `Missing required script "${scriptName}" (expected "${expectedCommand}")`,
            path: `scripts.${scriptName}`,
          });
        } else if (actualCommand !== expectedCommand) {
          issues.push({
            code: 'SCRIPT_CONTENT_MISMATCH',
            message: `Script command mismatch for "${scriptName}": expected "${expectedCommand}", got "${actualCommand}"`,
            path: `scripts.${scriptName}`,
          });
        }
      }

      // ── H. Feature Script Leakage ──────────────────────────────────────
      if (!hasPrisma) {
        const prismaScripts = [
          'db:generate',
          'db:migrate',
          'db:migrate:deploy',
          'db:studio',
        ];
        for (const scriptName of prismaScripts) {
          if (manifestScripts[scriptName] !== undefined) {
            issues.push({
              code: 'FEATURE_SCRIPT_LEAKAGE',
              message: `Leaked script "${scriptName}": feature "prisma" is disabled`,
              path: `scripts.${scriptName}`,
            });
          }
        }
      }

      if (!config.docker) {
        const dockerScripts = ['docker:up', 'docker:down'];
        for (const scriptName of dockerScripts) {
          if (manifestScripts[scriptName] !== undefined) {
            issues.push({
              code: 'FEATURE_SCRIPT_LEAKAGE',
              message: `Leaked script "${scriptName}": feature "docker" is disabled`,
              path: `scripts.${scriptName}`,
            });
          }
        }
      }

      if (!config.testing) {
        const testScripts = ['test', 'test:watch', 'test:cov', 'test:e2e'];
        for (const scriptName of testScripts) {
          if (manifestScripts[scriptName] !== undefined) {
            issues.push({
              code: 'FEATURE_SCRIPT_LEAKAGE',
              message: `Leaked script "${scriptName}": feature "testing" is disabled`,
              path: `scripts.${scriptName}`,
            });
          }
        }
      }

      // ── I. Package Manager Metadata ────────────────────────────────────
      if (config.packageManager === 'pnpm') {
        const expected = `pnpm@${FORGEKIT_VERSIONS.tools.pnpm}`;
        if (manifest.packageManager !== expected) {
          issues.push({
            code: 'INVALID_PACKAGE_MANAGER',
            message: `Invalid packageManager field for pnpm: expected "${expected}", got "${manifest.packageManager}"`,
            path: 'packageManager',
          });
        }
      } else if (config.packageManager === 'yarn') {
        const expected = `yarn@${FORGEKIT_VERSIONS.tools.yarn}`;
        if (manifest.packageManager !== expected) {
          issues.push({
            code: 'INVALID_PACKAGE_MANAGER',
            message: `Invalid packageManager field for yarn: expected "${expected}", got "${manifest.packageManager}"`,
            path: 'packageManager',
          });
        }
      } else {
        // npm (default)
        if (manifest.packageManager !== undefined) {
          issues.push({
            code: 'INVALID_PACKAGE_MANAGER',
            message: `Unexpected packageManager field for npm: expected undefined, got "${manifest.packageManager}"`,
            path: 'packageManager',
          });
        }
      }

      return {
        valid: issues.length === 0,
        issues,
      };
    },

    validateOrThrow(
      manifest: PackageJson,
      config: ForgeKitConfig,
      destination?: string,
    ): void {
      const result = this.validate(manifest, config);
      if (!result.valid) {
        throw new PackageValidationError(
          config.projectName,
          result.issues,
          destination,
        );
      }
    },
  };
}
