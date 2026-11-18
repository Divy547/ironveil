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
    auth: shape.auth.removeDefault(),
    swagger: shape.swagger.removeDefault(),
    docker: shape.docker.removeDefault(),
    ci: shape.ci.removeDefault(),
    testing: shape.testing.removeDefault(),
    ai: shape.ai.removeDefault(),
  }),
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
