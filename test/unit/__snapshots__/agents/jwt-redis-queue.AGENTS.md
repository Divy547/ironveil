# AGENTS.md

Guidance for AI coding agents working on **snapshot-api**, a NestJS 11 + TypeScript backend with Prisma and PostgreSQL. Read this before changing code and follow it so new code matches the existing style.

## Architecture

```
src/
├── main.ts                  # bootstrap: logger, shutdown hooks, security, ValidationPipe, Swagger
├── app.module.ts            # root module: imports CommonModule, InfrastructureModule and every feature module
├── common/                  # cross-cutting, framework-level code with no business logic
│   ├── common.module.ts
│   └── filters/all-exceptions.filter.ts
├── infrastructure/          # adapters to the outside world (config, DB, cache, logging, security)
│   ├── infrastructure.module.ts
│   ├── config/              # configuration.ts (typed config) + environment.ts (zod env validation)
│   ├── logging/
│   ├── security/
│   ├── prisma/              # global PrismaModule / PrismaService
│   ├── redis/               # global RedisModule / RedisService
│   ├── queue/               # global BullMQ connection (QueueModule)
│   └── swagger/
└── modules/                 # business features, one folder per feature
    ├── health/              # /health and /health/ready
    └── auth/                # register, login, refresh, logout, me
```

Where code belongs:

- **`src/modules/<feature>/`**: everything a feature needs (module, controller, service, `dto/`, `types/`, its tests). This is where almost all new code goes. A feature may import another feature's module and use what it exports, but must not import its internals.
- **`src/infrastructure/`**: integrations with external systems and process-wide setup. Changes here are rare; add a new folder only for a new external dependency (queue, mailer, storage). `PrismaModule` and `RedisModule` are `@Global()`, so inject `PrismaService` / `RedisService` directly without importing the module.
- **`src/common/`**: framework-level building blocks shared by every feature (filters, and any future pipes, interceptors or generic decorators). Nothing here may depend on a feature module.
- Dependencies point one way: `modules` → `infrastructure` / `common`. Never import a feature module from `common/` or `infrastructure/`.
- Do not edit `src/generated/`: it is Prisma client output, rewritten by `prisma generate` and git-ignored.

## Commands

```bash
npm install                             # install dependencies
npx prisma generate                     # generate the Prisma client (needed before lint, typecheck and tests)
npm run start:dev                       # run with hot reload
npm run lint                            # ESLint (type-aware); `npm run lint:fix` auto-fixes
npm run format                          # Prettier
npm run typecheck                       # tsc --noEmit
npm run build                           # production build to dist/
npm test                                # unit tests (src/**/*.spec.ts)
npm run test:e2e                        # e2e tests (test/**/*.e2e-spec.ts)
npx prisma migrate dev --name <change>  # create + apply a migration after editing schema.prisma
npx prisma migrate deploy               # apply existing migrations (CI / production)
npm run docker:up                       # run the whole stack in Docker
docker compose up -d postgres redis     # only the backing services, to develop on the host
```

Before you call a task finished, run `npm run lint` && `npm run typecheck` && `npm test` && `npm run build` and fix everything they report. The same checks gate CI (`.github/workflows/ci.yml`).

## How to add a module

Example: a `products` feature.

1. Create `src/modules/products/` with `products.module.ts`, `products.controller.ts`, `products.service.ts` and a `dto/` folder. Use kebab-case file names and plural, lowercase route paths.
2. Declare the controller and service in `@Module({ controllers, providers })`. Add `exports: [ProductsService]` only if another module needs it.
3. Import `ProductsModule` in `src/app.module.ts` (both the `import` statement and the `imports: [...]` array). A module that is not registered there is never loaded.
4. Keep controllers thin: parse input through DTOs, call the service, return the result. Business rules and Prisma calls live in the service.
5. Routes are **private by default** (global `JwtAuthGuard`). Do nothing for a protected route; add `@Public()` only for routes that must be open.
6. Add `products.service.spec.ts` next to the service.

## How to add a Prisma model

1. Add the `model` to `prisma/schema.prisma`. Follow the existing style: `id String @id @default(cuid())`, `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`, singular PascalCase names, and `@@index` on foreign keys.
2. Create and apply the migration with `npx prisma migrate dev --name <change>`. This writes a new folder under `prisma/migrations/` and regenerates the client. Commit the migration together with the schema change.
3. Never edit a migration that has already been applied or committed; add a new one instead.
4. Use the model through the global `PrismaService` (`this.prisma.product.findMany(...)`) inside a service, never in a controller.
5. Per-user data: add `userId String` plus a relation to `User`, and filter by `@CurrentUser('sub')` in the service so one user cannot read another's rows.

## How to add an endpoint

1. Create a DTO in the module's `dto/` folder as a class with `class-validator` decorators and `!` on required fields (see `src/modules/auth/dto/register.dto.ts`). The global `ValidationPipe` runs with `whitelist`, `forbidNonWhitelisted` and `transform`, so unknown properties are rejected and every accepted field **must** have a decorator.
2. Add the service method first, then a controller method that calls it: `@Post()`, `@Get(':id')`, etc., with `@Body() dto: CreateProductDto`.
3. Signal failures by throwing Nest HTTP exceptions (`NotFoundException`, `ConflictException`, ...). Do not catch them to build custom responses.
4. Restrict by role with `@Roles(Role.ADMIN)`; read the caller with `@CurrentUser()` or `@CurrentUser('sub')`.
5. Add a unit test for the service method and an e2e case in `test/` for the route.
6. Document it with `@ApiTags`, `@ApiOperation` and `@ApiProperty` on DTO fields (`@nestjs/swagger`).

## Conventions

- **Validation**: DTO classes with `class-validator`; never trust `req.body` directly. Environment variables are validated at boot with zod in `src/infrastructure/config/environment.ts`.
- **Configuration**: read settings through `ConfigService` (`configService.get('port')`, typed by `AppConfig` in `configuration.ts`), not `process.env`. A new env var needs all of: an entry in the zod schema in `environment.ts`, an entry in `configuration.ts`, and a line in `.env.example`. The app refuses to boot if one is missing, which is intended.
- **Errors**: throw Nest exceptions. `AllExceptionsFilter` turns everything into `{ statusCode, message, error, requestId, timestamp }`; Prisma `P2002` becomes 409 and `P2025` becomes 404; unexpected errors become a generic 500 with details only in the logs. Do not return error bodies by hand.
- **Logging**: inject `Logger` from `@nestjs/common` (pino is wired in behind it). Never use `console.log`. Never log tokens, passwords or full request bodies; `authorization`, `cookie`, `password` and token fields are redacted, but only for the known paths in `logging.module.ts`.
- **Style**: Prettier (single quotes, trailing commas) and ESLint run on `src/` and `test/`. Prefer `import type` for type-only imports. Return DTO-shaped or `select`ed objects, never raw Prisma rows containing secrets (for example `passwordHash`).
- **Dependencies**: add them with the package manager above so the lockfile stays in sync.

## Authentication and authorization

- A global `JwtAuthGuard` and `RolesGuard` protect **every** route. Opt out with `@Public()` (`src/modules/auth/decorators/`). Health routes are already public.
- `@Roles(Role.ADMIN)` requires one of the listed roles (`USER` or `ADMIN`). New users are `USER`; there is no endpoint to grant roles, promote in the database.
- `@CurrentUser()` returns the JWT payload (`sub`, `email`, `role`); `@CurrentUser('sub')` returns just the user id.
- Access tokens are short-lived; refresh tokens are opaque, stored hashed in the `RefreshToken` table and rotated on every use. Reusing a rotated token revokes the whole family. Do not weaken this, and do not add endpoints that return password hashes or token hashes.
- Never hard-code or log `JWT_SECRET`.

## Redis

- Inject the global `RedisService` (`src/infrastructure/redis/redis.service.ts`) instead of creating `ioredis` clients. It disconnects cleanly on shutdown; a second client would not.
- Namespace keys by feature (`products:<id>`) and always set a TTL on cache entries.
- Readiness (`/health/ready`) pings Redis; keep that wiring when changing the service.

## Job queue (BullMQ)

- `QueueModule` (`src/infrastructure/queue/`) holds the shared BullMQ connection, built from `REDIS_URL`, and the default job options (3 attempts, exponential backoff, finished jobs trimmed). Do not call `BullModule.forRoot` again or create `Queue` / `Worker` objects by hand.
- Register a queue in the feature module that owns it with `BullModule.registerQueue({ name: QUEUE_NAME })`, keeping the name in one exported constant. Put the work in a `@Processor(QUEUE_NAME)` class that extends `WorkerHost` and implements `process(job)`, and enqueue from a service with `@InjectQueue(QUEUE_NAME)`.
- Jobs can run more than once because of retries, so make processors idempotent. Put plain JSON in the job data (ids, not entities) and load fresh data in the processor.
- **In tests, override both the queue and its processor**: a registered queue opens a Redis connection and a `@Processor` starts a worker. Use `overrideProvider(getQueueToken(QUEUE_NAME)).useValue({ add: jest.fn() })` and `overrideProvider(MyProcessor).useValue({})`. Overriding only the queue makes the worker fail at startup with `Worker requires a connection`. Every spec that boots `AppModule` needs these overrides once a queue exists, including `test/app.e2e-spec.ts`, `src/app.module.spec.ts` and the specs `ironveil generate resource` wrote.
- Workers finish their current job and close on SIGTERM through the shutdown hooks in `main.ts`; keep `enableShutdownHooks()`.

## API documentation

- Swagger UI is served at `/api/docs` (JSON at `/api/docs-json`), configured in `src/infrastructure/swagger/swagger.setup.ts`.
- Every controller needs `@ApiTags`, every route `@ApiOperation`, and DTO fields `@ApiProperty` / `@ApiPropertyOptional` so the generated docs stay accurate. The Nest CLI Swagger plugin is **not** enabled, so undecorated fields do not appear.

## Testing

- **Unit tests** (Jest, `ts-jest`) sit next to the code as `*.spec.ts`, e.g. `src/modules/products/products.service.spec.ts`. Mock `PrismaService` rather than hitting a database.
- **E2E tests** live in `test/` as `*.e2e-spec.ts` and boot the full `AppModule` with `supertest`. The template overrides `PrismaService` and `RedisService` with mocks, so they need no database; follow that pattern and add `overrideProvider` mocks for whatever your tests call.
- `src/app.module.spec.ts` compiles the whole dependency tree; if you add a module and this test breaks, you have a missing provider or import.
- Test behavior (status codes, returned shape, thrown exceptions), not implementation details. Every new service method and endpoint needs a test.

## Do not

- Do not put business logic in controllers or Prisma calls outside services.
- Do not read `process.env` outside `src/infrastructure/config/`.
- Do not bypass the `ValidationPipe`, the exception filter or the logger.
- Do not edit `src/generated/` or already-applied migrations.
- Do not commit `.env` or any real secret (`.env*` is git-ignored except `.env.example`, which holds placeholders only).
- Do not remove the global guards or mark routes `@Public()` just to make a test pass.
- Do not add a dependency for something Node or an already-installed package provides.
