export {
  ForgeKitConfigSchema,
  type ForgeKitConfigInput,
  type ForgeKitConfigOutput,
} from './schema.js';

export {
  ConfigError,
  resolveConfig,
} from './resolve.js';

export type {
  Auth,
  Database,
  ForgeKitConfig,
  Orm,
  PackageManager,
} from './types.js';