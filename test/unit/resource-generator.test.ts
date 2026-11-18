import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ts } from 'ts-morph';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveConfig } from '../../src/config/index.js';
import { generateProject } from '../../src/generators/generate-project.js';
import { ManifestError } from '../../src/manifest/index.js';
import {
  GenerateError,
  parseFields,
  planResource,
} from '../../src/scaffolding/index.js';

const NOW = new Date('2026-11-18T09:30:00Z');
const FIELDS = 'name:string description:text? price:decimal stock:int rating:float? active:boolean publishedAt:datetime?';

describe('planResource', () => {
  let workspace: string;

  beforeEach(async () => {
    workspace = await mkdtemp(path.join(os.tmpdir(), 'ironveil-resource-'));
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
    name = 'product',
    fields = FIELDS,
    now = NOW,
  ) {
    return planResource({ root, name, fields: parseFields(fields), now });
  }

  async function generate(root: string, name = 'product', fields = FIELDS) {
    const resource = await plan(root, name, fields);
    await resource.changeSet.apply();
    return resource;
  }

  function paths(resource: Awaited<ReturnType<typeof plan>>): string[] {
    return resource.changeSet.changes.map((change) => change.path).sort();
  }

  describe('what it plans', () => {
    it('plans the module, its tests, the shared pagination files and the three edits', async () => {
      const root = await makeProject();

      const resource = await plan(root);

      expect(paths(resource)).toEqual(
        [
          'prisma/migrations/20261118093000_create_products/migration.sql',
          'prisma/schema.prisma',
          'src/app.module.ts',
          'src/common/pagination/paginated.ts',
          'src/common/pagination/pagination-query.dto.ts',
          'src/modules/products/dto/create-product.dto.ts',
          'src/modules/products/dto/update-product.dto.ts',
          'src/modules/products/products.controller.ts',
          'src/modules/products/products.module.ts',
          'src/modules/products/products.service.spec.ts',
          'src/modules/products/products.service.ts',
          'test/products.e2e-spec.ts',
        ].sort(),
      );
      expect(resource.alreadyGenerated).toBe(false);
      expect(resource.migration).toBe('20261118093000_create_products');
    });

    it('writes nothing to disk while planning', async () => {
      const root = await makeProject();
      const before = await read(root, 'src/app.module.ts');

      await plan(root);

      expect(await read(root, 'src/app.module.ts')).toBe(before);
      expect(await exists(root, 'src/modules/products/products.module.ts')).toBe(
        false,
      );
    });

    it('skips the unit and e2e tests when testing is disabled', async () => {
      const root = await makeProject({ testing: false });

      const resource = await plan(root);

      expect(paths(resource).some((file) => /spec\.ts$/.test(file))).toBe(false);
      expect(paths(resource)).toContain('src/modules/products/products.service.ts');
    });

    it('names everything after a multi-word resource', async () => {
      const root = await makeProject();

      const resource = await plan(root, 'BlogPost', 'title:string');

      expect(paths(resource)).toEqual(
        expect.arrayContaining([
          'src/modules/blog-posts/blog-posts.module.ts',
          'src/modules/blog-posts/blog-posts.controller.ts',
          'src/modules/blog-posts/blog-posts.service.ts',
          'src/modules/blog-posts/dto/create-blog-post.dto.ts',
          'src/modules/blog-posts/dto/update-blog-post.dto.ts',
          'test/blog-posts.e2e-spec.ts',
          'prisma/migrations/20261118093000_create_blog_posts/migration.sql',
        ]),
      );
      await resource.changeSet.apply();
      const service = await read(root, 'src/modules/blog-posts/blog-posts.service.ts');
      expect(service).toContain('export class BlogPostsService');
      expect(service).toContain('this.prisma.blogPost.');
      expect(await read(root, 'src/modules/blog-posts/blog-posts.controller.ts')).toContain(
        "@Controller('blog-posts')",
      );
      expect(await read(root, 'prisma/schema.prisma')).toContain('model BlogPost {');
    });
  });

  describe('the edits to existing files', () => {
    it('registers the module in AppModule', async () => {
      const root = await makeProject();

      await generate(root);

      const appModule = await read(root, 'src/app.module.ts');
      expect(appModule).toContain(
        "import { ProductsModule } from './modules/products/products.module';",
      );
      expect(appModule).toMatch(/imports: \[[^\]]*ProductsModule/s);
      expect(appModule).toContain('HealthModule');
    });

    it('registers the module next to the auth module when auth is enabled', async () => {
      const root = await makeProject({ auth: 'jwt' });

      await generate(root);

      const appModule = await read(root, 'src/app.module.ts');
      expect(appModule).toContain('AuthModule');
      expect(appModule).toContain('ProductsModule');
    });

    it('appends the Prisma model with aligned columns and leaves User alone', async () => {
      const root = await makeProject();
      const before = await read(root, 'prisma/schema.prisma');

      await generate(root);

      const schema = await read(root, 'prisma/schema.prisma');
      expect(schema.startsWith(before.trimEnd())).toBe(true);
      expect(schema).toContain(
        [
          'model Product {',
          '  id          String    @id @default(cuid())',
          '  name        String',
          '  description String?',
          '  price       Decimal   @db.Decimal(12, 2)',
          '  stock       Int',
          '  rating      Float?',
          '  active      Boolean',
          '  publishedAt DateTime?',
          '  createdAt   DateTime  @default(now())',
          '  updatedAt   DateTime  @updatedAt',
          '}',
        ].join('\n'),
      );
    });

    it('writes a migration that matches the model', async () => {
      const root = await makeProject();

      await generate(root);

      expect(
        await read(
          root,
          'prisma/migrations/20261118093000_create_products/migration.sql',
        ),
      ).toBe(
        [
          '-- CreateTable',
          'CREATE TABLE "Product" (',
          '    "id" TEXT NOT NULL,',
          '    "name" TEXT NOT NULL,',
          '    "description" TEXT,',
          '    "price" DECIMAL(12,2) NOT NULL,',
          '    "stock" INTEGER NOT NULL,',
          '    "rating" DOUBLE PRECISION,',
          '    "active" BOOLEAN NOT NULL,',
          '    "publishedAt" TIMESTAMP(3),',
          '    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,',
          '    "updatedAt" TIMESTAMP(3) NOT NULL,',
          '',
          '    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")',
          ');',
          '',
        ].join('\n'),
      );
    });

    it('sorts the migration after the existing ones', async () => {
      const root = await makeProject();

      const resource = await plan(root);

      expect(resource.migration! > '0001_init').toBe(true);
    });

    it('works for a resource with no fields', async () => {
      const root = await makeProject();

      await generate(root, 'tag', '');

      expect(await read(root, 'prisma/schema.prisma')).toContain(
        [
          'model Tag {',
          '  id        String   @id @default(cuid())',
          '  createdAt DateTime @default(now())',
          '  updatedAt DateTime @updatedAt',
          '}',
        ].join('\n'),
      );
    });
  });

  describe('generated code', () => {
    it('validates the create and update DTOs per field', async () => {
      const root = await makeProject({ swagger: false });

      await generate(root);

      const create = await read(root, 'src/modules/products/dto/create-product.dto.ts');
      expect(create).toContain('export class CreateProductDto');
      expect(create).toMatch(/@IsString\(\)\s+@IsNotEmpty\(\)\s+@MaxLength\(255\)\s+name!: string;/);
      expect(create).toMatch(/@IsOptional\(\)\s+@IsString\(\)\s+description\?: string;/);
      expect(create).toMatch(/@IsNumber\(\{ maxDecimalPlaces: 2 \}\)\s+price!: number;/);
      expect(create).toMatch(/@IsInt\(\)\s+stock!: number;/);
      expect(create).toMatch(/@IsOptional\(\)\s+@IsNumber\(\)\s+rating\?: number;/);
      expect(create).toMatch(/@IsBoolean\(\)\s+active!: boolean;/);
      expect(create).toMatch(/@IsOptional\(\)\s+@IsDateString\(\)\s+publishedAt\?: string;/);

      const update = await read(root, 'src/modules/products/dto/update-product.dto.ts');
      expect(update).toContain('export class UpdateProductDto');
      // Required columns may be omitted but never set to null; optional ones may be cleared.
      expect(update).toMatch(/@ValidateIf\(\(_, value\) => value !== undefined\)\s+@IsString\(\)\s+@IsNotEmpty\(\)\s+@MaxLength\(255\)\s+name\?: string;/);
      expect(update).toMatch(/@IsOptional\(\)\s+@IsString\(\)\s+description\?: string;/);
    });

    it('paginates the list endpoint', async () => {
      const root = await makeProject();

      await generate(root);

      const pagination = await read(root, 'src/common/pagination/pagination-query.dto.ts');
      expect(pagination).toContain('page = 1');
      expect(pagination).toContain('limit = 20');
      expect(pagination).toContain('@Max(100)');
      expect(await read(root, 'src/common/pagination/paginated.ts')).toContain(
        'totalPages',
      );
      const service = await read(root, 'src/modules/products/products.service.ts');
      expect(service).toContain('findAll(query: PaginationQueryDto)');
      expect(service).toContain('skip:');
      expect(service).toContain('take:');
      expect(service).toContain('$transaction');
      expect(await read(root, 'src/modules/products/products.controller.ts')).toContain(
        '@Query() query: PaginationQueryDto',
      );
    });

    it('exposes create, list, get, update and delete routes', async () => {
      const root = await makeProject();

      await generate(root);

      const controller = await read(root, 'src/modules/products/products.controller.ts');
      expect(controller).toContain("@Controller('products')");
      expect(controller).toMatch(/@Post\(\)/);
      expect(controller).toMatch(/@Get\(\)/);
      expect(controller).toMatch(/@Get\(':id'\)/);
      expect(controller).toMatch(/@Patch\(':id'\)/);
      expect(controller).toMatch(/@Delete\(':id'\)/);
      expect(controller).toMatch(/@HttpCode\(HttpStatus\.NO_CONTENT\)/);
    });

    it('adds Swagger decorators only when Swagger is enabled', async () => {
      const withSwagger = await makeProject({ swagger: true });
      await generate(withSwagger);

      const controller = await read(withSwagger, 'src/modules/products/products.controller.ts');
      expect(controller).toContain("@ApiTags('products')");
      expect(controller).toContain('@ApiOperation(');
      expect(controller).toContain('@ApiNotFoundResponse(');
      expect(controller).toContain('@ApiQuery(');
      const dto = await read(withSwagger, 'src/modules/products/dto/create-product.dto.ts');
      expect(dto).toContain("from '@nestjs/swagger'");
      expect(dto).toMatch(/@ApiProperty\(\)\s+@IsString/);
      expect(dto).toMatch(/@ApiPropertyOptional\(\)\s+@IsOptional/);

      const without = await mkdtemp(path.join(os.tmpdir(), 'ironveil-resource-noswagger-'));
      try {
        const result = await generateProject(
          resolveConfig({ projectName: 'plain-api', swagger: false }),
          without,
        );
        const resource = await plan(result.destination);
        for (const change of resource.changeSet.changes) {
          expect(change.after, change.path).not.toContain('@nestjs/swagger');
        }
      } finally {
        await rm(without, { recursive: true, force: true });
      }
    });

    it('marks the routes as bearer-protected in Swagger when JWT auth is on', async () => {
      const root = await makeProject({ auth: 'jwt', swagger: true });

      await generate(root);

      const controller = await read(root, 'src/modules/products/products.controller.ts');
      expect(controller).toContain('@ApiBearerAuth()');
    });

    it('makes the e2e test sign a real JWT only when JWT auth is on', async () => {
      const jwt = await makeProject({ auth: 'jwt' });
      await generate(jwt);
      const jwtE2e = await read(jwt, 'test/products.e2e-spec.ts');
      expect(jwtE2e).toContain('JwtService');
      expect(jwtE2e).toContain('Authorization');
      expect(jwtE2e).toContain('401');

      const plainRoot = await mkdtemp(path.join(os.tmpdir(), 'ironveil-resource-plain-'));
      try {
        const result = await generateProject(
          resolveConfig({ projectName: 'plain-api', auth: 'none' }),
          plainRoot,
        );
        const resource = await plan(result.destination);
        const e2e = resource.changeSet.changes.find(
          (change) => change.path === 'test/products.e2e-spec.ts',
        );
        expect(e2e?.after).not.toContain('JwtService');
        expect(e2e?.after).not.toContain('Authorization');
      } finally {
        await rm(plainRoot, { recursive: true, force: true });
      }
    });

    it('unit-tests the service against a mocked PrismaService', async () => {
      const root = await makeProject();

      await generate(root);

      const spec = await read(root, 'src/modules/products/products.service.spec.ts');
      expect(spec).toContain('PrismaService');
      expect(spec).toContain('NotFoundException');
      expect(spec).toContain('totalPages');
    });

    it.each([
      ['default', {}, FIELDS],
      ['jwt + swagger + redis', { auth: 'jwt', redis: true }, FIELDS],
      ['no swagger', { swagger: false }, FIELDS],
      ['no testing', { testing: false }, FIELDS],
      ['no fields', {}, ''],
      ['one required string', {}, 'title:string'],
    ] as const)(
      'every generated file is valid TypeScript (%s)',
      async (_label, overrides, fields) => {
        const root = await makeProject(overrides);

        const resource = await plan(root, 'blog-post', fields);

        for (const change of resource.changeSet.changes) {
          if (!change.path.endsWith('.ts')) {
            continue;
          }
          const { diagnostics } = ts.transpileModule(change.after, {
            reportDiagnostics: true,
            compilerOptions: { target: ts.ScriptTarget.ES2023 },
            fileName: change.path,
          });
          expect(
            diagnostics?.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')),
            change.path,
          ).toEqual([]);
        }
      },
    );
  });

  describe('shared pagination files', () => {
    it('are reused, not rewritten, by a second resource', async () => {
      const root = await makeProject();
      await generate(root, 'product', 'name:string');

      const second = await plan(root, 'category', 'name:string');

      expect(paths(second)).not.toContain('src/common/pagination/paginated.ts');
      expect(paths(second)).not.toContain('src/common/pagination/pagination-query.dto.ts');
      expect(paths(second)).toContain('src/modules/categories/categories.module.ts');
    });

    it('are left exactly as the user changed them', async () => {
      const root = await makeProject();
      await mkdir(path.join(root, 'src/common/pagination'), { recursive: true });
      await writeFile(
        path.join(root, 'src/common/pagination/pagination-query.dto.ts'),
        '// my own version\nexport class PaginationQueryDto { page = 1; limit = 50; }\n',
      );

      const resource = await plan(root);

      expect(paths(resource)).not.toContain('src/common/pagination/pagination-query.dto.ts');
    });

    it('generates two resources that register side by side', async () => {
      const root = await makeProject();

      await generate(root, 'product', 'name:string');
      await generate(root, 'category', 'name:string');

      const appModule = await read(root, 'src/app.module.ts');
      expect(appModule).toContain('ProductsModule');
      expect(appModule).toContain('CategoriesModule');
      const schema = await read(root, 'prisma/schema.prisma');
      expect(schema).toContain('model Product {');
      expect(schema).toContain('model Category {');
    });
  });

  describe('re-running and conflicts', () => {
    it('is a no-op when the resource was already generated', async () => {
      const root = await makeProject();
      await generate(root);

      const again = await plan(root, 'product', FIELDS, new Date('2027-01-01T00:00:00Z'));

      expect(again.alreadyGenerated).toBe(true);
      expect(again.changeSet.isEmpty).toBe(true);
      expect(again.migration).toBeNull();
    });

    it('refuses to overwrite a file the user has changed', async () => {
      const root = await makeProject();
      await generate(root);
      const servicePath = path.join(root, 'src/modules/products/products.service.ts');
      await writeFile(servicePath, `${await readFile(servicePath, 'utf8')}// mine\n`);

      const error = await plan(root).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(GenerateError);
      expect((error as Error).message).toContain('src/modules/products/products.service.ts');
      expect((error as Error).message).toMatch(/already exists|overwrite/i);
    });

    it('refuses when the Prisma model already exists but the module does not', async () => {
      const root = await makeProject();
      const schemaPath = path.join(root, 'prisma/schema.prisma');
      await writeFile(
        schemaPath,
        `${await readFile(schemaPath, 'utf8')}\nmodel Product {\n  id String @id\n}\n`,
      );

      await expect(plan(root)).rejects.toThrow(/model "Product".*already/i);
    });

    it('refuses a name that collides with the generated User model', async () => {
      const root = await makeProject();

      await expect(plan(root, 'user', 'name:string')).rejects.toThrow(
        /"User".*already/i,
      );
    });

    it('plans nothing on failure', async () => {
      const root = await makeProject();
      const before = await read(root, 'prisma/schema.prisma');

      await plan(root, 'user', 'name:string').catch(() => undefined);

      expect(await read(root, 'prisma/schema.prisma')).toBe(before);
    });

    it('rejects an invalid name before touching anything', async () => {
      const root = await makeProject();

      await expect(plan(root, '1bad', '')).rejects.toBeInstanceOf(GenerateError);
    });
  });

  describe('outside an Ironveil project', () => {
    it('fails with a ManifestError', async () => {
      await expect(plan(workspace)).rejects.toBeInstanceOf(ManifestError);
    });
  });
});
