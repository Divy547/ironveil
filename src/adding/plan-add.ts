import path from 'node:path';
import type { IronveilConfig } from '../config/index.js';
import {
  MANIFEST_FILE_NAME,
  manifestToConfig,
  readManifest,
  setFeatureInManifest,
} from '../manifest/index.js';
import { createChangeSet, type ChangeSet } from '../safety/index.js';
import { IRONVEIL_VERSION } from '../version.js';
import {
  INIT_MIGRATION_PATH,
  SCHEMA_PATH,
  applyAuthEdit,
  buildAuthMigrationSql,
  findAuthSchemaProblems,
  nextMigrationName,
  retrofitResources,
} from './add-auth.js';
import { AddError } from './add-error.js';
import { describeFeatureChange, type AddableFeature } from './features.js';
import { mergePackageJson } from './merge-package-json.js';
import { inLineEndingOf, mergeText, sameText } from './merge-text.js';
import { renderProject } from './render-project.js';

const PACKAGE_JSON = 'package.json';

// Generated documentation: when the user has rewritten it, leave it and say
// so, rather than refusing to add the feature over a README.
const SOFT_FILES = new Set(['README.md', 'AGENTS.md']);

export interface PlanAddOptions {
  /** The Ironveil project root (the folder that holds `ironveil.json`). */
  readonly root: string;
  /** `ci`, `ai`, `docker` or `testing`. */
  readonly feature: string;
  /** Only `ai` takes one: `agents` (default) or `all`. */
  readonly mode?: string;
  /** Clock for the migration timestamp (`auth`); tests pass a fixed date. */
  readonly now?: Date;
}

export interface AddPlan {
  /** Everything to write. Nothing is on disk until it is applied. */
  readonly changeSet: ChangeSet;
  readonly feature: AddableFeature;
  readonly before: IronveilConfig;
  readonly after: IronveilConfig;
  /** True when the project already has the feature; the change set is empty. */
  readonly alreadyEnabled: boolean;
  /** True when `package.json` changes, so the user must install. */
  readonly dependenciesChanged: boolean;
  /** Name of the migration folder the feature adds (`auth`), if any. */
  readonly migration: string | null;
  /** Things the user should know: skipped files, a version mismatch. */
  readonly notes: readonly string[];
}

/**
 * Plans `ironveil add <feature>`.
 *
 * The project is rendered twice with the existing generators: as it is now
 * (the manifest's config, the *base*) and with the feature added (the
 * *target*). Each file the feature changes is then brought to the target:
 *
 * - equal to the base (the user never touched it): replaced by the target;
 * - edited by the user: three-way merged, so their edits stay;
 * - a file the feature creates that already exists with other content: a
 *   conflict, never overwritten;
 * - `package.json` is merged as JSON, `ironveil.json` gets the one feature
 *   flipped (so recorded resources survive).
 *
 * Any conflict aborts the whole plan: nothing is written. Like `planResource`,
 * it only reads the project.
 */
export async function planAdd(options: PlanAddOptions): Promise<AddPlan> {
  const root = path.resolve(options.root);
  const manifest = await readManifest(root);
  const before = manifestToConfig(manifest);
  const change = describeFeatureChange(before, options.feature, options.mode);
  const changeSet = createChangeSet(root);

  const plan = (extra: Partial<AddPlan> = {}): AddPlan => ({
    changeSet,
    feature: change.feature,
    before,
    after: change.after,
    alreadyEnabled: false,
    dependenciesChanged: false,
    migration: null,
    notes: [],
    ...extra,
  });

  if (change.alreadyEnabled) {
    return plan({ alreadyEnabled: true });
  }

  const notes: string[] = [];
  if (manifest.ironveilVersion !== IRONVEIL_VERSION) {
    notes.push(
      `This project was created with Ironveil ${manifest.ironveilVersion}, and ${IRONVEIL_VERSION} is adding the feature, ` +
        'so the generated code may differ from the rest of the project. Check the changes before you commit them.',
    );
  }

  const resources = Object.keys(manifest.resources ?? {});
  if (change.feature === 'swagger' && resources.length > 0) {
    notes.push(
      `Resources generated earlier (${resources.join(', ')}) have no Swagger decorators, ` +
        'so they show up in /api/docs without descriptions. Add @ApiTags / @ApiProperty by hand, or regenerate them.',
    );
  }

  const isAuth = change.feature === 'auth';
  if (isAuth) {
    const problems = await findAuthSchemaProblems(root, await changeSet.read(SCHEMA_PATH));
    if (problems.length > 0) {
      throw new AddError(
        [
          'Cannot add auth: the database setup is not what auth builds on.',
          ...problems.map((problem) => `  - ${problem}`),
          '',
          'Ironveil never edits migrations that may already have run, so nothing was written. ' +
            'Fix these first (or add auth by hand).',
        ].join('\n'),
      );
    }
  }

  const baseFiles = await renderProject(before);
  const targetFiles = await renderProject(change.after);
  const conflicts: string[] = [];

  for (const [file, wanted] of [...targetFiles].sort(([a], [b]) => a.localeCompare(b))) {
    const original = baseFiles.get(file);

    // ironveil.json is edited below; unchanged files are not this feature's.
    if (file === MANIFEST_FILE_NAME || wanted === original) continue;

    // Auth's tables go into a new migration (below), never into the applied one.
    if (isAuth && file === INIT_MIGRATION_PATH) continue;

    const current = await changeSet.read(file);

    if (current === null) {
      if (original === undefined) {
        await changeSet.write(file, wanted);
      } else {
        notes.push(
          `${file} was not found (deleted?), so the changes this feature makes to it were skipped.`,
        );
      }
      continue;
    }

    if (original === undefined) {
      if (!sameText(current, wanted)) {
        conflicts.push(`${file}  (already exists with different content)`);
      }
      continue;
    }

    if (sameText(current, original)) {
      await changeSet.write(file, inLineEndingOf(wanted, current));
      continue;
    }

    if (sameText(current, wanted)) continue;

    // Resources append to these in the same place auth does, which a line
    // merge reports as a conflict, so auth edits them by name instead.
    const edit = isAuth ? applyAuthEdit(file, current) : undefined;
    if (edit !== undefined) {
      if ('text' in edit) {
        await changeSet.write(file, edit.text);
      } else {
        conflicts.push(`${file}  (${edit.problem})`);
      }
      continue;
    }

    if (file === PACKAGE_JSON) {
      const merged = mergePackageJson(current, original, wanted);
      if (merged.merged) {
        await changeSet.write(file, merged.text);
      } else {
        conflicts.push(`${file}  (${merged.conflicts.join(', ')})`);
      }
      continue;
    }

    const merged = mergeText(current, original, wanted);
    if (merged.merged) {
      await changeSet.write(file, merged.text);
    } else if (SOFT_FILES.has(file)) {
      notes.push(
        `${file} has edits of yours that overlap with what this feature adds to it, so it was left as it is.`,
      );
    } else {
      conflicts.push(
        `${file}  (conflicting edit in ${merged.conflicts} place${merged.conflicts === 1 ? '' : 's'})`,
      );
    }
  }

  if (conflicts.length > 0) {
    throw new AddError(
      [
        `Cannot add ${change.feature}: these files have changes of yours that conflict with it, or already exist with different content.`,
        'Ironveil never overwrites your code, so nothing was written.',
        ...conflicts.map((conflict) => `  ${conflict}`),
        '',
        'Resolve them first (move the file, or undo your edit), or make the change by hand.',
      ].join('\n'),
    );
  }

  let migration: string | null = null;
  if (isAuth) {
    migration = await nextMigrationName(root, options.now ?? new Date());
    await changeSet.write(
      `prisma/migrations/${migration}/migration.sql`,
      buildAuthMigrationSql(),
    );

    await retrofitResources(changeSet, manifest, before, change.after, notes);

    notes.push(
      'Auth protects every route unless it is marked @Public(), so controllers you wrote by hand now need a token too. ' +
        'Existing users get the USER role; promote an admin with SQL (UPDATE "User" SET role = \'ADMIN\' WHERE email = \'...\').',
    );
    if (resources.length > 0) {
      notes.push(
        `Resources generated earlier (${resources.join(', ')}) now require a token on every route (the \`user\` policy), ` +
          'and their e2e specs were updated to send one. Add @Public() or @Roles(Role.ADMIN) to a route to change who may call it.',
      );
    }
  }

  await changeSet.edit(MANIFEST_FILE_NAME, (text) =>
    setFeatureInManifest(text, change.feature, change.value),
  );

  return plan({
    migration,
    dependenciesChanged: changeSet.changes.some(
      (changed) => changed.path === PACKAGE_JSON,
    ),
    notes,
  });
}
