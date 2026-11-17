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
│   │   ├── prisma/
│   │   │   ├── prisma.module.ts   # Prisma infrastructure module
│   │   │   └── prisma.service.ts  # Database connection lifecycle
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

# Run unit tests (45 test files, 379 tests)
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
