import type { Ai, Auth, PackageManager } from '../../config/index.js';

export interface CreateCommandOptions {
  readonly packageManager?: PackageManager;
  readonly redis?: boolean;
  readonly auth?: Auth;
  readonly ai?: Ai;
  readonly swagger?: boolean;
  readonly docker?: boolean;
  readonly ci?: boolean;
  readonly testing?: boolean;
  readonly yes?: boolean;
  readonly nonInteractive?: boolean;
  readonly dryRun?: boolean;
}