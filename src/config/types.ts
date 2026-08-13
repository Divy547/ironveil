export type Database = 'postgres';

export type Orm = 'prisma';

export type Auth = 'none' | 'jwt';

export type PackageManager = 'npm';

export interface ForgeKitConfig {
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
}