export {
  IronveilConfigSchema,
  type IronveilConfigInput,
  type IronveilConfigOutput,
} from './schema.js';

export {
  ConfigError,
  resolveConfig,
} from './resolve.js';

export type {
  Ai,
  Auth,
  Database,
  IronveilConfig,
  Orm,
  PackageManager,
} from './types.js';

export {
  IRONVEIL_VERSIONS,
  type IronveilVersions,
} from './versions.js';