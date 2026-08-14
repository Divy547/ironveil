import type { ForgeKitConfig } from '../config/index.js';

export interface TemplateRenderer {
  render(
    template: string,
    config: ForgeKitConfig,
  ): string;
}

export function createTemplateRenderer(): TemplateRenderer {
  return {
    render(template, config): string {
      const authModuleImport =
        config.auth === 'jwt'
          ? "import { AuthModule } from './modules/auth/auth.module';"
          : '';

      const authModule =
        config.auth === 'jwt'
          ? 'AuthModule,'
          : '';

      const swaggerImport =
        config.swagger
          ? "import { setupSwagger } from './infrastructure/swagger/swagger.setup';"
          : '';

      const swaggerSetup =
        config.swagger
          ? 'setupSwagger(app);'
          : '';

      const redisModuleImport =
        config.redis
          ? "import { RedisModule } from './redis/redis.module';"
          : '';

      const redisModule =
        config.redis
          ? 'RedisModule,'
          : '';

      const redisEnvExample =
        config.redis
          ? 'REDIS_URL="redis://localhost:6379"'
          : '';

      const redisConfigType =
        config.redis
          ? 'readonly redis: {\n    readonly url: string;\n  };'
          : '';

      const redisConfig =
        config.redis
          ? "redis: {\n      url:\n        process.env.REDIS_URL ?? 'redis://localhost:6379',\n    },"
          : '';

      const redisEnvSchema =
        config.redis
          ? "REDIS_URL: z\n    .string()\n    .min(1, 'REDIS_URL is required'),"
          : '';

      return template
        .replace(
          /\{\{\s*projectName\s*\}\}/g,
          config.projectName,
        )
        .replace(
          /\{\{\s*authModuleImport\s*\}\}/g,
          authModuleImport,
        )
        .replace(
          /\{\{\s*authModule\s*\}\}/g,
          authModule,
        )
        .replace(
          /\{\{\s*swaggerImport\s*\}\}/g,
          swaggerImport,
        )
        .replace(
          /\{\{\s*swaggerSetup\s*\}\}/g,
          swaggerSetup,
        )
        .replace(
          /\{\{\s*redisModuleImport\s*\}\}/g,
          redisModuleImport,
        )
        .replace(
          /\{\{\s*redisModule\s*\}\}/g,
          redisModule,
        )
        .replace(
          /\{\{\s*redisEnvExample\s*\}\}/g,
          redisEnvExample,
        )
        .replace(
          /\{\{\s*redisConfigType\s*\}\}/g,
          redisConfigType,
        )
        .replace(
          /\{\{\s*redisConfig\s*\}\}/g,
          redisConfig,
        )
        .replace(
          /\{\{\s*redisEnvSchema\s*\}\}/g,
          redisEnvSchema,
        );
    },
  };
}