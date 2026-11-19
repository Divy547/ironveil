import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../../src/config/index.js';
import { IRONVEIL_VERSIONS } from '../../src/config/versions.js';
import {
  createPackageValidator,
  PackageValidationError,
} from '../../src/validation/index.js';
import type { PackageJson } from '../../src/utils/package-manifest.js';

function buildValidManifest(configName = 'test-api', overrides: Partial<PackageJson> = {}): PackageJson {
  return {
    name: configName,
    version: '0.1.0',
    private: true,
    license: 'UNLICENSED',
    scripts: {
      build: 'nest build',
      typecheck: 'tsc --noEmit',
      start: 'nest start',
      'start:dev': 'nest start --watch',
      'start:debug': 'nest start --debug --watch',
      'start:prod': 'node dist/main',
      lint: 'eslint "{src,test}/**/*.ts"',
      'lint:fix': 'eslint "{src,test}/**/*.ts" --fix',
      format: 'prettier --write "{src,test}/**/*.ts"',
      'db:generate': 'prisma generate',
      'db:migrate': 'prisma migrate dev',
      'db:migrate:deploy': 'prisma migrate deploy',
      'db:studio': 'prisma studio',
      'docker:up': 'docker compose up --build',
      'docker:down': 'docker compose down',
      test: 'jest',
      'test:watch': 'jest --watch',
      'test:cov': 'jest --coverage',
      'test:e2e': 'jest --config ./test/jest-e2e.json',
    },
    dependencies: {
      ...IRONVEIL_VERSIONS.dependencies.base,
      ...IRONVEIL_VERSIONS.dependencies.prisma,
      ...IRONVEIL_VERSIONS.dependencies.swagger,
    },
    devDependencies: {
      ...IRONVEIL_VERSIONS.devDependencies.base,
      ...IRONVEIL_VERSIONS.devDependencies.prisma,
      ...IRONVEIL_VERSIONS.devDependencies.testing,
    },
    ...overrides,
  };
}

describe('PackageValidator', () => {
  const validator = createPackageValidator();

  describe('valid manifests', () => {
    it('passes for standard default configuration', () => {
      const config = resolveConfig({ projectName: 'test-api' });
      const manifest = buildValidManifest('test-api');
      const result = validator.validate(manifest, config);

      expect(result.valid).toBe(true);
      expect(result.issues).toEqual([]);
    });

    it('passes for full-feature configuration', () => {
      const config = resolveConfig({
        projectName: 'full-api',
        auth: 'jwt',
        redis: true,
        swagger: true,
        docker: true,
        ci: true,
        testing: true,
        packageManager: 'npm',
      });

      const manifest = buildValidManifest('full-api', {
        dependencies: {
          ...IRONVEIL_VERSIONS.dependencies.base,
          ...IRONVEIL_VERSIONS.dependencies.auth,
          ...IRONVEIL_VERSIONS.dependencies.prisma,
          ...IRONVEIL_VERSIONS.dependencies.redis,
          ...IRONVEIL_VERSIONS.dependencies.swagger,
        },
        devDependencies: {
          ...IRONVEIL_VERSIONS.devDependencies.base,
          ...IRONVEIL_VERSIONS.devDependencies.auth,
          ...IRONVEIL_VERSIONS.devDependencies.prisma,
          ...IRONVEIL_VERSIONS.devDependencies.testing,
        },
      });

      const result = validator.validate(manifest, config);
      expect(result.valid).toBe(true);
      expect(result.issues).toEqual([]);
    });

    it('passes for pnpm configuration with packageManager field', () => {
      const config = resolveConfig({
        projectName: 'pnpm-api',
        packageManager: 'pnpm',
      });

      const manifest = buildValidManifest('pnpm-api', {
        packageManager: 'pnpm@10.5.2',
      });

      const result = validator.validate(manifest, config);
      expect(result.valid).toBe(true);
    });

    it('passes for yarn configuration with packageManager field', () => {
      const config = resolveConfig({
        projectName: 'yarn-api',
        packageManager: 'yarn',
      });

      const manifest = buildValidManifest('yarn-api', {
        packageManager: 'yarn@1.22.22',
      });

      const result = validator.validate(manifest, config);
      expect(result.valid).toBe(true);
    });

    it('allows unknown/extra third-party dependencies and custom scripts', () => {
      const config = resolveConfig({ projectName: 'test-api' });
      const manifest = buildValidManifest('test-api', {
        dependencies: {
          ...IRONVEIL_VERSIONS.dependencies.base,
          ...IRONVEIL_VERSIONS.dependencies.prisma,
          ...IRONVEIL_VERSIONS.dependencies.swagger,
          lodash: '^4.17.21',
          axios: '^1.7.0',
        },
        devDependencies: {
          ...IRONVEIL_VERSIONS.devDependencies.base,
          ...IRONVEIL_VERSIONS.devDependencies.prisma,
          ...IRONVEIL_VERSIONS.devDependencies.testing,
          rimraf: '^5.0.0',
        },
        scripts: {
          build: 'nest build',
          typecheck: 'tsc --noEmit',
          start: 'nest start',
          'start:dev': 'nest start --watch',
          'start:debug': 'nest start --debug --watch',
          'start:prod': 'node dist/main',
          lint: 'eslint "{src,test}/**/*.ts"',
          'lint:fix': 'eslint "{src,test}/**/*.ts" --fix',
          format: 'prettier --write "{src,test}/**/*.ts"',
          'db:generate': 'prisma generate',
          'db:migrate': 'prisma migrate dev',
          'db:migrate:deploy': 'prisma migrate deploy',
          'db:studio': 'prisma studio',
          'docker:up': 'docker compose up --build',
          'docker:down': 'docker compose down',
          test: 'jest',
          'test:watch': 'jest --watch',
          'test:cov': 'jest --coverage',
          'test:e2e': 'jest --config ./test/jest-e2e.json',
          'custom:benchmark': 'node benchmark.js',
        },
      });

      const result = validator.validate(manifest, config);
      expect(result.valid).toBe(true);
    });
  });

  describe('manifest structure validation', () => {
    it('flags non-object manifest', () => {
      const config = resolveConfig({ projectName: 'test-api' });
      const result = validator.validate(null as unknown as PackageJson, config);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.code === 'INVALID_STRUCTURE')).toBe(true);
    });

    it('flags package name mismatch', () => {
      const config = resolveConfig({ projectName: 'expected-name' });
      const manifest = buildValidManifest('wrong-name');
      const result = validator.validate(manifest, config);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.code === 'INVALID_STRUCTURE' && i.path === 'name')).toBe(true);
    });

    it('flags missing or empty version', () => {
      const config = resolveConfig({ projectName: 'test-api' });
      const manifest = buildValidManifest('test-api', { version: '' });
      const result = validator.validate(manifest, config);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.code === 'INVALID_STRUCTURE' && i.path === 'version')).toBe(true);
    });

    it('flags private not set to true', () => {
      const config = resolveConfig({ projectName: 'test-api' });
      const manifest = buildValidManifest('test-api', { private: false });
      const result = validator.validate(manifest, config);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.code === 'INVALID_STRUCTURE' && i.path === 'private')).toBe(true);
    });
  });

  describe('dependency and devDependency validation', () => {
    it('flags missing required base dependency', () => {
      const config = resolveConfig({ projectName: 'test-api' });
      const manifest = buildValidManifest('test-api');
      const deps = { ...manifest.dependencies };
      delete deps['@nestjs/common'];
      manifest.dependencies = deps;

      const result = validator.validate(manifest, config);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.code === 'MISSING_DEPENDENCY' && i.path === 'dependencies.@nestjs/common')).toBe(true);
    });

    it('flags missing required feature dependency when enabled', () => {
      const config = resolveConfig({ projectName: 'test-api', redis: true });
      const manifest = buildValidManifest('test-api'); // redis missing

      const result = validator.validate(manifest, config);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.code === 'MISSING_DEPENDENCY' && i.path === 'dependencies.ioredis')).toBe(true);
    });

    it('flags missing queue dependencies when the queue is enabled', () => {
      const config = resolveConfig({ projectName: 'test-api', redis: true, queue: true });
      const manifest = buildValidManifest('test-api', {
        dependencies: {
          ...IRONVEIL_VERSIONS.dependencies.base,
          ...IRONVEIL_VERSIONS.dependencies.prisma,
          ...IRONVEIL_VERSIONS.dependencies.redis,
          ...IRONVEIL_VERSIONS.dependencies.swagger,
        },
      });

      const result = validator.validate(manifest, config);
      const missing = result.issues
        .filter((i) => i.code === 'MISSING_DEPENDENCY')
        .map((i) => i.path);
      expect(missing).toEqual(['dependencies.@nestjs/bullmq', 'dependencies.bullmq']);
    });

    it('flags missing mail dependencies and devDependencies when mail is enabled', () => {
      const config = resolveConfig({ projectName: 'test-api', mail: true });
      const manifest = buildValidManifest('test-api');

      const result = validator.validate(manifest, config);

      expect(
        result.issues.filter((i) => i.code === 'MISSING_DEPENDENCY').map((i) => i.path),
      ).toEqual(['dependencies.nodemailer']);
      expect(
        result.issues.filter((i) => i.code === 'MISSING_DEV_DEPENDENCY').map((i) => i.path),
      ).toEqual(['devDependencies.@types/nodemailer']);
    });

    it('accepts a project with mail when both packages are present', () => {
      const config = resolveConfig({ projectName: 'test-api', mail: true });
      const manifest = buildValidManifest('test-api', {
        dependencies: {
          ...IRONVEIL_VERSIONS.dependencies.base,
          ...IRONVEIL_VERSIONS.dependencies.prisma,
          ...IRONVEIL_VERSIONS.dependencies.swagger,
          ...IRONVEIL_VERSIONS.dependencies.mail,
        },
        devDependencies: {
          ...IRONVEIL_VERSIONS.devDependencies.base,
          ...IRONVEIL_VERSIONS.devDependencies.prisma,
          ...IRONVEIL_VERSIONS.devDependencies.testing,
          ...IRONVEIL_VERSIONS.devDependencies.mail,
        },
      });

      expect(validator.validate(manifest, config).valid).toBe(true);
    });

    it('flags every missing otel dependency when otel is enabled, and none of them are dev-only', () => {
      const config = resolveConfig({ projectName: 'test-api', otel: true });
      const manifest = buildValidManifest('test-api');

      const result = validator.validate(manifest, config);

      expect(
        result.issues.filter((i) => i.code === 'MISSING_DEPENDENCY').map((i) => i.path).sort(),
      ).toEqual(
        Object.keys(IRONVEIL_VERSIONS.dependencies.otel)
          .map((name) => `dependencies.${name}`)
          .sort(),
      );
      expect(result.issues.filter((i) => i.code === 'MISSING_DEV_DEPENDENCY')).toEqual([]);
    });

    it('accepts a project with otel when all its packages are present', () => {
      const config = resolveConfig({ projectName: 'test-api', otel: true });
      const manifest = buildValidManifest('test-api', {
        dependencies: {
          ...IRONVEIL_VERSIONS.dependencies.base,
          ...IRONVEIL_VERSIONS.dependencies.prisma,
          ...IRONVEIL_VERSIONS.dependencies.swagger,
          ...IRONVEIL_VERSIONS.dependencies.otel,
        },
      });

      expect(validator.validate(manifest, config).valid).toBe(true);
    });

    it('requires the ioredis instrumentation only when otel and Redis are both enabled', () => {
      const dependencies = {
        ...IRONVEIL_VERSIONS.dependencies.base,
        ...IRONVEIL_VERSIONS.dependencies.prisma,
        ...IRONVEIL_VERSIONS.dependencies.swagger,
        ...IRONVEIL_VERSIONS.dependencies.redis,
        ...IRONVEIL_VERSIONS.dependencies.otel,
      };
      const missingPaths = (config: ReturnType<typeof resolveConfig>) =>
        validator
          .validate(buildValidManifest('test-api', { dependencies }), config)
          .issues.filter((i) => i.code === 'MISSING_DEPENDENCY')
          .map((i) => i.path);

      expect(
        missingPaths(resolveConfig({ projectName: 'test-api', redis: true, otel: true })),
      ).toEqual(['dependencies.@opentelemetry/instrumentation-ioredis']);
      expect(missingPaths(resolveConfig({ projectName: 'test-api', redis: true }))).toEqual([]);
    });

    it('flags version declaration drift for dependencies', () => {
      const config = resolveConfig({ projectName: 'test-api' });
      const manifest = buildValidManifest('test-api');
      manifest.dependencies = {
        ...manifest.dependencies,
        '@nestjs/common': '^11.1.0', // Expected ^11.0.0
      };

      const result = validator.validate(manifest, config);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.code === 'VERSION_DECLARATION_DRIFT' && i.path === 'dependencies.@nestjs/common')).toBe(true);
    });

    it('flags missing required devDependency', () => {
      const config = resolveConfig({ projectName: 'test-api' });
      const manifest = buildValidManifest('test-api');
      const devDeps = { ...manifest.devDependencies };
      delete devDeps['typescript'];
      manifest.devDependencies = devDeps;

      const result = validator.validate(manifest, config);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.code === 'MISSING_DEV_DEPENDENCY' && i.path === 'devDependencies.typescript')).toBe(true);
    });

    it('flags version declaration drift for devDependencies', () => {
      const config = resolveConfig({ projectName: 'test-api' });
      const manifest = buildValidManifest('test-api');
      manifest.devDependencies = {
        ...manifest.devDependencies,
        prisma: '6.18.0', // Expected 6.19.3
      };

      const result = validator.validate(manifest, config);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.code === 'VERSION_DECLARATION_DRIFT' && i.path === 'devDependencies.prisma')).toBe(true);
    });
  });

  describe('feature leakage validation', () => {
    it('flags leaked mail packages when mail is disabled', () => {
      const config = resolveConfig({ projectName: 'test-api' });
      const manifest = buildValidManifest('test-api', {
        dependencies: {
          ...IRONVEIL_VERSIONS.dependencies.base,
          ...IRONVEIL_VERSIONS.dependencies.prisma,
          ...IRONVEIL_VERSIONS.dependencies.swagger,
          ...IRONVEIL_VERSIONS.dependencies.mail,
        },
        devDependencies: {
          ...IRONVEIL_VERSIONS.devDependencies.base,
          ...IRONVEIL_VERSIONS.devDependencies.prisma,
          ...IRONVEIL_VERSIONS.devDependencies.testing,
          ...IRONVEIL_VERSIONS.devDependencies.mail,
        },
      });

      const result = validator.validate(manifest, config);

      expect(
        result.issues.filter((i) => i.code === 'FEATURE_DEPENDENCY_LEAKAGE').map((i) => i.path),
      ).toEqual(['dependencies.nodemailer']);
      expect(
        result.issues.filter((i) => i.code === 'FEATURE_DEV_DEPENDENCY_LEAKAGE').map((i) => i.path),
      ).toEqual(['devDependencies.@types/nodemailer']);
    });

    it('flags leaked otel packages when otel is disabled', () => {
      const config = resolveConfig({ projectName: 'test-api' });
      const manifest = buildValidManifest('test-api', {
        dependencies: {
          ...IRONVEIL_VERSIONS.dependencies.base,
          ...IRONVEIL_VERSIONS.dependencies.prisma,
          ...IRONVEIL_VERSIONS.dependencies.swagger,
          ...IRONVEIL_VERSIONS.dependencies.otel,
          ...IRONVEIL_VERSIONS.dependencies.otelRedis,
        },
      });

      const result = validator.validate(manifest, config);

      expect(
        result.issues
          .filter((i) => i.code === 'FEATURE_DEPENDENCY_LEAKAGE')
          .map((i) => i.path)
          .sort(),
      ).toEqual(
        [
          ...Object.keys(IRONVEIL_VERSIONS.dependencies.otel),
          ...Object.keys(IRONVEIL_VERSIONS.dependencies.otelRedis),
        ]
          .map((name) => `dependencies.${name}`)
          .sort(),
      );
    });

    it('flags the ioredis instrumentation as leaked when otel is on but Redis is off', () => {
      const config = resolveConfig({ projectName: 'test-api', otel: true });
      const manifest = buildValidManifest('test-api', {
        dependencies: {
          ...IRONVEIL_VERSIONS.dependencies.base,
          ...IRONVEIL_VERSIONS.dependencies.prisma,
          ...IRONVEIL_VERSIONS.dependencies.swagger,
          ...IRONVEIL_VERSIONS.dependencies.otel,
          ...IRONVEIL_VERSIONS.dependencies.otelRedis,
        },
      });

      const result = validator.validate(manifest, config);

      expect(
        result.issues.filter((i) => i.code === 'FEATURE_DEPENDENCY_LEAKAGE').map((i) => i.path),
      ).toEqual(['dependencies.@opentelemetry/instrumentation-ioredis']);
    });

    it('flags leaked queue dependencies when the queue is disabled', () => {
      const config = resolveConfig({ projectName: 'test-api', redis: true });
      const manifest = buildValidManifest('test-api', {
        dependencies: {
          ...IRONVEIL_VERSIONS.dependencies.base,
          ...IRONVEIL_VERSIONS.dependencies.prisma,
          ...IRONVEIL_VERSIONS.dependencies.redis,
          ...IRONVEIL_VERSIONS.dependencies.swagger,
          ...IRONVEIL_VERSIONS.dependencies.queue,
        },
      });

      const result = validator.validate(manifest, config);
      const leaked = result.issues
        .filter((i) => i.code === 'FEATURE_DEPENDENCY_LEAKAGE')
        .map((i) => i.path);
      expect(leaked).toEqual(['dependencies.@nestjs/bullmq', 'dependencies.bullmq']);
    });

    it('flags leaked dependency for disabled redis', () => {
      const config = resolveConfig({ projectName: 'test-api', redis: false });
      const manifest = buildValidManifest('test-api', {
        dependencies: {
          ...IRONVEIL_VERSIONS.dependencies.base,
          ...IRONVEIL_VERSIONS.dependencies.prisma,
          ...IRONVEIL_VERSIONS.dependencies.swagger,
          ioredis: '5.6.0', // Leaked
        },
      });

      const result = validator.validate(manifest, config);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.code === 'FEATURE_DEPENDENCY_LEAKAGE' && i.path === 'dependencies.ioredis')).toBe(true);
    });

    it('flags leaked dependency for disabled auth', () => {
      const config = resolveConfig({ projectName: 'test-api', auth: 'none' });
      const manifest = buildValidManifest('test-api', {
        dependencies: {
          ...IRONVEIL_VERSIONS.dependencies.base,
          ...IRONVEIL_VERSIONS.dependencies.prisma,
          ...IRONVEIL_VERSIONS.dependencies.swagger,
          bcrypt: '6.0.0', // Leaked
        },
      });

      const result = validator.validate(manifest, config);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.code === 'FEATURE_DEPENDENCY_LEAKAGE' && i.path === 'dependencies.bcrypt')).toBe(true);
    });

    it('flags leaked devDependency for disabled testing', () => {
      const config = resolveConfig({ projectName: 'test-api', testing: false });
      const manifest = buildValidManifest('test-api', {
        devDependencies: {
          ...IRONVEIL_VERSIONS.devDependencies.base,
          ...IRONVEIL_VERSIONS.devDependencies.prisma,
          jest: '^30.0.0', // Leaked
        },
        scripts: {
          build: 'nest build',
          typecheck: 'tsc --noEmit',
          start: 'nest start',
          'start:dev': 'nest start --watch',
          'start:debug': 'nest start --debug --watch',
          'start:prod': 'node dist/main',
          lint: 'eslint "{src,test}/**/*.ts"',
          'lint:fix': 'eslint "{src,test}/**/*.ts" --fix',
          format: 'prettier --write "{src,test}/**/*.ts"',
          'db:generate': 'prisma generate',
          'db:migrate': 'prisma migrate dev',
          'db:migrate:deploy': 'prisma migrate deploy',
          'db:studio': 'prisma studio',
          'docker:up': 'docker compose up --build',
          'docker:down': 'docker compose down',
        },
      });

      const result = validator.validate(manifest, config);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.code === 'FEATURE_DEV_DEPENDENCY_LEAKAGE' && i.path === 'devDependencies.jest')).toBe(true);
    });
  });

  describe('conflicting dependencies', () => {
    it('flags duplicate package in both dependencies and devDependencies', () => {
      const config = resolveConfig({ projectName: 'test-api' });
      const manifest = buildValidManifest('test-api', {
        dependencies: {
          ...IRONVEIL_VERSIONS.dependencies.base,
          ...IRONVEIL_VERSIONS.dependencies.prisma,
          ...IRONVEIL_VERSIONS.dependencies.swagger,
          typescript: '5.7.0', // Duplicated from devDependencies
        },
      });

      const result = validator.validate(manifest, config);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.code === 'CONFLICTING_DEPENDENCY' && i.path === 'dependencies.typescript')).toBe(true);
    });
  });

  describe('script validation', () => {
    it('flags missing required script', () => {
      const config = resolveConfig({ projectName: 'test-api' });
      const manifest = buildValidManifest('test-api');
      const scripts = { ...manifest.scripts };
      delete scripts['build'];
      manifest.scripts = scripts;

      const result = validator.validate(manifest, config);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.code === 'MISSING_SCRIPT' && i.path === 'scripts.build')).toBe(true);
    });

    it('flags script command content mismatch', () => {
      const config = resolveConfig({ projectName: 'test-api' });
      const manifest = buildValidManifest('test-api');
      manifest.scripts = {
        ...manifest.scripts,
        build: 'tsc', // Expected 'nest build'
      };

      const result = validator.validate(manifest, config);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.code === 'SCRIPT_CONTENT_MISMATCH' && i.path === 'scripts.build')).toBe(true);
    });

    it('flags leaked script for disabled docker', () => {
      const config = resolveConfig({ projectName: 'test-api', docker: false });
      const manifest = buildValidManifest('test-api'); // contains docker:up / docker:down

      const result = validator.validate(manifest, config);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.code === 'FEATURE_SCRIPT_LEAKAGE' && i.path === 'scripts.docker:up')).toBe(true);
    });

    it('flags leaked script for disabled testing', () => {
      const config = resolveConfig({
        projectName: 'test-api',
        testing: false,
      });

      const manifest = buildValidManifest('test-api', {
        devDependencies: {
          ...IRONVEIL_VERSIONS.devDependencies.base,
          ...IRONVEIL_VERSIONS.devDependencies.prisma,
        },
        scripts: {
          build: 'nest build',
          typecheck: 'tsc --noEmit',
          start: 'nest start',
          'start:dev': 'nest start --watch',
          'start:debug': 'nest start --debug --watch',
          'start:prod': 'node dist/main',
          lint: 'eslint "{src,test}/**/*.ts"',
          'lint:fix': 'eslint "{src,test}/**/*.ts" --fix',
          format: 'prettier --write "{src,test}/**/*.ts"',
          'db:generate': 'prisma generate',
          'db:migrate': 'prisma migrate dev',
          'db:migrate:deploy': 'prisma migrate deploy',
          'db:studio': 'prisma studio',
          'docker:up': 'docker compose up --build',
          'docker:down': 'docker compose down',
          test: 'jest', // Leaked
        },
      });

      const result = validator.validate(manifest, config);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.code === 'FEATURE_SCRIPT_LEAKAGE' && i.path === 'scripts.test')).toBe(true);
    });
  });

  describe('package manager validation', () => {
    it('flags unexpected packageManager field for npm project', () => {
      const config = resolveConfig({ projectName: 'test-api', packageManager: 'npm' });
      const manifest = buildValidManifest('test-api', {
        packageManager: 'npm@10.0.0',
      });

      const result = validator.validate(manifest, config);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.code === 'INVALID_PACKAGE_MANAGER')).toBe(true);
    });

    it('flags missing packageManager field for pnpm project', () => {
      const config = resolveConfig({ projectName: 'test-api', packageManager: 'pnpm' });
      const manifest = buildValidManifest('test-api'); // packageManager undefined

      const result = validator.validate(manifest, config);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.code === 'INVALID_PACKAGE_MANAGER')).toBe(true);
    });

    it('flags wrong pnpm version in packageManager field', () => {
      const config = resolveConfig({ projectName: 'test-api', packageManager: 'pnpm' });
      const manifest = buildValidManifest('test-api', {
        packageManager: 'pnpm@9.0.0',
      });

      const result = validator.validate(manifest, config);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.code === 'INVALID_PACKAGE_MANAGER')).toBe(true);
    });

    it('flags missing packageManager field for yarn project', () => {
      const config = resolveConfig({ projectName: 'test-api', packageManager: 'yarn' });
      const manifest = buildValidManifest('test-api'); // packageManager undefined

      const result = validator.validate(manifest, config);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.code === 'INVALID_PACKAGE_MANAGER')).toBe(true);
    });
  });

  describe('validateOrThrow', () => {
    it('throws PackageValidationError when validation fails', () => {
      const config = resolveConfig({ projectName: 'test-api' });
      const manifest = buildValidManifest('test-api', {
        dependencies: {},
      });

      expect(() => validator.validateOrThrow(manifest, config)).toThrow(PackageValidationError);
    });

    it('does not throw when manifest is valid', () => {
      const config = resolveConfig({ projectName: 'test-api' });
      const manifest = buildValidManifest('test-api');

      expect(() => validator.validateOrThrow(manifest, config)).not.toThrow();
    });
  });
});
