export {
  applyChanges,
  type ApplyOptions,
  type ApplyResult,
} from './apply-changes.js';
export {
  createChangeSet,
  type ChangeSet,
  type PlannedChange,
} from './change-set.js';
export {
  DirtyWorkingTreeError,
  assertSafeToModify,
  getGitStatus,
  type GitStatus,
} from './git-state.js';
export { addSafetyOptions, type SafetyOptions } from './options.js';
export { SafetyError } from './safety-error.js';
export { unifiedDiff } from './unified-diff.js';
