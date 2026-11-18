import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveConfig } from '../../src/config/index.js';
import { generateProject } from '../../src/generators/generate-project.js';
import { readManifest } from '../../src/manifest/index.js';
import {
  GenerateError,
  RESOURCE_AUTH_POLICIES,
  parseAuthPolicy,
  parseFields,
  planResource,
  type ResourceAuthPolicy,
} from '../../src/scaffolding/index.js';

describe('resource auth policies', () => {
  let workspace: string;

  beforeEach(async () => {
    workspace = await mkdtemp(path.join(os.tmpdir(), 'ironveil-resource-auth-'));
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  async function makeProject(
    overrides: Parameters<typeof resolveConfig>[0] = { auth: 'jwt' },
  ): Promise<string> {
    const result = await generateProject(
      resolveConfig({ projectName: 'shop-api', ...overrides }),
      workspace,
    );
    return result.destination;
  }

  async function generate(
    root: string,
    auth?: ResourceAuthPolicy,
    name = 'product',
  ) {
    const plan = await planResource({
      root,
      name,
      fields: parseFields('name:string'),
      auth,
    });
    await plan.changeSet.apply();
    return plan;
  }

  const read = (root: string, relative: string) =>
    readFile(path.join(root, relative), 'utf8');

  const controllerOf = (root: string) =>
    read(root, 'src/modules/products/products.controller.ts');
  const e2eOf = (root: string) => read(root, 'test/products.e2e-spec.ts');

  /** The decorator lines directly above `  <handler>(`, as one string. */
  function decoratorsOf(controller: string, handler: string): string {
    const lines = controller.split('\n');
    const index = lines.findIndex((line) => line.startsWith(`  ${handler}(`) || line.startsWith(`  async ${handler}(`));
    expect(index, `handler ${handler}`).toBeGreaterThan(-1);
    const decorators: string[] = [];
    for (let i = index - 1; i >= 0 && lines[i]!.startsWith('  @'); i -= 1) {
      decorators.unshift(lines[i]!);
    }
    return decorators.join('\n');
  }

  const READS = ['findAll', 'findOne'];
  const WRITES = ['create', 'update', 'remove'];

  describe('parseAuthPolicy', () => {
    it('accepts every policy', () => {
      expect([...RESOURCE_AUTH_POLICIES]).toEqual([
        'user',
        'admin-writes',
        'public-read',
        'admin',
      ]);
      for (const policy of RESOURCE_AUTH_POLICIES) {
        expect(parseAuthPolicy(policy)).toBe(policy);
      }
    });

    it('rejects anything else and lists the valid policies', () => {
      expect(() => parseAuthPolicy('everyone')).toThrow(GenerateError);
      expect(() => parseAuthPolicy('everyone')).toThrow(
        /user, admin-writes, public-read, admin/,
      );
    });
  });

  describe('user (the default)', () => {
    it('generates exactly what no --auth generates', async () => {
      const implicit = await makeProject();
      await generate(implicit);

      const explicitWorkspace = await mkdtemp(path.join(os.tmpdir(), 'ironveil-resource-auth2-'));
      try {
        const result = await generateProject(
          resolveConfig({ projectName: 'shop-api', auth: 'jwt' }),
          explicitWorkspace,
        );
        await generate(result.destination, 'user');

        expect(await controllerOf(result.destination)).toBe(await controllerOf(implicit));
        expect(await e2eOf(result.destination)).toBe(await e2eOf(implicit));
      } finally {
        await rm(explicitWorkspace, { recursive: true, force: true });
      }
    });

    it('adds no Public or Roles decorator', async () => {
      const root = await makeProject();
      await generate(root, 'user');

      const controller = await controllerOf(root);
      expect(controller).not.toContain('@Public');
      expect(controller).not.toContain('@Roles');
      expect(controller).not.toContain('auth/');
    });
  });

  describe('admin-writes', () => {
    it('requires the admin role on create, update and delete, and nothing extra on reads', async () => {
      const root = await makeProject();
      await generate(root, 'admin-writes');
      const controller = await controllerOf(root);

      for (const handler of WRITES) {
        expect(decoratorsOf(controller, handler), handler).toContain('@Roles(Role.ADMIN)');
      }
      for (const handler of READS) {
        expect(decoratorsOf(controller, handler), handler).not.toContain('@Roles');
        expect(decoratorsOf(controller, handler), handler).not.toContain('@Public');
      }
    });

    it('imports the decorators and the Role enum from the generated auth module', async () => {
      const root = await makeProject();
      await generate(root, 'admin-writes');
      const controller = await controllerOf(root);

      expect(controller).toContain("import { Roles } from '../auth/decorators/roles.decorator';");
      expect(controller).toContain("import { Role } from '../auth/types/role.type';");
      expect(controller).not.toContain('Public');
    });

    it('asserts the policy in the e2e test', async () => {
      const root = await makeProject();
      await generate(root, 'admin-writes');
      const e2e = await e2eOf(root);

      expect(e2e).toContain("tokenFor('ADMIN')");
      expect(e2e).toContain('403');
      expect(e2e).toContain('401');
      expect(e2e).toMatch(/normal user cannot write/i);
    });
  });

  describe('public-read', () => {
    it('marks the reads @Public() and the writes admin-only', async () => {
      const root = await makeProject();
      await generate(root, 'public-read');
      const controller = await controllerOf(root);

      for (const handler of READS) {
        expect(decoratorsOf(controller, handler), handler).toContain('@Public()');
        expect(decoratorsOf(controller, handler), handler).not.toContain('@Roles');
      }
      for (const handler of WRITES) {
        expect(decoratorsOf(controller, handler), handler).toContain('@Roles(Role.ADMIN)');
        expect(decoratorsOf(controller, handler), handler).not.toContain('@Public');
      }
      expect(controller).toContain("import { Public } from '../auth/decorators/public.decorator';");
    });

    it('asserts that reads work without a token', async () => {
      const root = await makeProject();
      await generate(root, 'public-read');
      const e2e = await e2eOf(root);

      expect(e2e).toMatch(/reads without a token/i);
      expect(e2e).toContain('403');
    });
  });

  describe('admin', () => {
    it('requires the admin role on every route', async () => {
      const root = await makeProject();
      await generate(root, 'admin');
      const controller = await controllerOf(root);

      for (const handler of [...READS, ...WRITES]) {
        expect(decoratorsOf(controller, handler), handler).toContain('@Roles(Role.ADMIN)');
      }
      expect(controller).not.toContain('Public');
    });

    it('asserts that a normal user is refused everywhere', async () => {
      const root = await makeProject();
      await generate(root, 'admin');
      const e2e = await e2eOf(root);

      expect(e2e).toMatch(/normal user cannot read or write/i);
    });
  });

  describe('Swagger', () => {
    it('keeps ApiBearerAuth on the controller when every route needs a token', async () => {
      for (const policy of ['user', 'admin-writes', 'admin'] as const) {
        const root = await makeProject({ auth: 'jwt', swagger: true });
        await generate(root, policy);
        const controller = await controllerOf(root);
        expect(controller, policy).toMatch(/@ApiBearerAuth\(\)\n@Controller/);
        await rm(root, { recursive: true, force: true });
      }
    });

    it('adds ApiForbiddenResponse on admin routes only', async () => {
      const root = await makeProject({ auth: 'jwt', swagger: true });
      await generate(root, 'admin-writes');
      const controller = await controllerOf(root);

      for (const handler of WRITES) {
        expect(decoratorsOf(controller, handler), handler).toContain('@ApiForbiddenResponse(');
      }
      for (const handler of READS) {
        expect(decoratorsOf(controller, handler), handler).not.toContain('@ApiForbiddenResponse');
      }
    });

    it('puts ApiBearerAuth only on the routes that need a token under public-read', async () => {
      const root = await makeProject({ auth: 'jwt', swagger: true });
      await generate(root, 'public-read');
      const controller = await controllerOf(root);

      expect(controller).not.toMatch(/@ApiBearerAuth\(\)\n@Controller/);
      for (const handler of WRITES) {
        expect(decoratorsOf(controller, handler), handler).toContain('@ApiBearerAuth()');
      }
      for (const handler of READS) {
        expect(decoratorsOf(controller, handler), handler).not.toContain('@ApiBearerAuth');
      }
    });

    it('adds no Swagger import when Swagger is off', async () => {
      const root = await makeProject({ auth: 'jwt', swagger: false });
      await generate(root, 'admin');

      expect(await controllerOf(root)).not.toContain('@nestjs/swagger');
    });
  });

  describe('without JWT auth', () => {
    it('refuses any policy other than user and writes nothing', async () => {
      const root = await makeProject({ auth: 'none' });

      for (const policy of ['admin-writes', 'public-read', 'admin'] as const) {
        const plan = planResource({
          root,
          name: 'product',
          fields: [],
          auth: policy,
        });
        await expect(plan).rejects.toThrow(GenerateError);
        await expect(plan).rejects.toThrow(/JWT authentication/);
      }

      await expect(read(root, 'src/modules/products/products.module.ts')).rejects.toThrow();
    });

    it('accepts the user policy', async () => {
      const root = await makeProject({ auth: 'none' });

      await expect(generate(root, 'user')).resolves.toBeDefined();
    });
  });

  describe('the manifest', () => {
    it('records the policy under the resource', async () => {
      const root = await makeProject();
      await generate(root, 'admin-writes');
      await generate(root, undefined, 'blog-post');

      const manifest = await readManifest(root);

      expect(manifest.resources).toEqual({
        product: { auth: 'admin-writes' },
        'blog-post': { auth: 'user' },
      });
    });

    it('records the resource without a policy when the project has no auth', async () => {
      const root = await makeProject({ auth: 'none' });
      await generate(root);

      expect((await readManifest(root)).resources).toEqual({ product: {} });
    });

    it('is part of the plan, so --dry-run shows it and nothing is written early', async () => {
      const root = await makeProject();
      const before = await read(root, 'ironveil.json');

      const plan = await planResource({ root, name: 'product', fields: [], auth: 'admin' });

      expect(plan.auth).toBe('admin');
      expect(plan.changeSet.changes.map((change) => change.path)).toContain('ironveil.json');
      expect(await read(root, 'ironveil.json')).toBe(before);
    });

    it('is not touched again by a no-op re-run', async () => {
      const root = await makeProject();
      await generate(root, 'admin');

      const again = await planResource({ root, name: 'product', fields: parseFields('name:string'), auth: 'admin' });

      expect(again.changeSet.changes).toHaveLength(0);
    });
  });

  describe('re-running with another policy', () => {
    it('refuses, because the controller on disk differs, and keeps the files', async () => {
      const root = await makeProject();
      await generate(root, 'admin');
      const before = await controllerOf(root);

      await expect(
        planResource({ root, name: 'product', fields: parseFields('name:string'), auth: 'public-read' }),
      ).rejects.toThrow(GenerateError);
      expect(await controllerOf(root)).toBe(before);
    });
  });
});
