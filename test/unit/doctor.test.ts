import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveConfig } from '../../src/config/index.js';
import { runDoctor, requiredEnvVars, type Finding } from '../../src/doctor/index.js';
import { generateProject } from '../../src/generators/generate-project.js';
import { IRONVEIL_VERSION } from '../../src/version.js';
import { ManifestError } from '../../src/manifest/index.js';

const FULL = {
  redis: true,
  queue: true,
  mail: true,
  otel: true,
  auth: 'jwt',
  swagger: true,
  docker: true,
  ci: true,
  testing: true,
  ai: 'all',
} as const;

describe('runDoctor', () => {
  let workspace: string;
  let project: string;

  async function makeProject(overrides: Parameters<typeof resolveConfig>[0] = {}) {
    const result = await generateProject(
      resolveConfig({ projectName: 'shop-api', ...overrides }),
      workspace,
    );
    project = result.destination;
  }

  const file = (relative: string) => path.join(project, relative);
  const read = (relative: string) => readFile(file(relative), 'utf8');
  const write = async (relative: string, content: string) => {
    await mkdir(path.dirname(file(relative)), { recursive: true });
    await writeFile(file(relative), content);
  };
  const edit = async (relative: string, transform: (text: string) => string) =>
    write(relative, transform(await read(relative)));
  const editJson = async (
    relative: string,
    transform: (json: Record<string, any>) => void,
  ) =>
    edit(relative, (text) => {
      const json = JSON.parse(text) as Record<string, any>;
      transform(json);
      return `${JSON.stringify(json, null, 2)}\n`;
    });

  const doctor = async () => (await runDoctor(project)).findings;
  const by = (findings: readonly Finding[], check: Finding['check']) =>
    findings.filter((finding) => finding.check === check);
  const above = (findings: readonly Finding[], ...levels: Finding['severity'][]) =>
    findings.filter((finding) => levels.includes(finding.severity));

  beforeEach(async () => {
    workspace = await mkdtemp(path.join(os.tmpdir(), 'ironveil-doctor-'));
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  describe('a project straight from create', () => {
    it('has no errors or warnings with every feature enabled', async () => {
      await makeProject(FULL);

      const report = await runDoctor(project);

      expect(above(report.findings, 'error', 'warning')).toEqual([]);
      expect(report.ok).toBe(true);
    });

    it('has no errors or warnings with the smallest configuration', async () => {
      await makeProject({
        redis: false,
        auth: 'none',
        swagger: false,
        docker: false,
        ci: false,
        testing: false,
        ai: 'none',
      });

      expect(above(await doctor(), 'error', 'warning')).toEqual([]);
    });

    it('reports the project name and manifest version', async () => {
      await makeProject();

      const report = await runDoctor(project);

      expect(report.projectName).toBe('shop-api');
      expect(report.ironveilVersion).toBe(IRONVEIL_VERSION);
    });
  });

  describe('manifest', () => {
    it('throws a ManifestError outside an Ironveil project', async () => {
      await expect(runDoctor(workspace)).rejects.toBeInstanceOf(ManifestError);
    });

    it('throws a ManifestError for an invalid manifest', async () => {
      await makeProject();
      await write('ironveil.json', '{ "manifestVersion": 1 }');

      await expect(runDoctor(project)).rejects.toBeInstanceOf(ManifestError);
    });
  });

  describe('requiredEnvVars', () => {
    it('lists the always-required and feature-required variables', () => {
      expect(requiredEnvVars(resolveConfig({ projectName: 'a', redis: false }))).toEqual([
        'DATABASE_URL',
      ]);
      expect(requiredEnvVars(resolveConfig({ projectName: 'a', ...FULL }))).toEqual(
        expect.arrayContaining([
          'DATABASE_URL',
          'REDIS_URL',
          'MAIL_HOST',
          'MAIL_FROM',
          'JWT_SECRET',
        ]),
      );
    });

    it('matches the variables the generated environment schema requires', async () => {
      await makeProject(FULL);
      const schema = await read('src/infrastructure/config/environment.ts');
      const required = [...schema.matchAll(/requiredString\('([A-Z_]+)'\)/g)].map(
        (match) => match[1],
      );

      expect([...requiredEnvVars(resolveConfig({ projectName: 'a', ...FULL }))].sort()).toEqual(
        [...required].sort(),
      );
    });
  });

  describe('environment variables', () => {
    it('only notes that there is no .env when it does not exist', async () => {
      await makeProject(FULL);

      const env = by(await doctor(), 'env');

      expect(env).toHaveLength(1);
      expect(env[0]?.severity).toBe('note');
      expect(env[0]?.message).toContain('.env');
    });

    it('is satisfied by a .env copied from .env.example with a real secret', async () => {
      await makeProject(FULL);
      await write('.env', await read('.env.example'));

      expect(above(by(await doctor(), 'env'), 'error', 'warning')).toEqual([]);
    });

    it('warns about each required variable missing from .env', async () => {
      await makeProject(FULL);
      await write('.env', 'PORT=3000\n');

      const messages = above(by(await doctor(), 'env'), 'warning').map(
        (finding) => finding.message,
      );

      for (const name of ['DATABASE_URL', 'REDIS_URL', 'MAIL_HOST', 'MAIL_FROM', 'JWT_SECRET']) {
        expect(messages.some((message) => message.includes(name))).toBe(true);
      }
    });

    it('warns about a required variable that is set but empty', async () => {
      await makeProject({ redis: false });
      await write('.env', 'DATABASE_URL=\n');

      const warnings = above(by(await doctor(), 'env'), 'warning');

      expect(warnings.map((finding) => finding.message).join('\n')).toContain('DATABASE_URL');
    });

    it('does not ask for variables of features that are off', async () => {
      await makeProject({ redis: false, auth: 'none' });
      await write('.env', 'DATABASE_URL=postgresql://u:p@localhost:5432/db\n');

      expect(above(by(await doctor(), 'env'), 'error', 'warning')).toEqual([]);
    });

    it('warns when JWT_SECRET is shorter than the 32 characters the app requires', async () => {
      await makeProject({ auth: 'jwt', redis: false });
      await write(
        '.env',
        'DATABASE_URL=postgresql://u:p@localhost:5432/db\nJWT_SECRET=too-short\n',
      );

      const warnings = above(by(await doctor(), 'env'), 'warning');

      expect(warnings.map((finding) => finding.message).join('\n')).toMatch(
        /JWT_SECRET.*32/,
      );
    });

    it('warns when .env.example no longer lists a variable the features use', async () => {
      await makeProject({ redis: true });
      await edit('.env.example', (text) => text.replace(/^REDIS_URL=.*\n?/m, ''));

      const warnings = above(by(await doctor(), 'env'), 'warning');

      expect(warnings.map((finding) => finding.message).join('\n')).toContain('REDIS_URL');
      expect(warnings.some((finding) => finding.message.includes('.env.example'))).toBe(true);
    });
  });

  describe('modules', () => {
    const ORDERS_MODULE = [
      "import { Module } from '@nestjs/common';",
      '',
      '@Module({})',
      'export class OrdersModule {}',
      '',
    ].join('\n');

    it('warns about a module no other module imports, naming the file and the class', async () => {
      await makeProject();
      await write('src/modules/orders/orders.module.ts', ORDERS_MODULE);

      const warnings = above(by(await doctor(), 'modules'), 'warning');

      expect(warnings).toHaveLength(1);
      expect(warnings[0]?.message).toContain('OrdersModule');
      expect(warnings[0]?.message).toContain('src/modules/orders/orders.module.ts');
      expect(warnings[0]?.fix).toContain('AppModule');
    });

    it('accepts a module imported by AppModule', async () => {
      await makeProject();
      await write('src/modules/orders/orders.module.ts', ORDERS_MODULE);
      await edit('src/app.module.ts', (text) =>
        `import { OrdersModule } from './modules/orders/orders.module';\n${text.replace(
          /imports:\s*\[/,
          'imports: [OrdersModule, ',
        )}`,
      );

      expect(above(by(await doctor(), 'modules'), 'error', 'warning')).toEqual([]);
    });

    it('accepts a module imported by another feature module, even through forwardRef or forRoot', async () => {
      await makeProject();
      await write('src/modules/orders/orders.module.ts', ORDERS_MODULE);
      await write(
        'src/modules/billing/billing.module.ts',
        [
          "import { Module, forwardRef } from '@nestjs/common';",
          "import { OrdersModule } from '../orders/orders.module';",
          '',
          '@Module({ imports: [forwardRef(() => OrdersModule)] })',
          'export class BillingModule {}',
          '',
        ].join('\n'),
      );
      await edit('src/app.module.ts', (text) =>
        `import { BillingModule } from './modules/billing/billing.module';\n${text.replace(
          /imports:\s*\[/,
          'imports: [BillingModule, ',
        )}`,
      );

      expect(above(by(await doctor(), 'modules'), 'error', 'warning')).toEqual([]);
    });

    it('does not count a mention in providers or exports as registration', async () => {
      await makeProject();
      await write('src/modules/orders/orders.module.ts', ORDERS_MODULE);
      await write(
        'src/modules/billing/billing.module.ts',
        [
          "import { Module } from '@nestjs/common';",
          "import { OrdersModule } from '../orders/orders.module';",
          '',
          '@Module({ exports: [OrdersModule] })',
          'export class BillingModule {}',
          '',
        ].join('\n'),
      );

      const classes = above(by(await doctor(), 'modules'), 'warning')
        .map((finding) => finding.message)
        .join('\n');

      expect(classes).toContain('OrdersModule');
    });

    it('finds unregistered modules in infrastructure too', async () => {
      await makeProject({ redis: true });
      await edit('src/infrastructure/infrastructure.module.ts', (text) =>
        text.replace(/RedisModule,?\s*/g, ''),
      );

      const messages = above(by(await doctor(), 'modules'), 'warning')
        .map((finding) => finding.message)
        .join('\n');

      expect(messages).toContain('RedisModule');
    });

    it('reports an error when app.module.ts is missing', async () => {
      await makeProject();
      await rm(file('src/app.module.ts'));

      const errors = above(by(await doctor(), 'modules'), 'error');

      expect(errors).toHaveLength(1);
      expect(errors[0]?.message).toContain('src/app.module.ts');
    });

    it('warns about a resource in ironveil.json whose module folder is gone', async () => {
      await makeProject();
      await editJson('ironveil.json', (json) => {
        json.resources = { 'blog-post': {} };
      });

      const warnings = above(by(await doctor(), 'modules'), 'warning');

      expect(warnings).toHaveLength(1);
      expect(warnings[0]?.message).toContain('blog-post');
      expect(warnings[0]?.message).toContain('src/modules/blog-posts/blog-posts.module.ts');
    });

    it('accepts a resource whose module exists and is registered', async () => {
      await makeProject();
      await write(
        'src/modules/products/products.module.ts',
        ORDERS_MODULE.replaceAll('Orders', 'Products'),
      );
      await edit('src/app.module.ts', (text) =>
        `import { ProductsModule } from './modules/products/products.module';\n${text.replace(
          /imports:\s*\[/,
          'imports: [ProductsModule, ',
        )}`,
      );
      await editJson('ironveil.json', (json) => {
        json.resources = { product: {} };
      });

      expect(above(by(await doctor(), 'modules'), 'error', 'warning')).toEqual([]);
    });
  });

  describe('generated files', () => {
    it('warns about a missing file of an enabled feature', async () => {
      await makeProject({ redis: true });
      await rm(file('src/infrastructure/redis/redis.service.ts'));

      const warnings = above(by(await doctor(), 'files'), 'warning');

      expect(warnings.map((finding) => finding.message).join('\n')).toContain(
        'src/infrastructure/redis/redis.service.ts',
      );
    });

    it('ignores specs, tests, docs and the .gitkeep of src/modules', async () => {
      await makeProject(FULL);
      await rm(file('src/app.module.spec.ts'));
      await rm(file('test/app.e2e-spec.ts'));
      await rm(file('README.md'));
      await rm(file('AGENTS.md'));
      await rm(file('src/modules/.gitkeep'), { force: true });

      expect(by(await doctor(), 'files')).toEqual([]);
    });

    it('does not expect files of features that are off', async () => {
      await makeProject({ redis: false, queue: false });

      expect(by(await doctor(), 'files')).toEqual([]);
    });
  });

  describe('dependencies', () => {
    it('reports an error for a dependency an enabled feature needs', async () => {
      await makeProject({ redis: true });
      await editJson('package.json', (json) => {
        delete json.dependencies.ioredis;
      });

      const errors = above(by(await doctor(), 'dependencies'), 'error');

      expect(errors).toHaveLength(1);
      expect(errors[0]?.message).toContain('ioredis');
    });

    it('reports an error for a missing devDependency', async () => {
      await makeProject({ testing: true });
      await editJson('package.json', (json) => {
        delete json.devDependencies.jest;
      });

      const errors = above(by(await doctor(), 'dependencies'), 'error');

      expect(errors.map((finding) => finding.message).join('\n')).toContain('jest');
    });

    it('warns, but does not fail, when a version differs from what Ironveil pins', async () => {
      await makeProject({ redis: true });
      await editJson('package.json', (json) => {
        json.dependencies.ioredis = '5.0.0';
      });

      const report = await runDoctor(project);
      const findings = by(report.findings, 'dependencies');

      expect(findings).toHaveLength(1);
      expect(findings[0]?.severity).toBe('warning');
      expect(findings[0]?.message).toContain('ioredis');
      expect(findings[0]?.message).toContain('5.0.0');
      expect(report.ok).toBe(true);
    });

    it('is not bothered by extra packages the user added', async () => {
      await makeProject();
      await editJson('package.json', (json) => {
        json.dependencies.lodash = '^4.17.21';
      });

      expect(by(await doctor(), 'dependencies')).toEqual([]);
    });

    it('fails the report when there is an error', async () => {
      await makeProject({ redis: true });
      await editJson('package.json', (json) => {
        delete json.dependencies.ioredis;
      });

      expect((await runDoctor(project)).ok).toBe(false);
    });
  });

  describe('version', () => {
    it('is silent when the project was created by this version', async () => {
      await makeProject();

      expect(by(await doctor(), 'version')).toEqual([]);
    });

    it('notes a project created by an older Ironveil', async () => {
      await makeProject();
      await editJson('ironveil.json', (json) => {
        json.ironveilVersion = '0.0.1';
      });

      const findings = by(await doctor(), 'version');

      expect(findings).toHaveLength(1);
      expect(findings[0]?.severity).toBe('note');
      expect(findings[0]?.message).toContain('0.0.1');
      expect(findings[0]?.message).toContain(IRONVEIL_VERSION);
    });

    it('warns when the project was created by a newer Ironveil', async () => {
      await makeProject();
      await editJson('ironveil.json', (json) => {
        json.ironveilVersion = '99.0.0';
      });

      const findings = by(await doctor(), 'version');

      expect(findings).toHaveLength(1);
      expect(findings[0]?.severity).toBe('warning');
      expect(findings[0]?.fix).toMatch(/upgrade/i);
    });

    it('compares versions numerically, not as text', async () => {
      await makeProject();
      await editJson('ironveil.json', (json) => {
        json.ironveilVersion = '0.10.0';
      });
      // 0.10.0 is newer than 0.3.0 even though "0.10.0" < "0.3.0" as text.
      expect(by(await doctor(), 'version')[0]?.severity).toBe('warning');
    });
  });
});
