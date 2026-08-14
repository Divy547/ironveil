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

      // ── CI: Prisma generate step ────────────────────────────────
      const ciPrismaStep = hasPrisma
        ? '\n      - name: Generate Prisma Client\n        run: npx prisma generate\n        env:\n          DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/db?schema=public"'
        : '';

      // ── CI: Unit test step ──────────────────────────────────────
      const ciTestStep = config.testing
        ? '\n      - name: Run unit tests\n        run: npm test'
        : '';

      // ── Testing: E2E imports and provider overrides ──────────────
      const testingE2eImportLines: string[] = [];
      const testingE2eOverrideLines: string[] = [];

      if (hasPrisma) {
        testingE2eImportLines.push(
          "import { PrismaService } from '../src/infrastructure/prisma/prisma.service';",
        );
        testingE2eOverrideLines.push(
          '    moduleBuilder.overrideProvider(PrismaService).useValue({\n' +
          '      onModuleInit: jest.fn(),\n' +
          '      onModuleDestroy: jest.fn(),\n' +
          '      $connect: jest.fn(),\n' +
          '      $disconnect: jest.fn(),\n' +
          '    });',
        );
      }

      if (config.redis) {
        testingE2eImportLines.push(
          "import { RedisService } from '../src/infrastructure/redis/redis.service';",
        );
        testingE2eOverrideLines.push(
          '    moduleBuilder.overrideProvider(RedisService).useValue({\n' +
          '      onModuleInit: jest.fn(),\n' +
          '      onModuleDestroy: jest.fn(),\n' +
          '      connect: jest.fn(),\n' +
          '      quit: jest.fn(),\n' +
          '    });',
        );
      }

      const testingE2eImports = testingE2eImportLines.join('\n');
      const testingE2eOverrides = testingE2eOverrideLines.join('\n');

      // ── README: Features ─────────────────────────────────────────
      const featureList: string[] = [
        '- **NestJS 11**: Modular architecture with TypeScript and strict type checking',
        '- **Configuration**: Centralized configuration and environment validation using Zod',
      ];

      if (hasPrisma) {
        featureList.push(
          '- **Database & ORM**: PostgreSQL integration with Prisma ORM and automated migrations',
        );
      }

      if (config.auth === 'jwt') {
        featureList.push(
          '- **Authentication**: JWT authentication with Passport strategies and route guards',
        );
      }

      if (config.swagger) {
        featureList.push(
          '- **API Documentation**: Interactive OpenAPI / Swagger documentation UI',
        );
      }

      if (config.redis) {
        featureList.push(
          '- **Redis Infrastructure**: Redis client connectivity via `ioredis`',
        );
      }

      if (config.docker) {
        featureList.push(
          '- **Docker**: Multi-stage Dockerfile and Docker Compose service orchestration',
        );
      }

      if (config.testing) {
        featureList.push(
          '- **Testing**: Unit and deterministic E2E test suites with Jest and Supertest',
        );
      }

      if (config.ci) {
        featureList.push(
          '- **CI/CD**: Automated GitHub Actions workflow for typecheck, testing, and builds',
        );
      }

      const readmeFeatures = featureList.join('\n');

      // ── README: Prerequisites ────────────────────────────────────
      const prereqList: string[] = [
        '- [Node.js](https://nodejs.org/) (version 22 or later)',
        '- [npm](https://www.npmjs.com/) package manager',
      ];

      if (config.docker) {
        prereqList.push(
          '- [Docker](https://www.docker.com/) and Docker Compose (recommended for containerized services)',
        );
      } else {
        if (hasPrisma) {
          prereqList.push(
            '- [PostgreSQL](https://www.postgresql.org/) (version 16 or later)',
          );
        }
        if (config.redis) {
          prereqList.push(
            '- [Redis](https://redis.io/) (version 7 or later)',
          );
        }
      }

      const readmePrerequisites = prereqList.join('\n');

      // ── README: Installation ────────────────────────────────────
      const installSteps: string[] = [
        '1. **Clone the repository and install dependencies**:\n   ```bash\n   npm install\n   ```',
        '2. **Set up environment variables**:\n   ```bash\n   cp .env.example .env\n   ```',
      ];

      if (hasPrisma) {
        installSteps.push(
          '3. **Generate Prisma Client**:\n   ```bash\n   npx prisma generate\n   ```',
        );
      }

      const readmeInstallation = installSteps.join('\n\n');

      // ── README: Environment ─────────────────────────────────────
      const envRows: string[] = [
        '| `PORT` | Application HTTP port | `3000` |',
        '| `NODE_ENV` | Runtime environment mode | `development` |',
      ];

      if (hasPrisma) {
        envRows.push(
          `| \`DATABASE_URL\` | PostgreSQL connection URL | \`postgresql://postgres:postgres@localhost:5432/${config.projectName}?schema=public\` |`,
        );
      }

      if (config.redis) {
        envRows.push(
          '| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |',
        );
      }

      if (config.auth === 'jwt') {
        envRows.push(
          '| `JWT_SECRET` | Secret key used for signing JWT tokens | `your-secret-key-at-least-32-characters` |',
        );
      }

      const readmeEnvironment = [
        'Configure the following environment variables in `.env`:\n',
        '| Variable | Description | Example |',
        '|---|---|---|',
        ...envRows,
      ].join('\n');

      // ── README: Development ─────────────────────────────────────
      const readmeDevelopment = [
        '```bash',
        '# Start the application in development mode with hot reload',
        'npm run start:dev',
        '',
        '# Run TypeScript type checking',
        'npm run typecheck',
        '',
        '# Build the project for production',
        'npm run build',
        '```',
      ].join('\n');

      // ── README: Database & Prisma ───────────────────────────────
      const readmeDatabase = hasPrisma
        ? [
            '## Database & Prisma\n',
            'This project uses Prisma ORM with PostgreSQL.\n',
            '- **Schema**: `prisma/schema.prisma`',
            '- **Generate Prisma Client**: `npx prisma generate`',
            '- **Apply Migrations (Development)**: `npx prisma migrate dev`',
            '- **Apply Migrations (Production/CI)**: `npx prisma migrate deploy`',
            '- **Prisma Studio**: `npx prisma studio`\n',
          ].join('\n')
        : '';

      // ── README: Authentication ──────────────────────────────────
      const readmeAuth =
        config.auth === 'jwt'
          ? [
              '## Authentication\n',
              'JWT-based authentication is provided using `@nestjs/jwt` and Passport.\n',
              'Available endpoints:',
              '- `POST /auth/register`: Register a new user (`{ email, password }`)',
              '- `POST /auth/login`: Authenticate and receive a JWT access token (`{ accessToken }`)',
              '- `GET /auth/me`: Protected route returning the current user payload (requires `Authorization: Bearer <token>` header)\n',
            ].join('\n')
          : '';

      // ── README: Swagger ─────────────────────────────────────────
      const readmeSwagger = config.swagger
        ? [
            '## API Documentation (Swagger)\n',
            'Interactive OpenAPI documentation is available when running locally:\n',
            '- **Swagger UI**: [http://localhost:3000/api/docs](http://localhost:3000/api/docs)',
            '- **OpenAPI JSON**: [http://localhost:3000/api/docs-json](http://localhost:3000/api/docs-json)\n',
          ].join('\n')
        : '';

      // ── README: Redis ───────────────────────────────────────────
      const readmeRedis = config.redis
        ? [
            '## Redis Infrastructure\n',
            'Redis client connectivity is provided by `RedisModule` and `RedisService` using `ioredis`.\n',
            '- Configured via the `REDIS_URL` environment variable.',
            '- The injectable `RedisService` manages client connectivity and commands.\n',
          ].join('\n')
        : '';

      // ── README: Docker ──────────────────────────────────────────
      const dockerServicesList: string[] = [
        '- `api`: NestJS application container',
      ];
      if (hasPrisma) {
        dockerServicesList.push(
          '- `postgres`: PostgreSQL 16 Alpine database container with persistent data volume',
        );
      }
      if (config.redis) {
        dockerServicesList.push(
          '- `redis`: Redis 7 Alpine container with persistent data volume',
        );
      }

      const readmeDocker = config.docker
        ? [
            '## Docker\n',
            'Run the entire application stack using Docker Compose:\n',
            '```bash',
            '# Build and start all services',
            'npm run docker:up',
            '',
            '# Stop all running services',
            'npm run docker:down',
            '```\n',
            'Services defined in `docker-compose.yml`:\n' +
              dockerServicesList.join('\n') +
              '\n',
          ].join('\n')
        : '';

      // ── README: Testing ─────────────────────────────────────────
      const readmeTesting = config.testing
        ? [
            '## Testing\n',
            '```bash',
            '# Run unit tests',
            'npm test',
            '',
            '# Run unit tests in watch mode',
            'npm run test:watch',
            '',
            '# Generate test coverage report',
            'npm run test:cov',
            '',
            '# Run end-to-end (E2E) tests',
            'npm run test:e2e',
            '```\n',
            'Test directories:',
            '- Unit tests: `src/**/*.spec.ts`',
            '- E2E tests: `test/**/*.e2e-spec.ts`\n',
          ].join('\n')
        : '';

      // ── README: Continuous Integration ──────────────────────────
      const ciStepsList: string[] = [
        '1. Checkout code & set up Node.js 22',
        '2. Install dependencies (`npm install`)',
      ];
      if (hasPrisma) {
        ciStepsList.push('3. Generate Prisma Client (`npx prisma generate`)');
      }
      ciStepsList.push(
        `${ciStepsList.length + 1}. Typecheck validation (\`npm run typecheck\`)`,
      );
      if (config.testing) {
        ciStepsList.push(
          `${ciStepsList.length + 1}. Run unit tests (\`npm test\`)`,
        );
      }
      ciStepsList.push(
        `${ciStepsList.length + 1}. Build production bundle (\`npm run build\`)`,
      );

      const readmeCi = config.ci
        ? [
            '## Continuous Integration\n',
            'Automated CI pipeline configured with GitHub Actions (`.github/workflows/ci.yml`).\n',
            'Pipeline steps on pushes to `main` and `master`:\n' +
              ciStepsList.join('\n') +
              '\n',
          ].join('\n')
        : '';

      // ── README: Production ──────────────────────────────────────
      const prodStepsList: string[] = [
        '```bash',
        '# 1. Compile the TypeScript application',
        'npm run build',
      ];
      if (hasPrisma) {
        prodStepsList.push(
          '',
          '# 2. Deploy database migrations',
          'npx prisma migrate deploy',
        );
      }
      prodStepsList.push(
        '',
        '# 3. Start production server',
        'npm run start:prod',
        '```',
      );

      const readmeProduction = prodStepsList.join('\n');

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
        )
        .replace(
          /\{\{\s*ciPrismaStep\s*\}\}/g,
          ciPrismaStep,
        )
        .replace(
          /\{\{\s*ciTestStep\s*\}\}/g,
          ciTestStep,
        )
        .replace(
          /\{\{\s*testingE2eImports\s*\}\}/g,
          testingE2eImports,
        )
        .replace(
          /\{\{\s*testingE2eOverrides\s*\}\}/g,
          testingE2eOverrides,
        )
        .replace(
          /\{\{\s*readmeFeatures\s*\}\}/g,
          readmeFeatures,
        )
        .replace(
          /\{\{\s*readmePrerequisites\s*\}\}/g,
          readmePrerequisites,
        )
        .replace(
          /\{\{\s*readmeInstallation\s*\}\}/g,
          readmeInstallation,
        )
        .replace(
          /\{\{\s*readmeEnvironment\s*\}\}/g,
          readmeEnvironment,
        )
        .replace(
          /\{\{\s*readmeDevelopment\s*\}\}/g,
          readmeDevelopment,
        )
        .replace(
          /\{\{\s*readmeDatabase\s*\}\}/g,
          readmeDatabase,
        )
        .replace(
          /\{\{\s*readmeAuth\s*\}\}/g,
          readmeAuth,
        )
        .replace(
          /\{\{\s*readmeSwagger\s*\}\}/g,
          readmeSwagger,
        )
        .replace(
          /\{\{\s*readmeRedis\s*\}\}/g,
          readmeRedis,
        )
        .replace(
          /\{\{\s*readmeDocker\s*\}\}/g,
          readmeDocker,
        )
        .replace(
          /\{\{\s*readmeTesting\s*\}\}/g,
          readmeTesting,
        )
        .replace(
          /\{\{\s*readmeCi\s*\}\}/g,
          readmeCi,
        )
        .replace(
          /\{\{\s*readmeProduction\s*\}\}/g,
          readmeProduction,
        );
    },
  };
}