import path from 'node:path';
import { z } from 'zod';
import {
  ConfigError,
  IronveilConfigSchema,
  resolveConfig,
  type IronveilConfig,
} from '../config/index.js';
import { createFileSystem, type FileSystem } from '../utils/filesystem.js';

export const MANIFEST_FILE_NAME = 'ironveil.json';

/**
 * Bumped only when the manifest layout changes in a way an older CLI cannot
 * read. Adding optional keys does not need a bump: unknown keys are ignored.
 */
export const MANIFEST_VERSION = 1;

/**
 * Who may call a generated resource's routes (`ironveil generate resource
 * --auth`). Defined here because the manifest records it; the generator
 * imports it from this module.
 */
export const RESOURCE_AUTH_POLICIES = [
  'user',
  'admin-writes',
  'public-read',
  'admin',
] as const;

export type ResourceAuthPolicy = (typeof RESOURCE_AUTH_POLICIES)[number];

const ResourceEntrySchema = z.object({
  // Absent when the project has no JWT auth: there is nothing to choose then.
  auth: z.enum(RESOURCE_AUTH_POLICIES).optional(),
});

export type ManifestResource = z.output<typeof ResourceEntrySchema>;

export class ManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManifestError';
  }
}

// Reuse the config schema's own field definitions (minus their defaults) so
// the manifest can never accept a value `create` would reject. Every field is
// required: a manifest is a record, not an input with defaults.
const shape = IronveilConfigSchema.shape;

const ManifestSchema = z.object({
  manifestVersion: z.number().int().min(1),
  ironveilVersion: z.string().min(1),
  projectName: shape.projectName,
  packageManager: shape.packageManager.removeDefault(),
  database: shape.database.removeDefault(),
  orm: shape.orm.removeDefault(),
  features: z.object({
    redis: shape.redis.removeDefault(),
    // Added after manifests already existed, so a manifest without it is
    // valid and means "off" (the feature could not have been enabled).
    queue: shape.queue.removeDefault().default(false),
    // Same for mail: absent in older manifests, which means "off".
    mail: shape.mail.removeDefault().default(false),
    auth: shape.auth.removeDefault(),
    swagger: shape.swagger.removeDefault(),
    docker: shape.docker.removeDefault(),
    ci: shape.ci.removeDefault(),
    testing: shape.testing.removeDefault(),
    ai: shape.ai.removeDefault(),
  }),
  // Added by `generate resource`, keyed by the singular kebab-case name.
  resources: z.record(z.string(), ResourceEntrySchema).optional(),
});

export type IronveilManifest = z.output<typeof ManifestSchema>;

export function buildManifest(
  config: IronveilConfig,
  ironveilVersion: string,
): IronveilManifest {
  return {
    manifestVersion: MANIFEST_VERSION,
    ironveilVersion,
    projectName: config.projectName,
    packageManager: config.packageManager,
    database: config.database,
    orm: config.orm,
    features: {
      redis: config.redis,
      queue: config.queue,
      mail: config.mail,
      auth: config.auth,
      swagger: config.swagger,
      docker: config.docker,
      ci: config.ci,
      testing: config.testing,
      ai: config.ai,
    },
  };
}

export function serializeManifest(manifest: IronveilManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function parseManifest(text: string): IronveilManifest {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new ManifestError(
      `${MANIFEST_FILE_NAME} is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ManifestError(`${MANIFEST_FILE_NAME} must contain a JSON object`);
  }

  // Check the version first: a newer layout may not match the schema below,
  // and "upgrade Ironveil" is a better message than a list of field errors.
  const declared = (raw as { manifestVersion?: unknown }).manifestVersion;
  if (typeof declared === 'number' && declared > MANIFEST_VERSION) {
    throw new ManifestError(
      `${MANIFEST_FILE_NAME} was written by a newer version of Ironveil ` +
        `(manifest version ${declared}, this CLI understands up to ${MANIFEST_VERSION}). ` +
        'Upgrade Ironveil and try again.',
    );
  }

  const result = ManifestSchema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'manifest'}: ${issue.message}`)
      .join('\n');
    throw new ManifestError(`Invalid ${MANIFEST_FILE_NAME}:\n${problems}`);
  }

  return result.data;
}

/**
 * Returns `text` (the contents of `ironveil.json`) with `entry` recorded under
 * `resources[name]`, replacing an earlier entry of the same name.
 *
 * Works on the raw JSON rather than the parsed manifest so keys this version
 * does not know about (written by a newer Ironveil) survive the rewrite.
 */
export function recordResourceInManifest(
  text: string,
  name: string,
  entry: ManifestResource,
): string {
  parseManifest(text);

  const raw = JSON.parse(text) as Record<string, unknown>;
  const resources = (raw.resources ?? {}) as Record<string, unknown>;
  raw.resources = { ...resources, [name]: entry };

  return `${JSON.stringify(raw, null, 2)}\n`;
}

export type ManifestFeature = keyof IronveilManifest['features'];

/**
 * Returns `text` (the contents of `ironveil.json`) with one feature set to
 * `value`. Like `recordResourceInManifest` it edits the raw JSON, so the
 * recorded resources and keys from a newer Ironveil survive, and it leaves
 * `ironveilVersion` alone: that records what created the project.
 */
export function setFeatureInManifest(
  text: string,
  feature: ManifestFeature,
  value: boolean | string,
): string {
  parseManifest(text);

  const raw = JSON.parse(text) as { features: Record<string, unknown> };

  // Check the schema, not the file: a manifest written before a feature
  // existed has no key for it yet, and adding that feature must still work.
  if (!Object.hasOwn(ManifestSchema.shape.features.shape, feature)) {
    throw new ManifestError(`Unknown feature "${feature}" in ${MANIFEST_FILE_NAME}.`);
  }

  raw.features[feature] = value;
  const result = `${JSON.stringify(raw, null, 2)}\n`;

  // Rejects a value the schema would not accept, e.g. ai: "everything".
  parseManifest(result);

  return result;
}

export function manifestToConfig(manifest: IronveilManifest): IronveilConfig {
  try {
    return resolveConfig({
      projectName: manifest.projectName,
      packageManager: manifest.packageManager,
      database: manifest.database,
      orm: manifest.orm,
      ...manifest.features,
    });
  } catch (error) {
    if (error instanceof ConfigError) {
      throw new ManifestError(
        `Invalid ${MANIFEST_FILE_NAME}:\n${error.message}`,
      );
    }
    throw error;
  }
}

export async function readManifest(
  projectDirectory: string,
  fs: FileSystem = createFileSystem(),
): Promise<IronveilManifest> {
  const manifestPath = path.join(projectDirectory, MANIFEST_FILE_NAME);

  if (!(await fs.exists(manifestPath))) {
    throw new ManifestError(
      `${projectDirectory} is not an Ironveil project: ${MANIFEST_FILE_NAME} was not found. ` +
        'Run this command from the root of a project created with `ironveil create`.',
    );
  }

  try {
    return parseManifest(await fs.readFile(manifestPath));
  } catch (error) {
    if (error instanceof ManifestError) {
      throw new ManifestError(`${manifestPath}: ${error.message}`);
    }
    throw error;
  }
}


/**
 * Finds the Ironveil project that contains `startDirectory`: the nearest
 * directory, going upwards, that holds `ironveil.json`. Lets commands work
 * from `src/modules/...` as well as from the project root.
 */
export async function findProjectRoot(
  startDirectory: string,
  fs: FileSystem = createFileSystem(),
): Promise<string> {
  const start = path.resolve(startDirectory);
  let directory = start;

  for (;;) {
    if (await fs.exists(path.join(directory, MANIFEST_FILE_NAME))) {
      return directory;
    }

    const parent = path.dirname(directory);
    if (parent === directory) {
      throw new ManifestError(
        `${start} is not inside an Ironveil project: no ${MANIFEST_FILE_NAME} found in it or any parent directory. ` +
          'Run this command inside a project created with `ironveil create`.',
      );
    }
    directory = parent;
  }
}
