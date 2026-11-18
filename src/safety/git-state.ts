import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { SafetyError } from './safety-error.js';

const execFileAsync = promisify(execFile);

/** How many dirty files the error message lists before saying "and N more". */
const MAX_LISTED_FILES = 10;

export interface GitStatus {
  /** False when `directory` is not inside a git work tree (or git is missing). */
  readonly isRepository: boolean;
  /** True when nothing under `directory` is modified, staged or untracked. */
  readonly isClean: boolean;
  /** Paths relative to the repository root, as git reports them. */
  readonly dirtyFiles: readonly string[];
}

export class DirtyWorkingTreeError extends SafetyError {
  readonly dirtyFiles: readonly string[];

  constructor(dirtyFiles: readonly string[]) {
    const listed = dirtyFiles
      .slice(0, MAX_LISTED_FILES)
      .map((file) => `  ${file}`);
    const hidden = dirtyFiles.length - listed.length;
    if (hidden > 0) {
      listed.push(`  ...and ${hidden} more`);
    }

    super(
      [
        'The git working tree has uncommitted changes:',
        ...listed,
        '',
        'Commit or stash them first so Ironveil\'s changes are easy to review and undo, or pass --force to continue anyway.',
      ].join('\n'),
    );
    this.name = 'DirtyWorkingTreeError';
    this.dirtyFiles = dirtyFiles;
  }
}

/**
 * Reads `git status` for `directory` only (a project can live in a
 * subdirectory of a bigger repository, and unrelated dirt elsewhere is none of
 * our business). Ignored files are not reported. A directory outside any
 * repository, or a machine without git, counts as "not a repository" rather
 * than an error: there is nothing git could protect.
 */
export async function getGitStatus(directory: string): Promise<GitStatus> {
  let output: string;
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['status', '--porcelain=v1', '-z', '--', '.'],
      { cwd: directory, maxBuffer: 64 * 1024 * 1024 },
    );
    output = stdout;
  } catch {
    return { isRepository: false, isClean: true, dirtyFiles: [] };
  }

  const dirtyFiles = parsePorcelainZ(output);

  return {
    isRepository: true,
    isClean: dirtyFiles.length === 0,
    dirtyFiles,
  };
}

/**
 * Refuses to continue when `directory` has uncommitted work, unless `force`.
 * Call it before planning writes that cannot be undone with `git checkout`.
 */
export async function assertSafeToModify(
  directory: string,
  options: { readonly force?: boolean } = {},
): Promise<void> {
  if (options.force) {
    return;
  }

  const status = await getGitStatus(directory);
  if (!status.isClean) {
    throw new DirtyWorkingTreeError(status.dirtyFiles);
  }
}

// `-z` output is `XY path\0`, and renames/copies add the original path as an
// extra entry (`R  new\0old\0`), which we skip: only the current path matters.
function parsePorcelainZ(output: string): string[] {
  const entries = output.split('\0');
  const files: string[] = [];

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry === undefined || entry.length < 4) {
      continue;
    }

    files.push(entry.slice(3));

    const status = entry.slice(0, 2);
    if (status.includes('R') || status.includes('C')) {
      index += 1;
    }
  }

  return files;
}
