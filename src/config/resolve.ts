import { ZodError } from 'zod';
import {
  ForgeKitConfigSchema,
  type ForgeKitConfigInput,
} from './schema.js';
import type { ForgeKitConfig } from './types.js';

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function resolveConfig(
  input: ForgeKitConfigInput,
): ForgeKitConfig {
  try {
    const config = ForgeKitConfigSchema.parse(input);

    validateFeatureDependencies(config);

    return Object.freeze(config);
  } catch (error) {
    if (error instanceof ZodError) {
      const message = error.issues
        .map((issue) => {
          const path = issue.path.join('.') || 'configuration';

          return `${path}: ${issue.message}`;
        })
        .join('\n');

      throw new ConfigError(message);
    }

    throw error;
  }
}

function validateFeatureDependencies(
  config: ForgeKitConfig,
): void {
  if (config.auth === 'jwt') {
    if (
      config.database !== 'postgres' ||
      config.orm !== 'prisma'
    ) {
      throw new ConfigError(
        'JWT authentication requires PostgreSQL with Prisma.',
      );
    }
  }
}