import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AddError, planAdd } from '../../src/adding/index.js';
import { resolveConfig } from '../../src/config/index.js';
import { generateProject } from '../../src/generators/generate-project.js';
import { readManifest } from '../../src/manifest/index.js';
import { parseFields, planResource } from '../../src/scaffolding/index.js';

type Overrides = Parameters<typeof resolveConfig>[0];

const NOW = new Date('2026-11-18T09:30:00Z');
const INIT_MIGRATION = 'prisma/migrations/0001_init/migration.sql';
const ADD_AUTH_MIGRATION = 'prisma/migrations/20261118093000_add_auth/migration.sql';

async function readTree(root: string, directory = ''): Promise<Map<string, string>> {
  const tree = new Map<string, string>();
  for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
    const relative = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) {
      for (const [file, text] of await readTree(root, relative)) tree.set(file, text);
    } else {
      tree.set(relative, await readFile(path.join(root, relative), 'utf8'));
    }
  }
  return tree;
}

describe('ironveil add auth', () => {
  let workspace: string;
  let counter = 0;

  beforeEach(async () => {
    workspace = await mkdtemp(path.join(os.tmpdir(), 'ironveil-add-auth-'));
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  async function makeProject(overrides: Overrides = {}): Promise<string> {
    counter += 1;
    const parent = path.join(workspace, `p${counter}`);
    await mkdir(parent);
    const result = await generateProject(
      resolveConfig({ projectName: 'shop-api', ...overrides }),
      parent,
    );
    return result.destination;
  }

  const read = (root: string, relative: string) =>
    readFile(path.join(root, relative), 'utf8');
  const write = (root: string, relative: string, text: string) =>
    writeFile(path.join(root, relative), text);

  async function addAuth(root: string, now: Date = NOW) {
    const plan = await planAdd({ root, feature: 'auth', now });
    await plan.changeSet.apply();
    return plan;
  }

  async function addResource(
    root: string,
    name: string,
    fields: string,
    now = new Date('2026-11-10T08:00:00Z'),
  ) {
    const plan = await planResource({ root, name, fields: parseFields(fields), now });
    await plan.changeSet.apply();
  }

  describe('adding gives the same project as creating with auth', () => {
    const shapes: ReadonlyArray<readonly [string, Overrides]> = [
      ['defaults', {}],
      ['redis', { redis: true }],
      ['no swagger, pnpm', { swagger: false, packageManager: 'pnpm' }],
      ['yarn, everything else off', {
        packageManager: 'yarn',
        swagger: false,
        docker: false,
        ci: false,
        testing: false,
        ai: 'none',
      }],
    ];

    for (const [label, rest] of shapes) {
      it(`${label}, apart from the additive migration`, async () => {
        const added = await makeProject({ ...rest, auth: 'none' });
        const original = await readTree(added);
        await addAuth(added);

        const created = await makeProject({ ...rest, auth: 'jwt' });
        const expected = await readTree(created);
        const actual = await readTree(added);

        // The applied 0001_init migration is never edited; the schema change
        // lives in a new migration instead.
        expect(actual.get(INIT_MIGRATION)).toBe(original.get(INIT_MIGRATION));
        expect(actual.has(ADD_AUTH_MIGRATION)).toBe(true);
        actual.delete(ADD_AUTH_MIGRATION);
        expected.delete(INIT_MIGRATION);
        actual.delete(INIT_MIGRATION);

        expect([...actual.keys()].sort()).toEqual([...expected.keys()].sort());
        for (const [file, text] of expected) {
          expect(actual.get(file), file).toBe(text);
        }
      });
    }
  });

  describe('the additive migration', () => {
    it('is a new, timestamped migration that creates the enum, the column and the table', async () => {
      const root = await makeProject();

      const plan = await addAuth(root);

      expect(plan.migration).toBe('20261118093000_add_auth');
      const sql = await read(root, ADD_AUTH_MIGRATION);
      expect(sql).toContain(`CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');`);
      expect(sql).toContain(
        `ALTER TABLE "User" ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'USER';`,
      );
      expect(sql).toContain('CREATE TABLE "RefreshToken" (');
      expect(sql).toContain('REFERENCES "User"("id") ON DELETE CASCADE');
    });

    it('uses the same statements `create --auth jwt` puts in 0001_init', async () => {
      const root = await makeProject();
      const created = await makeProject({ auth: 'jwt' });
      await addAuth(root);

      const full = await read(created, INIT_MIGRATION);
      const additive = await read(root, ADD_AUTH_MIGRATION);
      const statements = additive
        .trim()
        .split(/\n\n/)
        .filter((statement) => !statement.includes('ALTER TABLE "User" ADD COLUMN'));

      expect(statements.length).toBeGreaterThan(4);
      for (const statement of statements) {
        expect(full, statement).toContain(statement);
      }
    });

    it('sorts after every existing migration, even one with a later timestamp than the clock', async () => {
      const root = await makeProject();
      await mkdir(path.join(root, 'prisma/migrations/20300101000000_from_the_future'), {
        recursive: true,
      });
      await write(
        root,
        'prisma/migrations/20300101000000_from_the_future/migration.sql',
        '-- nothing\n',
      );

      const plan = await addAuth(root);

      expect(plan.migration).toBe('20300101000001_add_auth');
    });

    it('leaves 0001_init and every migration of an earlier resource untouched', async () => {
      const root = await makeProject();
      await addResource(root, 'product', 'name:string price:decimal');
      const before = await readTree(root, 'prisma/migrations');

      await addAuth(root);

      const after = await readTree(root, 'prisma/migrations');
      for (const [file, text] of before) {
        expect(after.get(file), file).toBe(text);
      }
      expect(after.size).toBe(before.size + 1);
    });
  });

  describe('a project with resources', () => {
    it('adds the auth fields and models to the edited schema and keeps the resource model', async () => {
      const root = await makeProject();
      await addResource(root, 'product', 'name:string price:decimal');

      await addAuth(root);

      const schema = await read(root, 'prisma/schema.prisma');
      expect(schema).toMatch(/model User \{[^}]*role\s+Role\s+@default\(USER\)[^}]*refreshTokens\s+RefreshToken\[\]/s);
      expect(schema).toMatch(/enum Role \{\s*USER\s*ADMIN\s*\}/);
      expect(schema.match(/model RefreshToken \{/g)).toHaveLength(1);
      expect(schema).toContain('model Product {');
    });

    it('registers AuthModule next to the resource module in AppModule', async () => {
      const root = await makeProject();
      await addResource(root, 'product', 'name:string price:decimal');

      await addAuth(root);

      const appModule = await read(root, 'src/app.module.ts');
      expect(appModule).toContain('AuthModule');
      expect(appModule).toContain('ProductsModule');
      expect(appModule).toContain("from './modules/auth/auth.module'");
      expect(await read(root, 'src/modules/auth/auth.module.ts')).toContain('APP_GUARD');
    });

    it('turns the resource into the same code `generate resource` writes on an auth project', async () => {
      for (const overrides of [{}, { swagger: false }, { testing: false }] as Overrides[]) {
        const added = await makeProject({ ...overrides, auth: 'none' });
        await addResource(added, 'product', 'name:string price:decimal stock:int?');
        await addAuth(added);

        const created = await makeProject({ ...overrides, auth: 'jwt' });
        await addResource(created, 'product', 'name:string price:decimal stock:int?');

        const resourceFiles = [...(await readTree(created, 'src/modules/products')).keys()]
          .concat(overrides.testing === false ? [] : ['test/products.e2e-spec.ts']);
        expect(resourceFiles.length).toBeGreaterThan(4);
        for (const file of resourceFiles) {
          expect(await read(added, file), JSON.stringify(overrides) + file).toBe(
            await read(created, file),
          );
        }
      }
    });

    it('does the same for a resource whose fields are all optional', async () => {
      const added = await makeProject();
      await addResource(added, 'tag', 'label:string? weight:int?');
      const plan = await addAuth(added);

      const created = await makeProject({ auth: 'jwt' });
      await addResource(created, 'tag', 'label:string? weight:int?');

      expect(await read(added, 'test/tags.e2e-spec.ts')).toBe(
        await read(created, 'test/tags.e2e-spec.ts'),
      );
      expect(plan.notes.join('\n')).not.toContain('tags.e2e-spec.ts');
    });

    it('records the `user` policy for every resource in the manifest and keeps its other keys', async () => {
      const root = await makeProject();
      await addResource(root, 'product', 'name:string');
      await addResource(root, 'blog-post', 'title:string');

      await addAuth(root);

      const manifest = await readManifest(root);
      expect(manifest.features.auth).toBe('jwt');
      expect(manifest.resources).toEqual({
        product: { auth: 'user' },
        'blog-post': { auth: 'user' },
      });
    });

    it('notes that the resources are now protected', async () => {
      const root = await makeProject();
      await addResource(root, 'product', 'name:string');

      const plan = await planAdd({ root, feature: 'auth', now: NOW });

      const notes = plan.notes.join('\n');
      expect(notes).toMatch(/product/);
      expect(notes).toMatch(/token/i);
    });

    it('keeps a spec the user extended, and still makes it sign in', async () => {
      const root = await makeProject();
      await addResource(root, 'product', 'name:string');
      const specPath = 'test/products.e2e-spec.ts';
      await write(root, specPath, `${await read(root, specPath)}\n// my own notes\n`);

      await addAuth(root);

      const spec = await read(root, specPath);
      expect(spec).toContain('// my own notes');
      expect(spec).toContain("import { JwtService } from '@nestjs/jwt';");
      expect(spec).toContain('rejects requests without a token');
      expect(spec).not.toContain('authorize = (test) => test;');
    });

    it('leaves a spec it cannot merge as it is, says so, and still adds auth', async () => {
      const root = await makeProject();
      await addResource(root, 'product', 'name:string');
      const specPath = 'test/products.e2e-spec.ts';
      const mine = (await read(root, specPath)).replace(
        'authorize = (test) => test;',
        'authorize = (test) => test.set("x-mine", "1");',
      );
      await write(root, specPath, mine);

      const plan = await addAuth(root);

      expect(await read(root, specPath)).toBe(mine);
      expect(plan.notes.join('\n')).toContain(specPath);
      expect(await read(root, 'src/modules/auth/auth.module.ts')).toContain('AuthModule');
      expect((await readManifest(root)).features.auth).toBe('jwt');
    });

    it('skips a resource whose files were deleted', async () => {
      const root = await makeProject();
      await addResource(root, 'product', 'name:string');
      await rm(path.join(root, 'test/products.e2e-spec.ts'));

      await addAuth(root);

      await expect(read(root, 'test/products.e2e-spec.ts')).rejects.toThrow();
    });
  });

  describe('the drift check', () => {
    it('refuses a schema with no User model and writes nothing', async () => {
      const root = await makeProject();
      const schema = await read(root, 'prisma/schema.prisma');
      await write(root, 'prisma/schema.prisma', schema.replace('model User {', 'model Account {'));
      const before = await readTree(root);

      const failure = planAdd({ root, feature: 'auth', now: NOW });

      await expect(failure).rejects.toBeInstanceOf(AddError);
      await expect(failure).rejects.toThrow(/model User.*schema\.prisma/s);
      expect(await readTree(root)).toEqual(before);
    });

    it('refuses when the migrations never create the User table', async () => {
      const root = await makeProject();
      await write(root, INIT_MIGRATION, '-- squashed away\n');
      const before = await readTree(root);

      await expect(planAdd({ root, feature: 'auth', now: NOW })).rejects.toThrow(
        /migrations.*"User"/s,
      );
      expect(await readTree(root)).toEqual(before);
    });

    it('refuses a schema that already has a role field on User', async () => {
      const root = await makeProject();
      const schema = await read(root, 'prisma/schema.prisma');
      await write(
        root,
        'prisma/schema.prisma',
        schema.replace('  email        String   @unique', '  email        String   @unique\n  role         String   @default("user")'),
      );

      await expect(planAdd({ root, feature: 'auth', now: NOW })).rejects.toThrow(
        /role.*already/is,
      );
    });

    it.each(['enum Role {\n  A\n}', 'model RefreshToken {\n  id String @id\n}'])(
      'refuses a schema that already defines %s',
      async (definition) => {
        const root = await makeProject();
        const schema = await read(root, 'prisma/schema.prisma');
        await write(root, 'prisma/schema.prisma', `${schema}\n\n${definition}\n`);
        const before = await readTree(root);

        await expect(planAdd({ root, feature: 'auth', now: NOW })).rejects.toThrow(
          /already/i,
        );
        expect(await readTree(root)).toEqual(before);
      },
    );

    it('refuses an existing auth module with other content, like any file clash', async () => {
      const root = await makeProject();
      await mkdir(path.join(root, 'src/modules/auth'), { recursive: true });
      await write(root, 'src/modules/auth/auth.module.ts', '// my own auth\n');
      const before = await readTree(root);

      await expect(planAdd({ root, feature: 'auth', now: NOW })).rejects.toThrow(
        /auth\.module\.ts.*already exists/s,
      );
      expect(await readTree(root)).toEqual(before);
    });
  });

  describe('planning', () => {
    it('is a no-op when the project already has auth', async () => {
      const root = await makeProject({ auth: 'jwt' });

      const plan = await planAdd({ root, feature: 'auth', now: NOW });

      expect(plan.alreadyEnabled).toBe(true);
      expect(plan.changeSet.isEmpty).toBe(true);
      expect(plan.migration).toBeNull();
    });

    it('writes nothing while planning, and asks for an install', async () => {
      const root = await makeProject();
      const before = await readTree(root);

      const plan = await planAdd({ root, feature: 'auth', now: NOW });

      expect(await readTree(root)).toEqual(before);
      expect(plan.dependenciesChanged).toBe(true);
      expect(plan.migration).toBe('20261118093000_add_auth');
    });

    it('rejects a mode', async () => {
      const root = await makeProject();

      await expect(planAdd({ root, feature: 'auth', mode: 'x' })).rejects.toThrow(/no mode/i);
    });
  });
});
