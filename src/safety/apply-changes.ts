import type { ChangeSet } from './change-set.js';
import { assertSafeToModify } from './git-state.js';

export interface ApplyOptions {
  /** Show what would change, write nothing. Never needs a clean git tree. */
  readonly dryRun?: boolean;
  /** Write even though the git working tree has uncommitted changes. */
  readonly force?: boolean;
}

export interface ApplyResult {
  /** True only when files were actually written. */
  readonly applied: boolean;
  readonly dryRun: boolean;
  /** Paths (relative to the project root) that were, or would be, written. */
  readonly files: readonly string[];
  /** Unified diff of the planned changes; empty when there are none. */
  readonly diff: string;
}

/**
 * The one place every project-editing command ends: dry-run prints the diff
 * and stops, a real run first requires a clean git tree (or `--force`) and
 * then writes everything or nothing.
 */
export async function applyChanges(
  changeSet: ChangeSet,
  options: ApplyOptions = {},
): Promise<ApplyResult> {
  const dryRun = options.dryRun === true;
  const files = changeSet.changes.map((change) => change.path);

  if (files.length === 0) {
    return { applied: false, dryRun, files: [], diff: '' };
  }

  const diff = changeSet.renderDiff();

  if (dryRun) {
    return { applied: false, dryRun: true, files, diff };
  }

  await assertSafeToModify(changeSet.root, { force: options.force === true });
  await changeSet.apply();

  return { applied: true, dryRun: false, files, diff };
}
