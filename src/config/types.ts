export type Database = 'postgres';

export type Orm = 'prisma';

export type Auth = 'none' | 'jwt';

export type PackageManager = 'npm' | 'pnpm' | 'yarn';

/**
 * Which AI-agent files to generate:
 * - `none`: nothing
 * - `agents`: AGENTS.md and CLAUDE.md
 * - `all`: also Cursor rules and GitHub Copilot instructions
 */
export type Ai = 'none' | 'agents' | 'all';

export interface IronveilConfig {
  readonly projectName: string;
  readonly database: Database;
  readonly orm: Orm;
  readonly redis: boolean;
  readonly auth: Auth;
  readonly swagger: boolean;
  readonly docker: boolean;
  readonly ci: boolean;
  readonly testing: boolean;
  readonly packageManager: PackageManager;
  readonly ai: Ai;
}