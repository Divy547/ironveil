# AGENTS.md

Guidance for AI coding agents working on **snapshot-api**, a NestJS 11 + TypeScript backend with Prisma and PostgreSQL. Read this before changing code and follow it so new code matches the existing style.

## Architecture

```
src/
├── main.ts                  # bootstrap: logger, shutdown hooks, security, ValidationPipe
├── app.module.ts            # root module: imports CommonModule, InfrastructureModule and every feature module
├── common/                  # cross-cutting, framework-level code with no business logic
│   ├── common.module.ts
│   └── filters/all-exceptions.filter.ts
├── infrastructure/          # adapters to the outside world (config, DB, cache, logging, security)
│   ├── infrastructure.module.ts
│   ├── config/              # configuration.ts (typed config) + environment.ts (zod env validation)
│   ├── logging/
│   ├── security/
│   └── prisma/              # global PrismaModule / PrismaService
└── modules/                 # business features, one folder per feature
    └── health/              # /health and /health/ready
```

Where code belongs:

- **`src/modules/<feature>/`**: everything a feature needs (module, controller, service, `dto/`, `types/`, its tests). This is where almost all new code goes. A feature may import another feature's module and use what it exports, but must not import its internals.
- **`src/infrastructure/`**: integrations with external systems and process-wide setup. Changes here are rare; add a new folder only for a new external dependency (queue, mailer, storage). `PrismaModule` is `@Global()`, so inject `PrismaService` directly without importing the module.
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
npx prisma migrate dev --name <change>  # create + apply a migration after editing schema.prisma
npx prisma migrate deploy               # apply existing migrations (CI / production)
```

Before you call a task finished, run `npm run lint` && `npm run typecheck` && `npm run build` and fix everything they report.

## How to add a module

Example: a `products` feature.

1. Create `src/modules/products/` with `products.module.ts`, `products.controller.ts`, `products.service.ts` and a `dto/` folder. Use kebab-case file names and plural, lowercase route paths.
2. Declare the controller and service in `@Module({ controllers, providers })`. Add `exports: [ProductsService]` only if another module needs it.
3. Import `ProductsModule` in `src/app.module.ts` (both the `import` statement and the `imports: [...]` array). A module that is not registered there is never loaded.
4. Keep controllers thin: parse input through DTOs, call the service, return the result. Business rules and Prisma calls live in the service.
5. This project has no authentication, so routes are open.

## How to add a Prisma model

1. Add the `model` to `prisma/schema.prisma`. Follow the existing style: `id String @id @default(cuid())`, `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`, singular PascalCase names, and `@@index` on foreign keys.
2. Create and apply the migration with `npx prisma migrate dev --name <change>`. This writes a new folder under `prisma/migrations/` and regenerates the client. Commit the migration together with the schema change.
3. Never edit a migration that has already been applied or committed; add a new one instead.
4. Use the model through the global `PrismaService` (`this.prisma.product.findMany(...)`) inside a service, never in a controller.

## How to add an endpoint

1. Create a DTO in the module's `dto/` folder as a class with `class-validator` decorators and `!` on required fields. The global `ValidationPipe` runs with `whitelist`, `forbidNonWhitelisted` and `transform`, so unknown properties are rejected and every accepted field **must** have a decorator.
2. Add the service method first, then a controller method that calls it: `@Post()`, `@Get(':id')`, etc., with `@Body() dto: CreateProductDto`.
3. Signal failures by throwing Nest HTTP exceptions (`NotFoundException`, `ConflictException`, ...). Do not catch them to build custom responses.

## Conventions

- **Validation**: DTO classes with `class-validator`; never trust `req.body` directly. Environment variables are validated at boot with zod in `src/infrastructure/config/environment.ts`.
- **Configuration**: read settings through `ConfigService` (`configService.get('port')`, typed by `AppConfig` in `configuration.ts`), not `process.env`. A new env var needs all of: an entry in the zod schema in `environment.ts`, an entry in `configuration.ts`, and a line in `.env.example`. The app refuses to boot if one is missing, which is intended.
- **Errors**: throw Nest exceptions. `AllExceptionsFilter` turns everything into `{ statusCode, message, error, requestId, timestamp }`; Prisma `P2002` becomes 409 and `P2025` becomes 404; unexpected errors become a generic 500 with details only in the logs. Do not return error bodies by hand.
- **Logging**: inject `Logger` from `@nestjs/common` (pino is wired in behind it). Never use `console.log`. Never log tokens, passwords or full request bodies; `authorization`, `cookie`, `password` and token fields are redacted, but only for the known paths in `logging.module.ts`.
- **Style**: Prettier (single quotes, trailing commas) and ESLint run on `src/` and `test/`. Prefer `import type` for type-only imports. Return DTO-shaped or `select`ed objects, never raw Prisma rows containing secrets.
- **Dependencies**: add them with the package manager above so the lockfile stays in sync.

## Testing

This project was generated without a test runner. Ask before adding one, and at minimum keep `lint`, `typecheck` and `build` green.

## Do not

- Do not put business logic in controllers or Prisma calls outside services.
- Do not read `process.env` outside `src/infrastructure/config/`.
- Do not bypass the `ValidationPipe`, the exception filter or the logger.
- Do not edit `src/generated/` or already-applied migrations.
- Do not commit `.env` or any real secret (`.env*` is git-ignored except `.env.example`, which holds placeholders only).
- Do not add a dependency for something Node or an already-installed package provides.
