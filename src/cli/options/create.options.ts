import type { Auth } from '../../config/index.js';

export interface CreateCommandOptions {
  readonly redis?: boolean;
  readonly auth?: Auth;
  readonly swagger?: boolean;
  readonly docker?: boolean;
  readonly ci?: boolean;
  readonly testing?: boolean;
}