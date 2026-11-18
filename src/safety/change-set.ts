import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { EditError } from '../editing/edit-error.js';
import { SafetyError } from './safety-error.js';
import { unifiedDiff } from './unified-diff.js';

export interface PlannedChange {
  /** Relative to the project root, always with forward slashes. */
  readonly path: string;
  readonly kind: 'create' | 'modify';
  /** The content on disk right now; `null` for a file that does not exist. */
  readonly before: string | null;
  readonly after: string;
}

interface PlannedEntry {
  readonly before: string | null;
  after: string;
}

/**
 * A batch of file writes planned in memory against a project directory.
 *
 * Nothing touches the disk until `apply()`, which is what lets a command show
 * `--dry-run` output, refuse to run on a dirty git tree, and roll back if a
 * write fails halfway. The editors in `src/editing` plug in through `edit()`
 * (string in, string out), and several edits to one file compose because each
 * one reads the previously planned text, not the disk.
 */
export interface ChangeSet {
  readonly root: string;
  /** Files whose planned content differs from disk, in the order first planned. */
  readonly changes: readonly PlannedChange[];
  readonly isEmpty: boolean;
  /** The file's current content (planned if planned, else on disk); `null` if it does not exist. */
  read(relativePath: string): Promise<string | null>;
  /** Plans the full content of a file (creating it, or replacing it). */
  write(relativePath: string, content: string): Promise<void>;
  /** Plans a transformation of the file's current (possibly planned) content. */
  edit(
    relativePath: string,
    transform: (current: string) => string,
  ): Promise<void>;
  /** The planned changes as one unified diff; empty when there are none. */
  renderDiff(): string;
  /** Writes every change. All or nothing: a failure restores what was written. */
  apply(): Promise<string[]>;
}

export function createChangeSet(root: string): ChangeSet {
  const projectRoot = path.resolve(root);
  const planned = new Map<string, PlannedEntry>();

  async function readFromDisk(relativePath: string): Promise<string | null> {
    try {
      return await readFile(path.join(projectRoot, relativePath), 'utf8');
    } catch (error) {
      if (isMissingFile(error)) {
        return null;
      }
      throw error;
    }
  }

  async function current(relativePath: string): Promise<string | null> {
    const entry = planned.get(relativePath);
    return entry !== undefined ? entry.after : readFromDisk(relativePath);
  }

  function changedEntries(): PlannedChange[] {
    const result: PlannedChange[] = [];
    for (const [relativePath, entry] of planned) {
      if (entry.after !== entry.before) {
        result.push({
          path: relativePath,
          kind: entry.before === null ? 'create' : 'modify',
          before: entry.before,
          after: entry.after,
        });
      }
    }
    return result;
  }

  async function write(relativePath: string, content: string): Promise<void> {
    const normalized = normalizeRelativePath(relativePath);
    const entry = planned.get(normalized);

    if (entry !== undefined) {
      entry.after = content;
      return;
    }

    planned.set(normalized, {
      before: await readFromDisk(normalized),
      after: content,
    });
  }

  return {
    root: projectRoot,

    get changes() {
      return changedEntries();
    },

    get isEmpty() {
      return changedEntries().length === 0;
    },

    write,

    async read(relativePath) {
      return current(normalizeRelativePath(relativePath));
    },

    async edit(relativePath, transform) {
      const normalized = normalizeRelativePath(relativePath);
      const text = await current(normalized);

      if (text === null) {
        throw new EditError(
          `Cannot edit ${normalized}: the file does not exist in ${projectRoot}.`,
        );
      }

      await write(normalized, transform(text));
    },

    renderDiff() {
      return changedEntries()
        .map((change) => unifiedDiff(change.path, change.before, change.after))
        .join('');
    },

    async apply() {
      const changes = changedEntries();
      const done: Array<{
        readonly change: PlannedChange;
        readonly createdDirectory: string | undefined;
      }> = [];

      try {
        for (const change of changes) {
          const target = path.join(projectRoot, change.path);
          const createdDirectory = await mkdir(path.dirname(target), {
            recursive: true,
          });
          await writeFile(target, change.after, 'utf8');
          done.push({ change, createdDirectory });
        }
      } catch (error) {
        await rollBack(projectRoot, done);
        throw error;
      }

      return changes.map((change) => change.path);
    },
  };
}

// Best effort: put every file back as it was (or remove what we created, plus
// the directories we had to create for it), newest first.
async function rollBack(
  projectRoot: string,
  done: ReadonlyArray<{
    readonly change: PlannedChange;
    readonly createdDirectory: string | undefined;
  }>,
): Promise<void> {
  for (const { change, createdDirectory } of [...done].reverse()) {
    const target = path.join(projectRoot, change.path);
    try {
      if (change.before === null) {
        await rm(target, { force: true });
      } else {
        await writeFile(target, change.before, 'utf8');
      }
      if (createdDirectory !== undefined) {
        await rm(createdDirectory, { recursive: true, force: true });
      }
    } catch {
      // Keep restoring the remaining files; the original error is what matters.
    }
  }
}

function normalizeRelativePath(input: string): string {
  const forwardSlashes = input.replace(/\\/g, '/');
  const normalized = path.posix.normalize(forwardSlashes);

  if (
    input.trim() === '' ||
    path.posix.isAbsolute(forwardSlashes) ||
    path.win32.isAbsolute(input) ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.endsWith('/')
  ) {
    throw new SafetyError(
      `Refusing to write "${input}": it is not a file path inside the project.`,
    );
  }

  return normalized;
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    // ENOTDIR: a parent "directory" is really a file, so this path cannot
    // exist. Planning it is fine; the write itself then fails and rolls back.
    (error.code === 'ENOENT' || error.code === 'ENOTDIR')
  );
}
