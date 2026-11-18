import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ts } from 'ts-morph';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveConfig } from '../../src/config/index.js';
import { generateProject } from '../../src/generators/generate-project.js';
import {
  COMPONENT_KINDS,
  GenerateError,
  parseFields,
  planComponent,
  type ComponentKind,
} from '../../src/scaffolding/index.js';

describe('planComponent', () => {
  let workspace: string;

  beforeEach(async () => {
    workspace = await mkdtemp(path.join(os.tmpdir(), 'ironveil-component-'));
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  async function makeProject(
    overrides: Parameters<typeof resolveConfig>[0] = {},
  ): Promise<string> {
    const result = await generateProject(
      resolveConfig({ projectName: 'shop-api', ...overrides }),
      workspace,
    );
    return result.destination;
  }

  const read = (root: string, relative: string) =>
    readFile(path.join(root, relative), 'utf8');

  const exists = (root: string, relative: string) =>
    readFile(path.join(root, relative)).then(
      () => true,
      () => false,
    );

  async function plan(
    root: string,
    kind: ComponentKind,
    name: string,
    extra: { module?: string; fields?: string } = {},
  ) {
    return planComponent({
      root,
      kind,
      name,
      module: extra.module,
      fields: extra.fields === undefined ? [] : parseFields(extra.fields),
    });
  }

  async function generate(
    root: string,
    kind: ComponentKind,
    name: string,
    extra: { module?: string; fields?: string } = {},
  ) {
    const result = await plan(root, kind, name, extra);
    await result.changeSet.apply();
    return result;
  }

  const paths = (result: Awaited<ReturnType<typeof plan>>): string[] =>
    result.changeSet.changes.map((change) => change.path).sort();

  function expectValidTypeScript(source: string): void {
    const { diagnostics } = ts.transpileModule(source, {
      reportDiagnostics: true,
      compilerOptions: {
        experimentalDecorators: true,
        target: ts.ScriptTarget.ES2022,
      },
    });
    expect(diagnostics?.map((d) => d.messageText)).toEqual([]);
  }

  it('lists the five kinds', () => {
    expect([...COMPONENT_KINDS]).toEqual([
      'module',
      'controller',
      'service',
      'guard',
      'dto',
    ]);
  });

  describe('module', () => {
    it('writes an empty module and registers it in AppModule', async () => {
      const root = await makeProject();

      const result = await plan(root, 'module', 'billing');

      expect(paths(result)).toEqual([
        'src/app.module.ts',
        'src/modules/billing/billing.module.ts',
      ]);
      await result.changeSet.apply();
      expect(await read(root, 'src/modules/billing/billing.module.ts')).toBe(
        ["import { Module } from '@nestjs/common';", '', '@Module({})', 'export class BillingModule {}', ''].join('\n'),
      );
      const appModule = await read(root, 'src/app.module.ts');
      expect(appModule).toContain(
        "import { BillingModule } from './modules/billing/billing.module';",
      );
      expect(appModule).toMatch(/imports:\s*\[[^\]]*BillingModule/s);
    });

    it('accepts any casing and does not pluralise', async () => {
      const root = await makeProject();

      await generate(root, 'module', 'BlogPost');

      expect(await exists(root, 'src/modules/blog-post/blog-post.module.ts')).toBe(true);
      expect(await read(root, 'src/modules/blog-post/blog-post.module.ts')).toContain(
        'export class BlogPostModule {}',
      );
    });

    it('is a no-op when run again', async () => {
      const root = await makeProject();
      await generate(root, 'module', 'billing');

      const again = await plan(root, 'module', 'billing');

      expect(again.changeSet.changes).toEqual([]);
    });

    it('refuses --module, which makes no sense for a module', async () => {
      const root = await makeProject();

      await expect(plan(root, 'module', 'billing', { module: 'x' })).rejects.toThrow(
        /--module/,
      );
    });
  });

  describe('service', () => {
    it('creates its own feature module when there is none, and registers the service', async () => {
      const root = await makeProject();

      const result = await plan(root, 'service', 'billing');

      expect(paths(result)).toEqual([
        'src/app.module.ts',
        'src/modules/billing/billing.module.ts',
        'src/modules/billing/billing.service.spec.ts',
        'src/modules/billing/billing.service.ts',
      ]);
      await result.changeSet.apply();
      expect(await read(root, 'src/modules/billing/billing.service.ts')).toBe(
        ["import { Injectable } from '@nestjs/common';", '', '@Injectable()', 'export class BillingService {}', ''].join('\n'),
      );
      const module = await read(root, 'src/modules/billing/billing.module.ts');
      expect(module).toContain("import { BillingService } from './billing.service';");
      expect(module).toContain('providers: [BillingService]');
    });

    it('registers in the existing module of that feature and leaves AppModule alone', async () => {
      const root = await makeProject();
      await generate(root, 'module', 'billing');

      const result = await plan(root, 'service', 'billing');

      expect(paths(result)).toEqual([
        'src/modules/billing/billing.module.ts',
        'src/modules/billing/billing.service.spec.ts',
        'src/modules/billing/billing.service.ts',
      ]);
    });

    it('puts the file in another feature with --module', async () => {
      const root = await makeProject();
      await generate(root, 'module', 'billing');

      const result = await generate(root, 'service', 'invoice-calculator', {
        module: 'billing',
      });

      expect(paths(result)).toEqual([
        'src/modules/billing/billing.module.ts',
        'src/modules/billing/invoice-calculator.service.spec.ts',
        'src/modules/billing/invoice-calculator.service.ts',
      ]);
      expect(await read(root, 'src/modules/billing/invoice-calculator.service.ts')).toContain(
        'export class InvoiceCalculatorService {}',
      );
      expect(await read(root, 'src/modules/billing/billing.module.ts')).toContain(
        'providers: [InvoiceCalculatorService]',
      );
    });

    it('keeps adding to the same module without duplicating', async () => {
      const root = await makeProject();
      await generate(root, 'service', 'billing');
      await generate(root, 'service', 'tax', { module: 'billing' });
      await generate(root, 'controller', 'billing');

      const module = await read(root, 'src/modules/billing/billing.module.ts');
      expect(module).toMatch(/controllers:\s*\[BillingController\]/);
      expect(module).toMatch(/providers:\s*\[\s*BillingService,\s*TaxService\s*\]|providers: \[BillingService, TaxService\]/);
      expect(module.match(/BillingService/g)).toHaveLength(2);
    });

    it('fails clearly when --module names a module that does not exist', async () => {
      const root = await makeProject();

      const failure = plan(root, 'service', 'tax', { module: 'billing' });

      await expect(failure).rejects.toBeInstanceOf(GenerateError);
      await expect(failure).rejects.toThrow(/ironveil generate module billing/);
    });

    it('is a no-op when run again', async () => {
      const root = await makeProject();
      await generate(root, 'service', 'billing');

      const again = await plan(root, 'service', 'billing');

      expect(again.changeSet.changes).toEqual([]);
    });

    it('writes a service spec that only runs when testing is on', async () => {
      const withTests = await makeProject();
      await generate(withTests, 'service', 'billing');
      const spec = await read(withTests, 'src/modules/billing/billing.service.spec.ts');
      expect(spec).toContain("import { Test } from '@nestjs/testing';");
      expect(spec).toContain("describe('BillingService'");
      expectValidTypeScript(spec);

      const noTests = await makeProject({ projectName: 'plain-api', testing: false });
      const result = await plan(noTests, 'service', 'billing');
      expect(paths(result).some((file) => file.endsWith('.spec.ts'))).toBe(false);
    });
  });

  describe('controller', () => {
    it('writes a controller routed at the name and registers it', async () => {
      const root = await makeProject();

      const result = await generate(root, 'controller', 'billing');

      expect(paths(result)).toEqual([
        'src/app.module.ts',
        'src/modules/billing/billing.controller.spec.ts',
        'src/modules/billing/billing.controller.ts',
        'src/modules/billing/billing.module.ts',
      ]);
      const controller = await read(root, 'src/modules/billing/billing.controller.ts');
      expect(controller).toContain("@Controller('billing')");
      expect(controller).toContain('export class BillingController {}');
      expect(await read(root, 'src/modules/billing/billing.module.ts')).toContain(
        'controllers: [BillingController]',
      );
      expectValidTypeScript(controller);
    });

    it('adds Swagger tags, plus bearer auth under JWT, only when those are enabled', async () => {
      const plain = await makeProject({ swagger: false });
      await generate(plain, 'controller', 'billing');
      expect(await read(plain, 'src/modules/billing/billing.controller.ts')).not.toContain(
        'swagger',
      );

      const swagger = await makeProject({ projectName: 'sw-api', swagger: true });
      await generate(swagger, 'controller', 'billing');
      const swaggerController = await read(swagger, 'src/modules/billing/billing.controller.ts');
      expect(swaggerController).toContain("@ApiTags('billing')");
      expect(swaggerController).not.toContain('ApiBearerAuth');

      const jwt = await makeProject({ projectName: 'jwt-api', swagger: true, auth: 'jwt' });
      await generate(jwt, 'controller', 'billing');
      const jwtController = await read(jwt, 'src/modules/billing/billing.controller.ts');
      expect(jwtController).toContain('@ApiBearerAuth()');
      expectValidTypeScript(jwtController);
    });

    it('does not guess a route when the user typed a multi-word name', async () => {
      const root = await makeProject();

      await generate(root, 'controller', 'BlogPost');

      expect(await read(root, 'src/modules/blog-post/blog-post.controller.ts')).toContain(
        "@Controller('blog-post')",
      );
    });
  });

  describe('guard', () => {
    it('writes a guard under common/guards that rejects until it is implemented, and registers nothing', async () => {
      const root = await makeProject();

      const result = await generate(root, 'guard', 'api-key');

      expect(paths(result)).toEqual([
        'src/common/guards/api-key.guard.spec.ts',
        'src/common/guards/api-key.guard.ts',
      ]);
      const guard = await read(root, 'src/common/guards/api-key.guard.ts');
      expect(guard).toContain('export class ApiKeyGuard implements CanActivate');
      expect(guard).toContain('return false;');
      expectValidTypeScript(guard);
      expect(await read(root, 'src/app.module.ts')).not.toContain('ApiKey');
    });

    it('goes into a feature module with --module', async () => {
      const root = await makeProject();
      await generate(root, 'module', 'billing');

      const result = await plan(root, 'guard', 'owner', { module: 'billing' });

      expect(paths(result)).toEqual([
        'src/modules/billing/guards/owner.guard.spec.ts',
        'src/modules/billing/guards/owner.guard.ts',
      ]);
    });
  });

  describe('dto', () => {
    it('writes an empty DTO class under common/dto by default', async () => {
      const root = await makeProject();

      const result = await generate(root, 'dto', 'create-invoice');

      expect(paths(result)).toEqual(['src/common/dto/create-invoice.dto.ts']);
      expect(await read(root, 'src/common/dto/create-invoice.dto.ts')).toBe(
        'export class CreateInvoiceDto {}\n',
      );
    });

    it('renders --fields with class-validator decorators and Swagger when enabled', async () => {
      const root = await makeProject({ swagger: true });

      await generate(root, 'dto', 'create-invoice', {
        module: undefined,
        fields: 'number:string total:decimal note:text?',
      });

      const dto = await read(root, 'src/common/dto/create-invoice.dto.ts');
      expect(dto).toContain('export class CreateInvoiceDto {');
      expect(dto).toContain('@IsNumber({ maxDecimalPlaces: 2 })');
      expect(dto).toContain('number!: string;');
      expect(dto).toContain('total!: number;');
      expect(dto).toContain('note?: string;');
      expect(dto).toContain('@ApiProperty()');
      expect(dto).toContain('@ApiPropertyOptional()');
      expect(dto).toContain('@IsOptional()');
      expectValidTypeScript(dto);
    });

    it('goes into <module>/dto with --module', async () => {
      const root = await makeProject();
      await generate(root, 'module', 'billing');

      const result = await plan(root, 'dto', 'create-invoice', { module: 'billing' });

      expect(paths(result)).toEqual(['src/modules/billing/dto/create-invoice.dto.ts']);
    });
  });

  describe('--fields', () => {
    it.each(['module', 'controller', 'service', 'guard'] as const)(
      'is refused for %s, which has no properties',
      async (kind) => {
        const root = await makeProject();

        await expect(
          plan(root, kind, 'billing', { fields: 'name:string' }),
        ).rejects.toThrow(/--fields/);
      },
    );
  });

  describe('safety', () => {
    it.each(COMPONENT_KINDS)('never overwrites a %s that differs from what would be generated', async (kind) => {
      const root = await makeProject();
      const first = await generate(root, kind, 'billing');
      const target = first.changeSet.changes
        .map((change) => change.path)
        .find((file) => file.includes(`billing.${kind}.ts`) || file.includes('billing.dto.ts') || (kind === 'module' && file.endsWith('billing.module.ts')));
      expect(target).toBeDefined();
      await writeFile(path.join(root, target as string), '// my own code\n');

      const failure = plan(root, kind, 'billing');

      await expect(failure).rejects.toBeInstanceOf(GenerateError);
      await expect(failure).rejects.toThrow(/never overwrites/i);
      expect(await read(root, target as string)).toBe('// my own code\n');
    });

    it.each(['', '1abc', 'bad name', 'a/b', '../x'])('rejects the invalid name %j', async (name) => {
      const root = await makeProject();

      await expect(plan(root, 'service', name)).rejects.toThrow(/invalid service name/i);
    });

    it('names the kind in the error for a bad --module value', async () => {
      const root = await makeProject();

      await expect(plan(root, 'service', 'tax', { module: '../x' })).rejects.toThrow(
        /invalid module name/i,
      );
    });

    it('fails outside an Ironveil project', async () => {
      await expect(plan(workspace, 'service', 'billing')).rejects.toThrow(
        /not an Ironveil project/i,
      );
    });

    it('plans without writing anything', async () => {
      const root = await makeProject();

      await plan(root, 'service', 'billing');

      expect(await exists(root, 'src/modules/billing/billing.service.ts')).toBe(false);
    });
  });
});
