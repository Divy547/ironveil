# Ironveil

**Ironveil** is an opinionated developer productivity CLI for bootstrapping production-ready NestJS backend services.

Instead of piecing together configurations, database setups, authentication modules, caching layers, and container configurations by hand, Ironveil generates a complete, clean, and fully configured NestJS application with a single deterministic command.

---

## Why Ironveil?

Starting a production-grade backend service typically requires hours of manual setup: configuring Prisma schemas and migrations, wiring environment variable validation, setting up JWT strategies and guards, integrating Redis caching clients, configuring Swagger documentation, writing Dockerfiles and multi-service Docker Compose files, setting up testing harnesses, and writing GitHub Actions CI pipelines.

Ironveil solves this by providing:

- **Opinionated Architecture**: Clean modular architecture separating `common`, `infrastructure`, and domain `modules`.
- **Zero Lock-in**: Generated projects are 100% standalone standard NestJS applications with zero runtime dependencies on Ironveil.
- **Safety First**: Atomic staging directory generation guarantees that failed generations never leave partial files or corrupted directories on disk.
- **Package Manager Choice**: Full support for `npm`, `pnpm`, and `yarn` with tailored scripts, command mappings, and clean lockfile generation.
- **Production Foundations Out of the Box**: validated configuration, health checks, structured logging, security defaults, a consistent error shape and graceful shutdown, on top of Prisma with PostgreSQL, optional Redis and JWT auth, Swagger/OpenAPI, Jest testing, Docker, ESLint/Prettier and GitHub Actions CI.
- **Verified, Not Just Generated**: an end-to-end matrix installs, lints, builds, boots and shuts down real generated projects (including `/health` and a clean SIGTERM exit), so what you get is known to work.

---

## Installation

Run Ironveil directly with your package runner of choice without installing globally:

```bash
# Using npm
npx ironveil create my-api

# Using pnpm
pnpm dlx ironveil create my-api

# Using yarn
yarn dlx ironveil create my-api
```

Or install Ironveil globally:

```bash
npm install -g ironveil
# or
pnpm add -g ironveil
# or
yarn global add ironveil
```

---

## Quick Start

### 1. Interactive Mode

Run the `create` command with a project name to walk through the interactive configuration prompt:

```bash
ironveil create my-api
```

### 2. Non-Interactive Mode (Defaults)

Use the `-y` or `--yes` flag to skip prompts and scaffold a production-ready NestJS backend with standard defaults:

```bash
ironveil create my-api --yes
```

### 3. Customized Scaffolding

Enable or disable specific features directly via command-line flags:

```bash
ironveil create my-api --yes \
  --auth jwt \
  --redis \
  --package-manager pnpm
```

---

## CLI Reference

### `ironveil create <project-name> [options]`

Create a new NestJS backend application in a directory matching `<project-name>`.

#### Available Options

| Option | Short | Description | Default |
| :--- | :--- | :--- | :--- |
| `-y, --yes` | `-y` | Skip interactive prompts and apply default or specified options | `false` |
| `--non-interactive` | | Run in non-interactive mode | `false` |
| `--dry-run` | | Simulate generation without writing any files to disk | `false` |
| `-p, --package-manager <pm>` | `-p` | Package manager to configure: `npm`, `pnpm`, or `yarn` | `npm` |
| `--auth <type>` | | Authentication module: `none` or `jwt` | `none` |
| `--ai <mode>` | | AI agent files: `none`, `agents` (`AGENTS.md` + `CLAUDE.md`) or `all` (also `.cursor/rules/*.mdc` and `.github/copilot-instructions.md`) | `agents` |
| `--redis` | | Include Redis client module and infrastructure | `false` |
| `--queue` | | Include a BullMQ job queue (`@nestjs/bullmq`); requires `--redis` | `false` |
| `--mail` | | Include email sending over SMTP (`nodemailer`) | `false` |
| `--no-swagger` | | Disable Swagger (OpenAPI) documentation setup (enabled by default) | Enabled (`true`) |
| `--no-docker` | | Disable Dockerfile, `.dockerignore`, and `docker-compose.yml` (enabled by default) | Enabled (`true`) |
| `--no-ci` | | Disable GitHub Actions CI workflow (enabled by default) | Enabled (`true`) |
| `--no-testing` | | Disable Jest unit and E2E test configuration (enabled by default) | Enabled (`true`) |
| `-h, --help` | `-h` | Display help for the command | |

#### Global Options

```bash
ironveil --help       # Display CLI usage and command list
ironveil --version    # Output installed version (0.3.0)
```

---

### `ironveil generate resource <name> [options]`

Run inside a project created with `ironveil create` (any subdirectory works; the project is found through `ironveil.json`). Generates a complete CRUD feature and registers it:

```bash
ironveil generate resource product --fields "name:string price:decimal stock:int description:text?"
```

| Option | Description |
| --- | --- |
| `--fields <spec>` | Fields as `name:type`, a trailing `?` makes one optional. Types: `string`, `text`, `int`, `float`, `decimal` (`DECIMAL(12,2)`), `boolean`, `datetime` (ISO 8601 string). Repeatable. Without it, an interactive terminal asks for fields one by one. |
| `--auth <policy>` | Who may call the routes; needs a project with JWT auth. `user` (default): any valid token. `admin-writes`: any token to read, `@Roles(Role.ADMIN)` to create, update and delete. `public-read`: reads are `@Public()`, writes are admin only. `admin`: every route admin only. The decorators go on each route, and the generated e2e test checks the policy (401 without a token, 403 for a normal user). The choice is recorded in `ironveil.json`. |
| `-y, --yes` | Do not prompt for fields. |
| `--dry-run` | Print the planned files and a diff; write nothing. |
| `--force` | Run even though the git working tree has uncommitted changes. |

Give the **singular** name (`product`, `blog-post`); the module, route and table use the plural. It creates `src/modules/products/` (module, controller, service, create/update DTOs, a service unit test), `test/products.e2e-spec.ts`, a Prisma model plus a matching migration, shared `src/common/pagination/` helpers (`GET /products?page=1&limit=20` returns `{ data, meta }`), and adds `ProductsModule` to `AppModule`. Swagger decorators are added when Swagger is enabled, and the e2e test signs a real JWT when `--auth jwt` is on.

Safety: it refuses to run on a dirty git tree unless `--force` is given, never overwrites a file you changed, refuses a name whose Prisma model already exists, and is a no-op when the resource is already generated. Afterwards run `db:generate` and `db:migrate`.

### `ironveil generate module|controller|service|guard|dto <name> [options]`

The smaller building blocks, for when you need one file and not a whole CRUD resource. Same rules as `generate resource` (run from anywhere in the project, `--dry-run` and `--force`, never overwrites your code, a no-op when already generated), but the name is used **as typed** and is never pluralised.

```bash
ironveil generate service billing                          # src/modules/billing/billing.service.ts (+ the module, if missing)
ironveil generate controller billing                       # registered in BillingModule
ironveil generate service tax-calculator --module billing  # into an existing feature module
ironveil generate guard api-key                            # src/common/guards/api-key.guard.ts
ironveil generate dto create-invoice --fields "number:string total:decimal note:text?"
```

| Command | Writes | Registers it in |
| --- | --- | --- |
| `module <name>` | `src/modules/<name>/<name>.module.ts`, an empty `@Module({})` | `AppModule` |
| `controller <name>` | `<feature>/<name>.controller.ts`, routed at `/<name>` (Swagger tags when enabled) | the feature's module `controllers` |
| `service <name>` | `<feature>/<name>.service.ts` | the feature's module `providers` |
| `guard <name>` | `src/common/guards/<name>.guard.ts`; it **rejects every request** until you write its rule | nothing: apply it with `@UseGuards()` |
| `dto <name>` | `src/common/dto/<name>.dto.ts`; `--fields` adds validated properties | nothing: import it where needed |

`<feature>` is the name itself, and its module is created and added to `AppModule` when it does not exist. `--module <name>` puts a controller, service, guard or DTO into an existing feature instead (`src/modules/<name>/`, with guards and DTOs under `guards/` and `dto/`); it fails with a pointer to `generate module` when that module is missing. `--fields` only applies to `dto` and takes the same syntax as `generate resource`. A unit test is written for controllers, services and guards when testing is enabled.

### `ironveil add <feature> [mode]`

Adds a feature to a project you already created, by generating what `create` would have generated and merging the difference into your files. `ironveil add testing` gives the same project as `ironveil create --testing` would have.

```bash
ironveil add testing          # jest config, specs, test scripts and dev dependencies
ironveil add docker           # Dockerfile, .dockerignore, docker-compose.yml, docker:up / docker:down
ironveil add ci               # .github/workflows/ci.yml
ironveil add swagger          # @nestjs/swagger, the /api/docs setup, main.ts and CSP wiring
ironveil add redis            # ioredis service and module, readiness check, REDIS_URL, docker-compose service
ironveil add queue            # BullMQ job queue on the project's Redis (needs redis; run `add redis` first)
ironveil add mail             # SMTP email through an injectable MailService (nodemailer)
ironveil add auth             # JWT auth module, global guard, roles, and a new Prisma migration
ironveil add ai               # AGENTS.md + CLAUDE.md   (ironveil add ai all: + Cursor and Copilot files)
```

Available: `ci`, `ai`, `docker`, `testing`, `swagger`, `redis`, `auth`, `queue`, `mail`. It accepts `--dry-run` and `--force` like `generate`.

How your own changes are treated: a file you never touched is replaced; a file you edited is three-way merged, so your edits stay; `package.json` is merged as JSON (your dependencies and scripts stay); `ironveil.json` keeps your recorded resources. If an edit of yours overlaps with what the feature needs, or a file it wants to create already exists with different content, `add` stops, lists the files and writes **nothing**. `add` never edits your own `.env`: after `add redis`, copy `REDIS_URL` from `.env.example` into it (the app validates it at boot). Resources generated before `add swagger` keep working but have no Swagger decorators, and `add` says so. A `README.md` or `AGENTS.md` you rewrote is left as it is, with a note. It never installs anything: it prints the install command, and warns when the project was created by a different Ironveil version. Adding a feature that is already enabled does nothing, and features are never removed.

**`add auth` and your database.** It never edits `prisma/migrations/0001_init` (it has probably run already): the `Role` enum, the `role` column on `User` (existing users become `USER`) and the `RefreshToken` table go into a **new** `prisma/migrations/<timestamp>_add_auth/migration.sql`, and `schema.prisma` gets the same changes. Before it writes anything it checks that `schema.prisma` has a `model User` without a `role` field, that no `Role` or `RefreshToken` exists yet, and that your migrations create the `User` table; otherwise it stops and lists what is wrong. Then run `db:generate`, `db:migrate` (`prisma migrate dev` also confirms the schema and migrations agree), copy the three `JWT_*` variables into your `.env` and set a `JWT_SECRET` of at least 32 characters. The global guard protects **every** route, so resources generated earlier now require a token: `add auth` updates their controller and e2e spec (the spec now signs in and checks the 401), and records the `user` policy for each in `ironveil.json`. A spec you changed in the same place is left as it is, with a note. Nobody is an admin yet: promote one with SQL (`UPDATE "User" SET role = 'ADMIN' WHERE email = '...'`).

---

## Generated Features

Every generated project includes a tailored `package.json`, environment configuration, and clean modular structure.

### Always included

- **Core NestJS Foundation**: NestJS 11 application with modular separation of concerns (`common/`, `infrastructure/`, `modules/`).
- **Environment Validation**: A zod schema checked at boot. A missing or malformed variable stops the app with one error that lists every problem, and `.env.example` always matches the schema.
- **Health Checks**: `GET /health` (liveness) and `GET /health/ready` (readiness: PostgreSQL, plus Redis when enabled) via `@nestjs/terminus`. The Docker `HEALTHCHECK` uses it.
- **Structured Logging**: `nestjs-pino` with pretty output in development and JSON elsewhere, a request ID on every request (`x-request-id` is reused or generated and echoed), redaction of `authorization`, cookies, passwords and tokens, and a `LOG_LEVEL` setting.
- **Security Defaults**: `helmet` headers, CORS driven by `CORS_ORIGINS` (off until configured), and global rate limiting with `@nestjs/throttler` (`THROTTLE_LIMIT`, `THROTTLE_TTL_MS`). Health routes are exempt from throttling.
- **Global Error Handling**: One JSON error shape for every failure (`statusCode`, `message`, `error`, `requestId`, `timestamp`). Prisma `P2002` becomes `409` and `P2025` becomes `404`; unexpected errors return a generic `500` and are logged with the request ID.
- **Graceful Shutdown**: `enableShutdownHooks()` so SIGTERM/SIGINT disconnect Prisma (and Redis) cleanly before exit.
- **PostgreSQL & Prisma ORM**: Prisma schema, client module, service lifecycle hooks, and initial migration SQL.
- **Lint & Format**: ESLint 9 flat config with type-aware `typescript-eslint`, Prettier config, and `lint`, `lint:fix` and `format` scripts.
- **`AGENTS.md` for AI coding agents**: A project-specific guide (plus a `CLAUDE.md` that imports it) that tells Claude Code, Cursor, Copilot and other agents the architecture (`common/` vs `infrastructure/` vs `modules/`), the exact commands for your package manager, step-by-step recipes for adding a module, Prisma model and endpoint, and the conventions to follow. Sections only appear for the features you enabled.
- **Tailored README**: Generated projects get their own `README.md` with setup steps, an environment variable table, and commands for the chosen package manager and features (including health, error, logging and security behavior).

### Optional

- **JWT Authentication (`--auth jwt`)**: Passport JWT with short-lived access tokens and **rotating refresh tokens** (reuse of an old token revokes the whole session). Endpoints: `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout` and `GET /auth/me`. A global guard protects **every route unless it is marked `@Public()`**, with `@Roles()` + `RolesGuard` for `USER`/`ADMIN` access and a `@CurrentUser()` decorator. Passwords are hashed with `bcrypt`.
- **Redis Infrastructure (`--redis`)**: Configured `ioredis` service and module, included in the readiness check.
- **Job queue (`--queue`, needs `--redis`)**: BullMQ through `@nestjs/bullmq`. `QueueModule` holds the shared connection (built from `REDIS_URL`) and default job options (3 attempts, exponential backoff, finished jobs trimmed); you register a queue and a `@Processor` in the feature module that owns them. Workers finish their current job and close on SIGTERM. Because a registered queue connects to Redis, specs that boot `AppModule` must override the queue and its processor; the generated `AGENTS.md` and README explain how.
- **Email (`--mail`)**: SMTP sending through nodemailer. `MailModule` is global and built from the `MAIL_*` variables (validated at boot); inject `MailService` and call `send({ to, subject, text | html })`. Messages are validated (recipient, subject without line breaks, a body), and a failed send rejects so the caller decides what to do. With Docker the compose file adds Mailpit, a local SMTP catcher with an inbox at `http://localhost:8025`. Mail is not part of the readiness check. Specs that call it override `MailService`; nothing else needs overriding.
- **Swagger / OpenAPI Documentation**: Set up in `src/infrastructure/swagger/` and served at `/api/docs`. Enabled by default; disable with `--no-swagger`.
- **Docker & Docker Compose**: Multi-stage `Dockerfile` with a health check, `.dockerignore`, and `docker-compose.yml` for the API, PostgreSQL and Redis. Enabled by default; disable with `--no-docker`.
- **Jest Unit & E2E Testing**: `jest.config.ts`, a unit test (`app.module.spec.ts`), and an E2E harness (`test/app.e2e-spec.ts`). Enabled by default; disable with `--no-testing`.
- **GitHub Actions CI**: `.github/workflows/ci.yml` running lint, typecheck, unit tests, and build on pull requests and pushes. Enabled by default; disable with `--no-ci`.

---

## Package Manager Support

Ironveil supports **npm**, **pnpm**, and **yarn**.

When scaffolding a project with `-p, --package-manager <npm|pnpm|yarn>`, Ironveil automatically configures:
- The appropriate `packageManager` field in `package.json` (for `pnpm` and `yarn`).
- Clean lockfile generation for your chosen tool without extra or conflicting lockfiles.
- Package manager specific run and exec commands (e.g. `npx prisma`, `pnpm exec prisma`, or `yarn prisma`).
- Customized setup and development instructions in the generated project's `README.md`.
- Compatible GitHub Actions CI workflow steps for dependency installation and caching.

---

## Generated Project Architecture

A project generated with full features enabled (`--auth jwt --redis`) presents the following layout:

```text
my-api/
├── .github/
│   └── workflows/
│       └── ci.yml                 # GitHub Actions CI workflow
├── prisma/
│   ├── migrations/
│   │   └── 0001_init/
│   │       └── migration.sql      # Initial schema migration
│   └── schema.prisma              # Prisma schema definition
├── src/
│   ├── common/
│   │   ├── filters/
│   │   │   └── all-exceptions.filter.ts  # Consistent error shape
│   │   └── common.module.ts       # Shared application utilities
│   ├── infrastructure/
│   │   ├── config/
│   │   │   ├── configuration.ts   # Configuration loader
│   │   │   └── environment.ts     # Environment schema validation
│   │   ├── logging/
│   │   │   └── logging.module.ts  # nestjs-pino, request IDs, redaction
│   │   ├── mail/                  # SMTP email (optional)
│   │   │   ├── mail.module.ts     # nodemailer transport from MAIL_* settings
│   │   │   ├── mail.service.ts    # MailService.send()
│   │   │   └── mail-options.ts    # settings -> SMTP options, message validation
│   │   ├── prisma/
│   │   │   ├── prisma.module.ts   # Prisma infrastructure module
│   │   │   └── prisma.service.ts  # Database connection lifecycle
│   │   ├── queue/                 # BullMQ job queue (optional, needs Redis)
│   │   │   ├── queue.module.ts    # shared connection + default job options
│   │   │   └── redis-connection.ts # REDIS_URL -> BullMQ connection options
│   │   ├── redis/                 # Redis infrastructure (optional)
│   │   │   ├── redis.module.ts
│   │   │   └── redis.service.ts
│   │   ├── security/
│   │   │   ├── security.module.ts # Global rate limiting
│   │   │   └── security.setup.ts  # helmet + CORS
│   │   ├── swagger/               # Swagger setup (optional)
│   │   │   └── swagger.setup.ts
│   │   └── infrastructure.module.ts
│   ├── modules/
│   │   ├── health/                # /health and /health/ready
│   │   │   ├── health.controller.ts
│   │   │   ├── health.module.ts
│   │   │   ├── prisma.health.ts
│   │   │   └── redis.health.ts    # Redis only
│   │   └── auth/                  # JWT Authentication (optional)
│   │       ├── decorators/        # @Public(), @Roles(), @CurrentUser()
│   │       ├── dto/               # login, register, refresh-token
│   │       ├── guards/            # jwt-auth.guard, roles.guard
│   │       ├── strategies/
│   │       │   └── jwt.strategy.ts
│   │       ├── types/
│   │       ├── auth.controller.ts
│   │       ├── auth.module.ts
│   │       └── auth.service.ts
│   ├── app.module.ts              # Root application module
│   ├── app.module.spec.ts         # Unit test (testing enabled)
│   └── main.ts                    # Application entrypoint
├── test/
│   ├── app.e2e-spec.ts            # Application E2E test suite
│   └── jest-e2e.json              # E2E Jest configuration
├── .dockerignore
├── .env.example
├── .prettierignore
├── .prettierrc
├── AGENTS.md                      # Guide for AI coding agents
├── CLAUDE.md                      # Imports AGENTS.md for Claude Code
├── Dockerfile                     # Multi-stage production build
├── docker-compose.yml             # Local service orchestration
├── eslint.config.mjs              # ESLint flat config
├── ironveil.json                  # Project manifest (version, features) read by later commands
├── jest.config.ts                 # Unit test configuration
├── nest-cli.json
├── package.json
├── README.md                      # Generated project documentation
├── tsconfig.build.json
└── tsconfig.json
```

---

## Development Setup

To contribute to Ironveil or run it from source:

### Prerequisites

- **Node.js**: `>= 22`
- **pnpm**: `11.21.0`

### Setup

```bash
# Clone repository
git clone https://github.com/Divy547/ironveil.git
cd ironveil

# Install dependencies
pnpm install

# Run in development mode
pnpm dev create test-app --yes
```

---

## Testing & Verification

Ironveil contains a comprehensive test suite covering unit behavior, template rendering, manifest validation, matrix generation lifecycles, and packaged npm release verification:

```bash
# Run TypeScript typecheck
pnpm run typecheck

# Run unit tests (74 test files, 1074 tests)
pnpm test

# Run build
pnpm run build

# Run release verification E2E test suite
pnpm exec vitest run test/e2e/release.e2e.test.ts

# Run the full E2E suite (slow: real installs, builds and boots)
# Needs PostgreSQL on localhost:5432 and Redis on localhost:6379
pnpm run test:e2e        # serial
pnpm run test:e2e:fast   # 3 workers, ~half the time
```

---

## Contributing

Contributions are welcome! Please review [CONTRIBUTING.md](CONTRIBUTING.md) for architectural guidelines, pull request processes, and development requirements.

---

## Project Status

Ironveil is currently at version **`0.3.0`**. All features documented in this README are implemented, tested, and verified against real project lifecycles.

---

## License

This project is licensed under the [MIT License](LICENSE).
