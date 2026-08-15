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

export {
  FORGEKIT_VERSIONS,
  type ForgeKitVersions,
} from './versions.js';