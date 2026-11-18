import { ZodError } from 'zod';
import {
  IronveilConfigSchema,
  type IronveilConfigInput,
} from './schema.js';
import type { IronveilConfig } from './types.js';

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function resolveConfig(
  input: IronveilConfigInput,
): IronveilConfig {
  try {
    const config = IronveilConfigSchema.parse(input);

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
  config: IronveilConfig,
): void {
  if (config.queue && !config.redis) {
    throw new ConfigError(
      'The queue requires Redis (BullMQ stores its jobs there). Enable Redis as well.',
    );
  }

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