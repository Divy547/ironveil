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

      const hasPrisma =
        config.database === 'postgres' &&
        config.orm === 'prisma';

      // ── Docker: API environment variables ──────────────────────
      const dockerApiEnvLines: string[] = [];

      if (hasPrisma) {
        dockerApiEnvLines.push(
          `      DATABASE_URL: "postgresql://postgres:postgres@postgres:5432/${config.projectName}?schema=public"`,
        );
      }

      if (config.redis) {
        dockerApiEnvLines.push(
          '      REDIS_URL: "redis://redis:6379"',
        );
      }

      if (config.auth === 'jwt') {
        dockerApiEnvLines.push(
          '      JWT_SECRET: "${JWT_SECRET}"',
        );
      }

      const dockerComposeApiEnvironment =
        dockerApiEnvLines.join('\n');

      // ── Docker: API depends_on ──────────────────────────────────
      const dockerDependsOnEntries: string[] = [];

      if (hasPrisma) {
        dockerDependsOnEntries.push(
          '      postgres:\n' +
          '        condition: service_healthy',
        );
      }

      if (config.redis) {
        dockerDependsOnEntries.push(
          '      redis:\n' +
          '        condition: service_healthy',
        );
      }

      const dockerComposeApiDependsOn =
        dockerDependsOnEntries.length > 0
          ? '    depends_on:\n' +
            dockerDependsOnEntries.join('\n')
          : '';

      // ── Docker: API command ─────────────────────────────────────
      const dockerComposeApiCommand = hasPrisma
        ? 'sh -c "npx prisma migrate deploy && node dist/main.js"'
        : 'node dist/main.js';

      // ── Docker: postgres service ────────────────────────────────
      const dockerComposePostgresService = hasPrisma
        ? [
            `  postgres:`,
            `    image: postgres:16-alpine`,
            `    environment:`,
            `      POSTGRES_USER: postgres`,
            `      POSTGRES_PASSWORD: postgres`,
            `      POSTGRES_DB: ${config.projectName}`,
            `    volumes:`,
            `      - postgres_data:/var/lib/postgresql/data`,
            `    healthcheck:`,
            `      test: ["CMD-SHELL", "pg_isready -U postgres"]`,
            `      interval: 5s`,
            `      timeout: 5s`,
            `      retries: 5`,
          ].join('\n')
        : '';

      // ── Docker: redis service ───────────────────────────────────
      const dockerComposeRedisService = config.redis
        ? [
            `  redis:`,
            `    image: redis:7-alpine`,
            `    volumes:`,
            `      - redis_data:/data`,
            `    healthcheck:`,
            `      test: ["CMD", "redis-cli", "ping"]`,
            `      interval: 5s`,
            `      timeout: 3s`,
            `      retries: 5`,
          ].join('\n')
        : '';

      // ── Docker: top-level volumes ───────────────────────────────
      const volumeEntries: string[] = [];

      if (hasPrisma) {
        volumeEntries.push('  postgres_data:');
      }

      if (config.redis) {
        volumeEntries.push('  redis_data:');
      }

      const dockerComposeVolumes =
        volumeEntries.length > 0
          ? 'volumes:\n' + volumeEntries.join('\n')
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
        )
        .replace(
          /\{\{\s*dockerComposeApiEnvironment\s*\}\}/g,
          dockerComposeApiEnvironment,
        )
        .replace(
          /\{\{\s*dockerComposeApiDependsOn\s*\}\}/g,
          dockerComposeApiDependsOn,
        )
        .replace(
          /\{\{\s*dockerComposeApiCommand\s*\}\}/g,
          dockerComposeApiCommand,
        )
        .replace(
          /\{\{\s*dockerComposePostgresService\s*\}\}/g,
          dockerComposePostgresService,
        )
        .replace(
          /\{\{\s*dockerComposeRedisService\s*\}\}/g,
          dockerComposeRedisService,
        )
        .replace(
          /\{\{\s*dockerComposeVolumes\s*\}\}/g,
          dockerComposeVolumes,
        );
    },
  };
}