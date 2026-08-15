import type { Auth, PackageManager } from '../../config/index.js';

export interface CreateCommandOptions {
  readonly packageManager?: PackageManager;
  readonly redis?: boolean;
  readonly auth?: Auth;
  readonly swagger?: boolean;
  readonly docker?: boolean;
  readonly ci?: boolean;
  readonly testing?: boolean;
  readonly yes?: boolean;
  readonly nonInteractive?: boolean;
  readonly dryRun?: boolean;
}