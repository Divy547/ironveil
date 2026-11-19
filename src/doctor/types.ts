export type Severity = 'error' | 'warning' | 'note';

export type CheckName =
  | 'env'
  | 'modules'
  | 'files'
  | 'dependencies'
  | 'version';

export interface Finding {
  readonly check: CheckName;
  /**
   * `error`: the project will not build or boot. `warning`: probably wrong,
   * but it may be deliberate. `note`: information only.
   */
  readonly severity: Severity;
  readonly message: string;
  /** What to do about it, when there is something concrete to do. */
  readonly fix?: string;
}

export interface DoctorReport {
  readonly root: string;
  readonly projectName: string;
  /** The Ironveil version recorded in `ironveil.json` (what created the project). */
  readonly ironveilVersion: string;
  readonly findings: readonly Finding[];
  /** True when there are no errors; warnings and notes do not fail a project. */
  readonly ok: boolean;
}
