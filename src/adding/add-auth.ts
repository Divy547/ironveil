import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { IronveilConfig } from '../config/index.js';
import {
  EditError,
  addModuleImport,
  appendPrismaEnum,
  appendPrismaModel,
  hasPrismaDefinition,
} from '../editing/index.js';
import { recordResourceInManifest, type IronveilManifest } from '../manifest/index.js';
import {
  MIGRATION_AUTH_ENUM,
  MIGRATION_AUTH_TABLES,
  PRISMA_AUTH_ENUM,
  PRISMA_AUTH_REFRESH_TOKEN_MODEL,
  PRISMA_AUTH_USER_FIELD_LINES,
} from '../rendering/auth-schema.js';
import type { ChangeSet } from '../safety/index.js';
import type { FieldSpec } from '../scaffolding/fields.js';
import { deriveResourceNames } from '../scaffolding/names.js';
import { buildController } from '../scaffolding/resource/controller.js';
import { buildE2eSpec } from '../scaffolding/resource/tests.js';
import { AddError } from './add-error.js';
import { inLineEndingOf, mergeText, sameText } from './merge-text.js';

export const SCHEMA_PATH = 'prisma/schema.prisma';

/**
 * The migration `create --auth jwt` folds the auth tables into. It has already
 * been applied by the time anyone adds auth, so `add auth` never touches it:
 * the schema change goes into a new migration instead.
 */
export const INIT_MIGRATION_PATH = 'prisma/migrations/0001_init/migration.sql';

const MIGRATIONS_DIRECTORY = 'prisma/migrations';
const MIGRATION_NAME = 'add_auth';

const USER_MODEL_HEAD = /^model\s+User\s*\{/;

// `add` cannot see the user's resources' fields (the manifest does not record
// them), and the lines that mention them are the same in the base and the
// target render. So both are rendered with one stand-in field, and the
// three-way merge against the file on disk carries the real fields across.
const STAND_IN_FIELDS: readonly FieldSpec[] = [
  { name: 'name', type: 'string', optional: false },
];

const lineBreakOf = (text: string): string => (text.includes('\r\n') ? '\r\n' : '\n');

/** The lines of `model User { ... }`, or `undefined` when there is none. */
function findUserModel(
  lines: readonly string[],
): { readonly start: number; readonly end: number } | undefined {
  const start = lines.findIndex((line) => USER_MODEL_HEAD.test(line.trimStart()));
  if (start === -1) return undefined;

  const end = lines.findIndex((line, index) => index > start && line.trim() === '}');
  return end === -1 ? undefined : { start, end };
}

/**
 * Things in the project that would make the additive migration fail or lie.
 * Ironveil cannot run Prisma, so this is the drift check it can do: the schema
 * and the migrations on disk must still look like the ones `create` wrote.
 */
export async function findAuthSchemaProblems(
  root: string,
  schema: string | null,
): Promise<string[]> {
  const problems: string[] = [];

  if (schema === null) {
    return [`${SCHEMA_PATH} was not found.`];
  }

  const lines = schema.split(/\r?\n/);
  const user = findUserModel(lines);

  if (user === undefined) {
    problems.push(
      `There is no \`model User\` in ${SCHEMA_PATH}, and auth stores its accounts in it.`,
    );
  } else {
    const fields = lines
      .slice(user.start + 1, user.end)
      .map((line) => line.trim().split(/\s+/)[0]);
    for (const field of ['role', 'refreshTokens']) {
      if (fields.includes(field)) {
        problems.push(
          `The \`${field}\` field already exists on model User, so auth cannot add its own.`,
        );
      }
    }
  }

  for (const name of ['Role', 'RefreshToken']) {
    if (hasPrismaDefinition(schema, name)) {
      problems.push(`${SCHEMA_PATH} already defines \`${name}\`, which auth needs to create.`);
    }
  }

  if (!(await migrationsCreateUserTable(root))) {
    problems.push(
      'No migration in prisma/migrations creates the "User" table, so the migration auth adds ' +
        '(it alters "User") would fail on a fresh database.',
    );
  }

  return problems;
}

async function listMigrationNames(root: string): Promise<string[]> {
  try {
    const entries = await readdir(path.join(root, MIGRATIONS_DIRECTORY), {
      withFileTypes: true,
    });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

async function migrationsCreateUserTable(root: string): Promise<boolean> {
  for (const name of await listMigrationNames(root)) {
    try {
      const sql = await readFile(
        path.join(root, MIGRATIONS_DIRECTORY, name, 'migration.sql'),
        'utf8',
      );
      if (/CREATE TABLE\s+"User"\s*\(/.test(sql)) return true;
    } catch {
      // A folder without a migration.sql is not a migration.
    }
  }
  return false;
}

/**
 * Adds auth to a `schema.prisma` the user has changed (for example, by
 * generating resources), so it no longer equals the one `create` writes:
 * the role and refresh-token fields go into `User`, the enum and model are
 * appended, and everything else stays as it is.
 */
export function addAuthToSchema(schema: string): string {
  const newline = lineBreakOf(schema);
  const lines = schema.split(/\r?\n/);
  const user = findUserModel(lines);

  if (user === undefined) {
    throw new AddError(`There is no \`model User\` in ${SCHEMA_PATH}.`);
  }

  lines.splice(user.end, 0, ...PRISMA_AUTH_USER_FIELD_LINES);

  return appendPrismaModel(
    appendPrismaEnum(lines.join(newline), PRISMA_AUTH_ENUM),
    PRISMA_AUTH_REFRESH_TOKEN_MODEL,
  );
}

const pad = (value: number, length = 2): string => String(value).padStart(length, '0');

const formatTimestamp = (date: Date): string =>
  `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
  `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;

function parseTimestamp(value: string): Date {
  return new Date(
    Date.UTC(
      Number(value.slice(0, 4)),
      Number(value.slice(4, 6)) - 1,
      Number(value.slice(6, 8)),
      Number(value.slice(8, 10)),
      Number(value.slice(10, 12)),
      Number(value.slice(12, 14)),
    ),
  );
}

/**
 * The folder name for the new migration. Prisma applies migrations in name
 * order, so it must sort after every existing one, even when the clock is
 * behind a timestamp already in the folder.
 */
export async function nextMigrationName(root: string, now: Date): Promise<string> {
  const latest = (await listMigrationNames(root))
    .map((name) => /^(\d{14})_/.exec(name)?.[1])
    .filter((stamp): stamp is string => stamp !== undefined)
    .sort()
    .at(-1);

  let stamp = formatTimestamp(now);
  if (latest !== undefined && stamp <= latest) {
    stamp = formatTimestamp(new Date(parseTimestamp(latest).getTime() + 1000));
  }

  return `${stamp}_${MIGRATION_NAME}`;
}

/** What `create --auth jwt` puts in `0001_init`, as a migration for an existing database. */
export function buildAuthMigrationSql(): string {
  return `${[
    MIGRATION_AUTH_ENUM,
    '-- AlterTable\nALTER TABLE "User" ADD COLUMN     "role" "Role" NOT NULL DEFAULT \'USER\';',
    MIGRATION_AUTH_TABLES,
  ].join('\n\n')}\n`;
}

/**
 * Brings the generated files of resources made before auth to what
 * `generate resource` writes on a project with auth, and records the `user`
 * policy for each (every route needs a token), which is what the global guard
 * enforces from now on. The two files that change are the controller (Swagger
 * bearer decorator) and the e2e spec, which must now sign in.
 *
 * These are the user's files, so an unmergeable one is left alone with a note
 * instead of blocking auth.
 */
export async function retrofitResources(
  changeSet: ChangeSet,
  manifest: IronveilManifest,
  before: IronveilConfig,
  after: IronveilConfig,
  notes: string[],
): Promise<void> {
  const resources = manifest.resources ?? {};

  for (const [key, entry] of Object.entries(resources)) {
    const names = deriveResourceNames(key);
    const directory = `src/modules/${names.pluralKebab}`;

    const files: Array<{ path: string; base: string; target: string }> = [
      {
        path: `${directory}/${names.pluralKebab}.controller.ts`,
        base: buildController(names, before, 'user'),
        target: buildController(names, after, 'user'),
      },
    ];
    if (after.testing) {
      files.push({
        path: `test/${names.pluralKebab}.e2e-spec.ts`,
        base: buildE2eSpec(names, STAND_IN_FIELDS, before, 'user'),
        target: buildE2eSpec(names, STAND_IN_FIELDS, after, 'user'),
      });
    }

    for (const file of files) {
      const current = await changeSet.read(file.path);

      // Deleted by the user; nothing to bring up to date.
      if (current === null || sameText(current, file.target)) continue;

      if (sameText(current, file.base)) {
        await changeSet.write(file.path, inLineEndingOf(file.target, current));
        continue;
      }

      const merged = mergeText(current, file.base, file.target);
      if (merged.merged) {
        await changeSet.write(file.path, merged.text);
      } else {
        notes.push(
          `${file.path} has edits of yours that overlap with what auth changes in it, so it was left as it is. ` +
            (file.path.startsWith('test/')
              ? 'Its tests send no token, so they get 401 until you add one (see a freshly generated resource spec).'
              : 'It still works; add @ApiBearerAuth() by hand if you use Swagger.'),
        );
      }
    }

    await changeSet.edit('ironveil.json', (text) =>
      recordResourceInManifest(text, key, { ...entry, auth: 'user' }),
    );
  }
}

const APP_MODULE_PATH = 'src/app.module.ts';

/**
 * Files an edited project gets auth through a named edit instead of a line
 * merge. `schema.prisma` and `AppModule` are the files `generate resource`
 * appends to, in the very place auth appends to as well, so a line merge sees
 * a conflict where there is none.
 */
const STRUCTURED_EDITS = new Map<string, (current: string) => string>([
  [SCHEMA_PATH, addAuthToSchema],
  [
    APP_MODULE_PATH,
    (current) =>
      addModuleImport(current, {
        moduleName: 'AuthModule',
        importPath: './modules/auth/auth.module',
      }),
  ],
]);

/**
 * The named edit auth makes to `file`, applied to `current`: the new text, or
 * a reason it cannot be made. `undefined` when `file` has no named edit (it is
 * merged as text).
 */
export function applyAuthEdit(
  file: string,
  current: string,
): { readonly text: string } | { readonly problem: string } | undefined {
  const edit = STRUCTURED_EDITS.get(file);
  if (edit === undefined) return undefined;

  try {
    return { text: edit(current) };
  } catch (error) {
    if (error instanceof EditError || error instanceof AddError) {
      return { problem: error.message };
    }
    throw error;
  }
}
