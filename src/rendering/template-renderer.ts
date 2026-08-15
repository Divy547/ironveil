import type { ForgeKitConfig } from '../config/index.js';
import { FORGEKIT_VERSIONS } from '../config/versions.js';
import { getPackageManagerSpec } from '../utils/package-manager.js';

export interface TemplateRenderer {
  render(
    template: string,
    config: ForgeKitConfig,
  ): string;
}

export function createTemplateRenderer(): TemplateRenderer {
  return {
    render(template, config): string {
      const pmSpec = getPackageManagerSpec(config.packageManager);

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

      const databaseEnvExample = hasPrisma
        ? `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/${config.projectName}?schema=public"`
        : '';

      const databaseEnvSchema = hasPrisma
        ? "DATABASE_URL: z\n    .string()\n    .min(1, 'DATABASE_URL is required'),"
        : '';

      const authEnvExample =
        config.auth === 'jwt'
          ? 'JWT_SECRET="replace-this-with-a-random-secret-at-least-32-characters-long"'
          : '';

      const authConfigType =
        config.auth === 'jwt'
          ? 'readonly auth: {\n    readonly jwtSecret: string | undefined;\n  };'
          : '';

      const authConfig =
        config.auth === 'jwt'
          ? "auth: {\n      jwtSecret:\n        process.env.JWT_SECRET,\n    },"
          : '';

      const authEnvSchema =
        config.auth === 'jwt'
          ? "JWT_SECRET: z\n    .string()\n    .min(\n      32,\n      'JWT_SECRET must be at least 32 characters',\n    )\n    .optional(),"
          : '';

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
        ? 'sh -c "./node_modules/.bin/prisma migrate deploy && node dist/main.js"'
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
            `    ports:`,
            `      - "5432:5432"`,
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
            `    ports:`,
            `      - "6379:6379"`,
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

      // ── Dockerfile Build steps ─────────────────────────────────
      const dockerInstall =
        config.packageManager === 'npm'
          ? 'RUN npm install'
          : config.packageManager === 'pnpm'
            ? 'RUN corepack enable && pnpm install'
            : 'RUN corepack enable && yarn install';

      const dockerPrismaGenerate = hasPrisma
        ? `RUN ${pmSpec.prisma('generate')}\n`
        : '';

      const dockerBuild = `RUN ${pmSpec.run('build')}`;

      // ── CI: Setup steps ─────────────────────────────────────────
      const ciSetupSteps =
        config.packageManager === 'npm'
          ? [
              '      - name: Set up Node.js',
              '        uses: actions/setup-node@v4',
              '        with:',
              `          node-version: '${FORGEKIT_VERSIONS.tools.node}'`,
            ].join('\n')
          : config.packageManager === 'pnpm'
            ? [
                '      - name: Install pnpm',
                '        uses: pnpm/action-setup@v4',
                '        with:',
                `          version: '${FORGEKIT_VERSIONS.tools.pnpm}'`,
                '',
                '      - name: Set up Node.js',
                '        uses: actions/setup-node@v4',
                '        with:',
                `          node-version: '${FORGEKIT_VERSIONS.tools.node}'`,
              ].join('\n')
            : [
                '      - name: Set up Node.js',
                '        uses: actions/setup-node@v4',
                '        with:',
                `          node-version: '${FORGEKIT_VERSIONS.tools.node}'`,
                '',
                '      - name: Enable Corepack',
                '        run: corepack enable',
              ].join('\n');

      const ciInstallCommand = pmSpec.install;

      // ── CI: Prisma generate step ────────────────────────────────
      const ciPrismaStep = hasPrisma
        ? `\n      - name: Generate Prisma Client\n        run: ${pmSpec.prisma('generate')}\n        env:\n          DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/db?schema=public"`
        : '';

      const ciTypecheckCommand = pmSpec.run('typecheck');

      // ── CI: Unit test step ──────────────────────────────────────
      const ciTestStep = config.testing
        ? `\n      - name: Run unit tests\n        run: ${pmSpec.run('test')}`
        : '';

      const ciBuildCommand = pmSpec.run('build');

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

      // ── Testing: Test environment variables ────────────────────
      const testingTestEnvLines: string[] = [];

      if (hasPrisma) {
        testingTestEnvLines.push(
          "process.env.DATABASE_URL =\n  process.env.DATABASE_URL ??\n  'postgresql://postgres:postgres@localhost:5432/test_db?schema=public';",
        );
      }

      if (config.redis) {
        testingTestEnvLines.push(
          "process.env.REDIS_URL =\n  process.env.REDIS_URL ?? 'redis://localhost:6379';",
        );
      }

      if (config.auth === 'jwt') {
        testingTestEnvLines.push(
          "process.env.JWT_SECRET =\n  process.env.JWT_SECRET ?? 'test-secret-key-minimum-32-chars-long';",
        );
      }

      const testingTestEnv = testingTestEnvLines.join('\n');

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
        `- [Node.js](https://nodejs.org/) (version ${FORGEKIT_VERSIONS.tools.node} or later)`,
        `- [${pmSpec.displayName}](${pmSpec.documentationUrl}) package manager`,
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
      const infraServices: string[] = [];
      if (hasPrisma) {
        infraServices.push('postgres');
      }
      if (config.redis) {
        infraServices.push('redis');
      }
      const infraServicesCmd = infraServices.join(' ');

      const installSteps: string[] = [
        `1. **Clone the repository and install dependencies**:\n   \`\`\`bash\n   ${pmSpec.install}\n   \`\`\``,
        '2. **Set up environment variables**:\n   ```bash\n   cp .env.example .env\n   ```',
      ];

      if (config.docker && infraServices.length > 0) {
        installSteps.push(
          `3. **Start local infrastructure services (PostgreSQL${config.redis ? ' & Redis' : ''}) in Docker**:\n   \`\`\`bash\n   docker compose up -d ${infraServicesCmd}\n   \`\`\``,
        );
      }

      if (hasPrisma) {
        const stepNum = installSteps.length + 1;
        installSteps.push(
          `${stepNum}. **Generate Prisma Client and apply database migrations**:\n   \`\`\`bash\n   ${pmSpec.prisma('generate')}\n   ${pmSpec.prisma('migrate dev')}\n   \`\`\``,
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
      let readmeDevelopment = '';
      if (config.docker && infraServices.length > 0) {
        readmeDevelopment = [
          '### Host-Based Development (Recommended)\n',
          'Run background database and cache infrastructure in Docker while developing the NestJS application directly on your host with hot reload:\n',
          '```bash',
          '# 1. Start background infrastructure services',
          `docker compose up -d ${infraServicesCmd}`,
          '',
          ...(hasPrisma
            ? [
                '# 2. Apply database migrations',
                pmSpec.prisma('migrate dev'),
                '',
              ]
            : []),
          '# 3. Start the application in development mode with hot reload',
          pmSpec.run('start:dev'),
          '',
          '# Run TypeScript type checking',
          pmSpec.run('typecheck'),
          '',
          '# Build the project for production',
          pmSpec.run('build'),
          '```\n',
          '### Fully Containerized Workflow\n',
          'Alternatively, build and run the entire application stack including the NestJS API container inside Docker:\n',
          '```bash',
          '# Build and start all services in containers',
          pmSpec.run('docker:up'),
          '',
          '# View application logs',
          'docker compose logs -f api',
          '',
          '# Stop all containerized services',
          pmSpec.run('docker:down'),
          '```',
        ].join('\n');
      } else {
        readmeDevelopment = [
          '```bash',
          '# Start the application in development mode with hot reload',
          pmSpec.run('start:dev'),
          '',
          '# Run TypeScript type checking',
          pmSpec.run('typecheck'),
          '',
          '# Build the project for production',
          pmSpec.run('build'),
          '```',
        ].join('\n');
      }

      // ── README: Database & Prisma ───────────────────────────────
      const readmeDatabase = hasPrisma
        ? [
            '## Database & Prisma\n',
            'This project uses Prisma ORM with PostgreSQL.\n',
            '- **Schema**: `prisma/schema.prisma`',
            `- **Generate Prisma Client**: \`${pmSpec.prisma('generate')}\``,
            `- **Apply Migrations (Development)**: \`${pmSpec.prisma('migrate dev')}\``,
            `- **Apply Migrations (Production/CI)**: \`${pmSpec.prisma('migrate deploy')}\``,
            `- **Prisma Studio**: \`${pmSpec.prisma('studio')}\`\n`,
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
        '- `api`: NestJS application container (exposed on port `3000`)',
      ];
      if (hasPrisma) {
        dockerServicesList.push(
          '- `postgres`: PostgreSQL 16 Alpine database container (published on host port `5432` with volume `postgres_data`)',
        );
      }
      if (config.redis) {
        dockerServicesList.push(
          '- `redis`: Redis 7 Alpine container (published on host port `6379` with volume `redis_data`)',
        );
      }

      const readmeDocker = config.docker
        ? [
            '## Docker\n',
            'Docker Compose supports both host-based development (infrastructure containers only) and fully containerized execution:\n',
            '```bash',
            '# Start background infrastructure only (for host-based development)',
            `docker compose up -d ${infraServicesCmd}`,
            '',
            '# Build and start all services (including NestJS API)',
            pmSpec.run('docker:up'),
            '',
            '# View application logs',
            'docker compose logs -f api',
            '',
            '# Stop all running services',
            pmSpec.run('docker:down'),
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
            pmSpec.run('test'),
            '',
            '# Run unit tests in watch mode',
            pmSpec.run('test:watch'),
            '',
            '# Generate test coverage report',
            pmSpec.run('test:cov'),
            '',
            '# Run end-to-end (E2E) tests',
            pmSpec.run('test:e2e'),
            '```\n',
            'Test directories:',
            '- Unit tests: `src/**/*.spec.ts`',
            '- E2E tests: `test/**/*.e2e-spec.ts`\n',
          ].join('\n')
        : '';

      // ── README: Continuous Integration ──────────────────────────
      const ciStepsList: string[] = [
        '1. Checkout code & set up Node.js 22',
        `2. Install dependencies (\`${pmSpec.install}\`)`,
      ];
      if (hasPrisma) {
        ciStepsList.push(`3. Generate Prisma Client (\`${pmSpec.prisma('generate')}\`)`);
      }
      ciStepsList.push(
        `${ciStepsList.length + 1}. Typecheck validation (\`${pmSpec.run('typecheck')}\`)`,
      );
      if (config.testing) {
        ciStepsList.push(
          `${ciStepsList.length + 1}. Run unit tests (\`${pmSpec.run('test')}\`)`,
        );
      }
      ciStepsList.push(
        `${ciStepsList.length + 1}. Build production bundle (\`${pmSpec.run('build')}\`)`,
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
        pmSpec.run('build'),
      ];
      if (hasPrisma) {
        prodStepsList.push(
          '',
          '# 2. Deploy database migrations',
          pmSpec.prisma('migrate deploy'),
        );
      }
      prodStepsList.push(
        '',
        `# ${hasPrisma ? '3' : '2'}. Start production server`,
        pmSpec.run('start:prod'),
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
          /\{\{\s*databaseEnvExample\s*\}\}/g,
          databaseEnvExample,
        )
        .replace(
          /\{\{\s*databaseEnvSchema\s*\}\}/g,
          databaseEnvSchema,
        )
        .replace(
          /\{\{\s*authEnvExample\s*\}\}/g,
          authEnvExample,
        )
        .replace(
          /\{\{\s*authConfigType\s*\}\}/g,
          authConfigType,
        )
        .replace(
          /\{\{\s*authConfig\s*\}\}/g,
          authConfig,
        )
        .replace(
          /\{\{\s*authEnvSchema\s*\}\}/g,
          authEnvSchema,
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
          /\{\{\s*dockerInstall\s*\}\}/g,
          dockerInstall,
        )
        .replace(
          /\{\{\s*dockerPrismaGenerate\s*\}\}/g,
          dockerPrismaGenerate,
        )
        .replace(
          /\{\{\s*dockerBuild\s*\}\}/g,
          dockerBuild,
        )
        .replace(
          /\{\{\s*ciSetupSteps\s*\}\}/g,
          ciSetupSteps,
        )
        .replace(
          /\{\{\s*ciInstallCommand\s*\}\}/g,
          ciInstallCommand,
        )
        .replace(
          /\{\{\s*ciPrismaStep\s*\}\}/g,
          ciPrismaStep,
        )
        .replace(
          /\{\{\s*ciTypecheckCommand\s*\}\}/g,
          ciTypecheckCommand,
        )
        .replace(
          /\{\{\s*ciTestStep\s*\}\}/g,
          ciTestStep,
        )
        .replace(
          /\{\{\s*ciBuildCommand\s*\}\}/g,
          ciBuildCommand,
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
          /\{\{\s*testingTestEnv\s*\}\}/g,
          testingTestEnv,
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