import type { IronveilConfig } from '../../../config/index.js';
import { getPackageManagerSpec } from '../../../utils/package-manager.js';

/**
 * Builds the `AGENTS.md` shipped in every generated project.
 *
 * The file is the single source of truth for AI coding agents, so every
 * statement in it must be true for the exact feature combination that was
 * generated: sections for disabled features are omitted, and commands use the
 * chosen package manager. Keep this in step with the templates under
 * `src/templates/`.
 */
export function buildAgentsMd(config: IronveilConfig): string {
  const pm = getPackageManagerSpec(config.packageManager);
  const jwt = config.auth === 'jwt';

  const sections = [
    header(config),
    architecture(config),
    commands(config),
    addModule(config),
    addPrismaModel(config, pm.prisma('migrate dev --name <change>')),
    addEndpoint(config),
    conventions(config),
    ...(jwt ? [authSection()] : []),
    ...(config.redis ? [redisSection()] : []),
    ...(config.queue ? [queueSection()] : []),
    ...(config.swagger ? [swaggerSection()] : []),
    testingSection(config),
    doNot(config),
  ];

  return sections.join('\n\n') + '\n';
}

function header(config: IronveilConfig): string {
  return [
    `# AGENTS.md`,
    '',
    `Guidance for AI coding agents working on **${config.projectName}**, a NestJS 11 + TypeScript backend with Prisma and PostgreSQL. Read this before changing code and follow it so new code matches the existing style.`,
  ].join('\n');
}

function architecture(config: IronveilConfig): string {
  const jwt = config.auth === 'jwt';

  const infra = [
    ['config/', 'configuration.ts (typed config) + environment.ts (zod env validation)'],
    ['logging/', ''],
    ['security/', ''],
    ['prisma/', 'global PrismaModule / PrismaService'],
    ...(config.redis
      ? [['redis/', 'global RedisModule / RedisService']]
      : []),
    ...(config.queue
      ? [['queue/', 'global BullMQ connection (QueueModule)']]
      : []),
    ...(config.swagger ? [['swagger/', '']] : []),
  ];
  const features = [
    ['health/', '/health and /health/ready'],
    ...(jwt ? [['auth/', 'register, login, refresh, logout, me']] : []),
  ];

  const tree = [
    'src/',
    '├── main.ts                  # bootstrap: logger, shutdown hooks, security, ValidationPipe' +
      (config.swagger ? ', Swagger' : ''),
    '├── app.module.ts            # root module: imports CommonModule, InfrastructureModule and every feature module',
    '├── common/                  # cross-cutting, framework-level code with no business logic',
    '│   ├── common.module.ts',
    '│   └── filters/all-exceptions.filter.ts',
    '├── infrastructure/          # adapters to the outside world (config, DB, cache, logging, security)',
    '│   ├── infrastructure.module.ts',
    ...infra.map(([name, note], index) =>
      treeLine('│   ', index === infra.length - 1, name, note),
    ),
    '└── modules/                 # business features, one folder per feature',
    ...features.map(([name, note], index) =>
      treeLine('    ', index === features.length - 1, name, note),
    ),
  ];

  return [
    '## Architecture',
    '',
    '```',
    ...tree,
    '```',
    '',
    'Where code belongs:',
    '',
    '- **`src/modules/<feature>/`**: everything a feature needs (module, controller, service, `dto/`, `types/`, its tests). This is where almost all new code goes. A feature may import another feature\'s module and use what it exports, but must not import its internals.',
    '- **`src/infrastructure/`**: integrations with external systems and process-wide setup. Changes here are rare; add a new folder only for a new external dependency (queue, mailer, storage). `PrismaModule`' +
      (config.redis ? ' and `RedisModule` are' : ' is') +
      ' `@Global()`, so inject ' +
      (config.redis ? '`PrismaService` / `RedisService`' : '`PrismaService`') +
      ' directly without importing the module.',
    '- **`src/common/`**: framework-level building blocks shared by every feature (filters, and any future pipes, interceptors or generic decorators). Nothing here may depend on a feature module.',
    '- Dependencies point one way: `modules` → `infrastructure` / `common`. Never import a feature module from `common/` or `infrastructure/`.',
    '- Do not edit `src/generated/`: it is Prisma client output, rewritten by `prisma generate` and git-ignored.',
  ].join('\n');
}

function treeLine(
  indent: string,
  last: boolean,
  name: string,
  note: string,
): string {
  const entry = `${indent}${last ? '└── ' : '├── '}${name}`;
  return note ? `${entry.padEnd(29)}# ${note}` : entry;
}

function numbered(items: readonly string[]): string[] {
  return items.map((item, index) => `${index + 1}. ${item}`);
}

function commands(config: IronveilConfig): string {
  const pm = getPackageManagerSpec(config.packageManager);

  const rows: Array<[string, string]> = [
    [pm.install, 'install dependencies'],
    [pm.prisma('generate'), 'generate the Prisma client (needed before lint, typecheck and tests)'],
    [pm.run('start:dev'), 'run with hot reload'],
    [pm.run('lint'), `ESLint (type-aware); \`${pm.run('lint:fix')}\` auto-fixes`],
    [pm.run('format'), 'Prettier'],
    [pm.run('typecheck'), 'tsc --noEmit'],
    [pm.run('build'), 'production build to dist/'],
  ];

  if (config.testing) {
    rows.push(
      [pm.run('test'), 'unit tests (src/**/*.spec.ts)'],
      [pm.run('test:e2e'), 'e2e tests (test/**/*.e2e-spec.ts)'],
    );
  }

  rows.push(
    [pm.prisma('migrate dev --name <change>'), 'create + apply a migration after editing schema.prisma'],
    [pm.prisma('migrate deploy'), 'apply existing migrations (CI / production)'],
  );

  if (config.docker) {
    rows.push(
      [pm.run('docker:up'), 'run the whole stack in Docker'],
      [
        `docker compose up -d postgres${config.redis ? ' redis' : ''}`,
        'only the backing services, to develop on the host',
      ],
    );
  }

  const width = Math.max(...rows.map(([command]) => command.length)) + 2;
  const lines = rows.map(([command, note]) => `${command.padEnd(width)}# ${note}`);

  const done = [
    pm.run('lint'),
    pm.run('typecheck'),
    ...(config.testing ? [pm.run('test')] : []),
    pm.run('build'),
  ];

  return [
    '## Commands',
    '',
    '```bash',
    ...lines,
    '```',
    '',
    `Before you call a task finished, run \`${done.join('` && `')}\` and fix everything they report.${config.ci ? ' The same checks gate CI (`.github/workflows/ci.yml`).' : ''}`,
  ].join('\n');
}

function addModule(config: IronveilConfig): string {
  const jwt = config.auth === 'jwt';

  return [
    '## How to add a module',
    '',
    'Example: a `products` feature.',
    '',
    ...numbered([
      'Create `src/modules/products/` with `products.module.ts`, `products.controller.ts`, `products.service.ts` and a `dto/` folder. Use kebab-case file names and plural, lowercase route paths.',
      'Declare the controller and service in `@Module({ controllers, providers })`. Add `exports: [ProductsService]` only if another module needs it.',
      'Import `ProductsModule` in `src/app.module.ts` (both the `import` statement and the `imports: [...]` array). A module that is not registered there is never loaded.',
      'Keep controllers thin: parse input through DTOs, call the service, return the result. Business rules and Prisma calls live in the service.',
      jwt
        ? 'Routes are **private by default** (global `JwtAuthGuard`). Do nothing for a protected route; add `@Public()` only for routes that must be open.'
        : 'This project has no authentication, so routes are open.',
      ...(config.testing
        ? ['Add `products.service.spec.ts` next to the service.']
        : []),
    ]),
  ].join('\n');
}

function addPrismaModel(config: IronveilConfig, migrateCommand: string): string {
  const jwt = config.auth === 'jwt';

  return [
    '## How to add a Prisma model',
    '',
    ...numbered([
      'Add the `model` to `prisma/schema.prisma`. Follow the existing style: `id String @id @default(cuid())`, `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`, singular PascalCase names, and `@@index` on foreign keys.',
      `Create and apply the migration with \`${migrateCommand}\`. This writes a new folder under \`prisma/migrations/\` and regenerates the client. Commit the migration together with the schema change.`,
      'Never edit a migration that has already been applied or committed; add a new one instead.',
      'Use the model through the global `PrismaService` (`this.prisma.product.findMany(...)`) inside a service, never in a controller.',
      ...(jwt
        ? ["Per-user data: add `userId String` plus a relation to `User`, and filter by `@CurrentUser('sub')` in the service so one user cannot read another's rows."]
        : []),
    ]),
  ].join('\n');
}

function addEndpoint(config: IronveilConfig): string {
  const jwt = config.auth === 'jwt';

  return [
    '## How to add an endpoint',
    '',
    ...numbered([
      "Create a DTO in the module's `dto/` folder as a class with `class-validator` decorators and `!` on required fields" +
        (jwt ? ' (see `src/modules/auth/dto/register.dto.ts`)' : '') +
        '. The global `ValidationPipe` runs with `whitelist`, `forbidNonWhitelisted` and `transform`, so unknown properties are rejected and every accepted field **must** have a decorator.',
      "Add the service method first, then a controller method that calls it: `@Post()`, `@Get(':id')`, etc., with `@Body() dto: CreateProductDto`.",
      'Signal failures by throwing Nest HTTP exceptions (`NotFoundException`, `ConflictException`, ...). Do not catch them to build custom responses.',
      ...(jwt
        ? ["Restrict by role with `@Roles(Role.ADMIN)`; read the caller with `@CurrentUser()` or `@CurrentUser('sub')`."]
        : []),
      ...(config.testing
        ? ['Add a unit test for the service method and an e2e case in `test/` for the route.']
        : []),
      ...(config.swagger
        ? ['Document it with `@ApiTags`, `@ApiOperation` and `@ApiProperty` on DTO fields (`@nestjs/swagger`).']
        : []),
    ]),
  ].join('\n');
}

function conventions(config: IronveilConfig): string {
  const jwt = config.auth === 'jwt';

  return [
    '## Conventions',
    '',
    '- **Validation**: DTO classes with `class-validator`; never trust `req.body` directly. Environment variables are validated at boot with zod in `src/infrastructure/config/environment.ts`.',
    '- **Configuration**: read settings through `ConfigService` (`configService.get(\'port\')`, typed by `AppConfig` in `configuration.ts`), not `process.env`. A new env var needs all of: an entry in the zod schema in `environment.ts`, an entry in `configuration.ts`, and a line in `.env.example`. The app refuses to boot if one is missing, which is intended.',
    '- **Errors**: throw Nest exceptions. `AllExceptionsFilter` turns everything into `{ statusCode, message, error, requestId, timestamp }`; Prisma `P2002` becomes 409 and `P2025` becomes 404; unexpected errors become a generic 500 with details only in the logs. Do not return error bodies by hand.',
    '- **Logging**: inject `Logger` from `@nestjs/common` (pino is wired in behind it). Never use `console.log`. Never log tokens, passwords or full request bodies; `authorization`, `cookie`, `password` and token fields are redacted, but only for the known paths in `logging.module.ts`.',
    '- **Style**: Prettier (single quotes, trailing commas) and ESLint run on `src/` and `test/`. Prefer `import type` for type-only imports. Return DTO-shaped or `select`ed objects, never raw Prisma rows containing secrets' +
      (jwt ? ' (for example `passwordHash`)' : '') +
      '.',
    '- **Dependencies**: add them with the package manager above so the lockfile stays in sync.',
  ].join('\n');
}

function authSection(): string {
  return [
    '## Authentication and authorization',
    '',
    '- A global `JwtAuthGuard` and `RolesGuard` protect **every** route. Opt out with `@Public()` (`src/modules/auth/decorators/`). Health routes are already public.',
    '- `@Roles(Role.ADMIN)` requires one of the listed roles (`USER` or `ADMIN`). New users are `USER`; there is no endpoint to grant roles, promote in the database.',
    '- `@CurrentUser()` returns the JWT payload (`sub`, `email`, `role`); `@CurrentUser(\'sub\')` returns just the user id.',
    '- Access tokens are short-lived; refresh tokens are opaque, stored hashed in the `RefreshToken` table and rotated on every use. Reusing a rotated token revokes the whole family. Do not weaken this, and do not add endpoints that return password hashes or token hashes.',
    '- Never hard-code or log `JWT_SECRET`.',
  ].join('\n');
}

function redisSection(): string {
  return [
    '## Redis',
    '',
    '- Inject the global `RedisService` (`src/infrastructure/redis/redis.service.ts`) instead of creating `ioredis` clients. It disconnects cleanly on shutdown; a second client would not.',
    '- Namespace keys by feature (`products:<id>`) and always set a TTL on cache entries.',
    '- Readiness (`/health/ready`) pings Redis; keep that wiring when changing the service.',
  ].join('\n');
}

function queueSection(): string {
  return [
    '## Job queue (BullMQ)',
    '',
    '- `QueueModule` (`src/infrastructure/queue/`) holds the shared BullMQ connection, built from `REDIS_URL`, and the default job options (3 attempts, exponential backoff, finished jobs trimmed). Do not call `BullModule.forRoot` again or create `Queue` / `Worker` objects by hand.',
    '- Register a queue in the feature module that owns it with `BullModule.registerQueue({ name: QUEUE_NAME })`, keeping the name in one exported constant. Put the work in a `@Processor(QUEUE_NAME)` class that extends `WorkerHost` and implements `process(job)`, and enqueue from a service with `@InjectQueue(QUEUE_NAME)`.',
    '- Jobs can run more than once because of retries, so make processors idempotent. Put plain JSON in the job data (ids, not entities) and load fresh data in the processor.',
    '- **In tests, override both the queue and its processor**: a registered queue opens a Redis connection and a `@Processor` starts a worker. Use `overrideProvider(getQueueToken(QUEUE_NAME)).useValue({ add: jest.fn() })` and `overrideProvider(MyProcessor).useValue({})`. Overriding only the queue makes the worker fail at startup with `Worker requires a connection`. Every spec that boots `AppModule` needs these overrides once a queue exists, including `test/app.e2e-spec.ts`, `src/app.module.spec.ts` and the specs `ironveil generate resource` wrote.',
    '- Workers finish their current job and close on SIGTERM through the shutdown hooks in `main.ts`; keep `enableShutdownHooks()`.',
  ].join('\n');
}

function swaggerSection(): string {
  return [
    '## API documentation',
    '',
    '- Swagger UI is served at `/api/docs` (JSON at `/api/docs-json`), configured in `src/infrastructure/swagger/swagger.setup.ts`.',
    '- Every controller needs `@ApiTags`, every route `@ApiOperation`, and DTO fields `@ApiProperty` / `@ApiPropertyOptional` so the generated docs stay accurate. The Nest CLI Swagger plugin is **not** enabled, so undecorated fields do not appear.',
  ].join('\n');
}

function testingSection(config: IronveilConfig): string {
  if (!config.testing) {
    return [
      '## Testing',
      '',
      'This project was generated without a test runner. Ask before adding one, and at minimum keep `lint`, `typecheck` and `build` green.',
    ].join('\n');
  }

  return [
    '## Testing',
    '',
    '- **Unit tests** (Jest, `ts-jest`) sit next to the code as `*.spec.ts`, e.g. `src/modules/products/products.service.spec.ts`. Mock `PrismaService` rather than hitting a database.',
    '- **E2E tests** live in `test/` as `*.e2e-spec.ts` and boot the full `AppModule` with `supertest`. The template overrides `PrismaService`' + (config.redis ? ' and `RedisService`' : '') + ' with mocks, so they need no database; follow that pattern and add `overrideProvider` mocks for whatever your tests call.',
    '- `src/app.module.spec.ts` compiles the whole dependency tree; if you add a module and this test breaks, you have a missing provider or import.',
    '- Test behavior (status codes, returned shape, thrown exceptions), not implementation details. Every new service method and endpoint needs a test.',
  ].join('\n');
}

function doNot(config: IronveilConfig): string {
  const jwt = config.auth === 'jwt';

  const rules = [
    'Do not put business logic in controllers or Prisma calls outside services.',
    'Do not read `process.env` outside `src/infrastructure/config/`.',
    'Do not bypass the `ValidationPipe`, the exception filter or the logger.',
    'Do not edit `src/generated/` or already-applied migrations.',
    'Do not commit `.env` or any real secret (`.env*` is git-ignored except `.env.example`, which holds placeholders only).',
    ...(jwt
      ? ['Do not remove the global guards or mark routes `@Public()` just to make a test pass.']
      : []),
    'Do not add a dependency for something Node or an already-installed package provides.',
  ];

  return ['## Do not', '', ...rules.map((rule) => `- ${rule}`)].join('\n');
}
