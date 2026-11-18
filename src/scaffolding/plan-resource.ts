import path from 'node:path';
import type { IronveilConfig } from '../config/index.js';
import {
  addModuleImport,
  appendPrismaModel,
  hasPrismaDefinition,
} from '../editing/index.js';
import {
  MANIFEST_FILE_NAME,
  manifestToConfig,
  readManifest,
  recordResourceInManifest,
} from '../manifest/index.js';
import { createChangeSet, type ChangeSet } from '../safety/index.js';
import { DEFAULT_AUTH_POLICY, type ResourceAuthPolicy } from './auth-policy.js';
import type { FieldSpec } from './fields.js';
import { GenerateError } from './generate-error.js';
import { deriveResourceNames, type ResourceNames } from './names.js';
import { buildController } from './resource/controller.js';
import { buildCreateDto, buildUpdateDto } from './resource/dto.js';
import { buildModule } from './resource/module.js';
import {
  PAGINATED_PATH,
  PAGINATION_QUERY_PATH,
  buildPaginated,
  buildPaginationQueryDto,
} from './resource/pagination.js';
import { buildMigrationSql, buildPrismaModel } from './resource/prisma.js';
import { buildService } from './resource/service.js';
import { buildE2eSpec, buildServiceSpec } from './resource/tests.js';

const SCHEMA_PATH = 'prisma/schema.prisma';
const APP_MODULE_PATH = 'src/app.module.ts';

export interface PlanResourceOptions {
  /** The Ironveil project root (the folder that holds `ironveil.json`). */
  readonly root: string;
  /** The resource name as typed: `product`, `blog-post`, `BlogPost`. Singular. */
  readonly name: string;
  readonly fields: readonly FieldSpec[];
  /** Who may call the routes; defaults to `user` (any valid token). */
  readonly auth?: ResourceAuthPolicy;
  /** Clock for the migration timestamp; tests pass a fixed date. */
  readonly now?: Date;
}

export interface ResourcePlan {
  /** Everything to write. Nothing is on disk until it is applied. */
  readonly changeSet: ChangeSet;
  readonly config: IronveilConfig;
  readonly names: ResourceNames;
  readonly fields: readonly FieldSpec[];
  readonly auth: ResourceAuthPolicy;
  /** Name of the new migration folder, or `null` when none is needed. */
  readonly migration: string | null;
  /** True when the resource's files already exist exactly as generated. */
  readonly alreadyGenerated: boolean;
}

interface PlannedFile {
  readonly path: string;
  readonly content: string;
}

/**
 * Plans `ironveil generate resource`: a feature module (module, controller,
 * service, DTOs, tests), the Prisma model plus a matching migration, the
 * shared pagination helpers, and the registration in `AppModule`.
 *
 * Reads the project (manifest, schema, existing files) but writes nothing:
 * the caller applies the returned change set (see `applyChanges`). It never
 * overwrites a file the user changed, and re-running for a resource that was
 * already generated plans no changes.
 */
export async function planResource(
  options: PlanResourceOptions,
): Promise<ResourcePlan> {
  const names = deriveResourceNames(options.name);
  const root = path.resolve(options.root);
  const config = manifestToConfig(await readManifest(root));
  const { fields } = options;
  const auth = options.auth ?? DEFAULT_AUTH_POLICY;

  if (auth !== DEFAULT_AUTH_POLICY && config.auth !== 'jwt') {
    throw new GenerateError(
      `Cannot use --auth ${auth}: this project has no JWT authentication, so there are no roles or tokens to check. ` +
        'Generate the resource without --auth, or add authentication to the project first.',
    );
  }

  const changeSet = createChangeSet(root);

  const moduleDirectory = `src/modules/${names.pluralKebab}`;
  const moduleFiles: PlannedFile[] = [
    {
      path: `${moduleDirectory}/${names.pluralKebab}.module.ts`,
      content: buildModule(names),
    },
    {
      path: `${moduleDirectory}/${names.pluralKebab}.controller.ts`,
      content: buildController(names, config, auth),
    },
    {
      path: `${moduleDirectory}/${names.pluralKebab}.service.ts`,
      content: buildService(names),
    },
    {
      path: `${moduleDirectory}/dto/create-${names.kebab}.dto.ts`,
      content: buildCreateDto(names, fields, config.swagger),
    },
    {
      path: `${moduleDirectory}/dto/update-${names.kebab}.dto.ts`,
      content: buildUpdateDto(names, fields, config.swagger),
    },
    ...(config.testing
      ? [
          {
            path: `${moduleDirectory}/${names.pluralKebab}.service.spec.ts`,
            content: buildServiceSpec(names, fields),
          },
          {
            path: `test/${names.pluralKebab}.e2e-spec.ts`,
            content: buildE2eSpec(names, fields, config, auth),
          },
        ]
      : []),
  ];

  const missing: PlannedFile[] = [];
  const conflicts: string[] = [];
  for (const file of moduleFiles) {
    const existing = await changeSet.read(file.path);
    if (existing === null) {
      missing.push(file);
    } else if (existing !== file.content) {
      conflicts.push(file.path);
    }
  }

  if (conflicts.length > 0) {
    throw new GenerateError(
      [
        `Cannot generate "${names.input}": these files already exist and differ from what would be generated.`,
        'Ironveil never overwrites your code.',
        ...conflicts.map((conflict) => `  ${conflict}`),
        '',
        'Move or delete them first, or pick another name.',
      ].join('\n'),
    );
  }

  // Missing files mean this is a first run. If every file is already there
  // (and identical) the resource exists: only re-check the registration.
  const firstRun = missing.length > 0;
  let migration: string | null = null;

  if (firstRun) {
    const schema = await changeSet.read(SCHEMA_PATH);
    if (schema === null) {
      throw new GenerateError(
        `Cannot generate "${names.input}": ${SCHEMA_PATH} was not found in ${root}.`,
      );
    }

    if (hasPrismaDefinition(schema, names.pascal)) {
      const kind = new RegExp(`^\\s*enum\\s+${names.pascal}\\b`, 'm').test(schema)
        ? 'enum'
        : 'model';
      throw new GenerateError(
        `Cannot generate "${names.input}": ${kind} "${names.pascal}" already exists in ${SCHEMA_PATH}. ` +
          'Pick another name, or remove the existing definition first.',
      );
    }

    for (const file of missing) {
      await changeSet.write(file.path, file.content);
    }

    await changeSet.edit(SCHEMA_PATH, (text) =>
      appendPrismaModel(text, buildPrismaModel(names, fields)),
    );

    await changeSet.edit(MANIFEST_FILE_NAME, (text) =>
      recordResourceInManifest(
        text,
        names.kebab,
        config.auth === 'jwt' ? { auth } : {},
      ),
    );

    migration = `${timestamp(options.now ?? new Date())}_create_${names.pluralSnake}`;
    await changeSet.write(
      `prisma/migrations/${migration}/migration.sql`,
      buildMigrationSql(names, fields),
    );

    // Shared by every resource: written once, then never touched, so a user
    // can customise them (or a second resource can reuse them) safely.
    const shared: PlannedFile[] = [
      { path: PAGINATION_QUERY_PATH, content: buildPaginationQueryDto() },
      { path: PAGINATED_PATH, content: buildPaginated() },
    ];
    for (const file of shared) {
      if ((await changeSet.read(file.path)) === null) {
        await changeSet.write(file.path, file.content);
      }
    }
  }

  await changeSet.edit(APP_MODULE_PATH, (text) =>
    addModuleImport(text, {
      moduleName: `${names.pluralPascal}Module`,
      importPath: `./modules/${names.pluralKebab}/${names.pluralKebab}.module`,
    }),
  );

  return {
    changeSet,
    config,
    names,
    fields,
    auth,
    migration,
    alreadyGenerated: !firstRun,
  };
}

// 2026-11-18T09:30:00Z -> 20261118093000, Prisma's migration folder prefix.
function timestamp(date: Date): string {
  return date.toISOString().replace(/\D/g, '').slice(0, 14);
}
