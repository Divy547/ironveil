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
- **Pre-configured Production Foundations**: Type-safe configuration, Prisma with PostgreSQL, Redis infrastructure, Swagger/OpenAPI setup, Jest unit/e2e testing, Docker containerization, and GitHub Actions CI.

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
| `--redis` | | Include Redis client module and infrastructure | `false` |
| `--no-swagger` | | Disable Swagger (OpenAPI) documentation setup (enabled by default) | Enabled (`true`) |
| `--no-docker` | | Disable Dockerfile, `.dockerignore`, and `docker-compose.yml` (enabled by default) | Enabled (`true`) |
| `--no-ci` | | Disable GitHub Actions CI workflow (enabled by default) | Enabled (`true`) |
| `--no-testing` | | Disable Jest unit and E2E test configuration (enabled by default) | Enabled (`true`) |
| `-h, --help` | `-h` | Display help for the command | |

#### Global Options

```bash
ironveil --help       # Display CLI usage and command list
ironveil --version    # Output installed version (0.2.0)
```

---

## Generated Features

Every generated project includes a tailored `package.json`, environment configuration, and clean modular structure:

- **Core NestJS Foundation**: NestJS 11 application with modular separation of concerns (`common/`, `infrastructure/`, `modules/`).
- **PostgreSQL & Prisma ORM**: Fully configured Prisma schema, client module, service lifecycle hooks, and initial migration SQL.
- **Type-Safe Configuration**: Environment variable validation powered by `@nestjs/config` and clean configuration loaders.
- **JWT Authentication (`--auth jwt`)**: Complete authentication module with Passport JWT strategy, auth guard, login/register DTOs with `class-validator`, password hashing with `bcrypt`, and Auth controller/service.
- **Redis Infrastructure (`--redis`)**: Configured `ioredis` service and infrastructure module ready for caching and session management.
- **Swagger / OpenAPI Documentation**: OpenAPI specification setup configured in `src/infrastructure/swagger/` and bootstrapped in `main.ts`. (Enabled by default; disable with `--no-swagger`.)
- **Docker & Docker Compose**: Production multi-stage `Dockerfile`, optimized `.dockerignore`, and `docker-compose.yml` configuring PostgreSQL and Redis containers. (Enabled by default; disable with `--no-docker`.)
- **Jest Unit & E2E Testing**: Pre-configured `jest.config.ts`, unit test suite (`app.module.spec.ts`), E2E test harness (`test/app.e2e-spec.ts`), and Jest E2E configuration. (Enabled by default; disable with `--no-testing`.)
- **GitHub Actions CI**: Pre-built `.github/workflows/ci.yml` matrix pipeline running typecheck, unit tests, and build on pull requests and pushes. (Enabled by default; disable with `--no-ci`.)
- **Tailored README**: Generated projects receive their own customized `README.md` containing prerequisite instructions, setup steps, environment variable tables, and scripts specific to the chosen package manager and features.

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
│   │   └── common.module.ts       # Shared application utilities
│   ├── infrastructure/
│   │   ├── config/
│   │   │   ├── configuration.ts   # Configuration loader
│   │   │   └── environment.ts     # Environment schema validation
│   │   ├── prisma/
│   │   │   ├── prisma.module.ts   # Prisma infrastructure module
│   │   │   └── prisma.service.ts  # Database connection lifecycle
│   │   ├── redis/                 # Redis infrastructure (optional)
│   │   │   ├── redis.module.ts
│   │   │   └── redis.service.ts
│   │   ├── swagger/               # Swagger setup (optional)
│   │   │   └── swagger.setup.ts
│   │   └── infrastructure.module.ts
│   ├── modules/
│   │   └── auth/                  # JWT Authentication (optional)
│   │       ├── dto/
│   │       │   ├── login.dto.ts
│   │       │   └── register.dto.ts
│   │       ├── guards/
│   │       │   └── jwt-auth.guard.ts
│   │       ├── strategies/
│   │       │   └── jwt.strategy.ts
│   │       ├── types/
│   │       │   └── jwt-payload.type.ts
│   │       ├── auth.controller.ts
│   │       ├── auth.module.ts
│   │       └── auth.service.ts
│   ├── app.module.ts              # Root application module
│   └── main.ts                    # Application entrypoint
├── test/
│   ├── app.e2e-spec.ts            # Application E2E test suite
│   └── jest-e2e.json              # E2E Jest configuration
├── .dockerignore
├── .env.example
├── Dockerfile                     # Multi-stage production build
├── docker-compose.yml             # Local service orchestration
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
git clone <repository-url>
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

# Run unit tests (33 test files, 249 tests)
pnpm test

# Run build
pnpm run build

# Run release verification E2E test suite
pnpm exec vitest run test/e2e/release.e2e.test.ts

# Run full E2E test suite (13 test files, 41 tests)
pnpm run test:e2e
```

---

## Contributing

Contributions are welcome! Please review [CONTRIBUTING.md](CONTRIBUTING.md) for architectural guidelines, pull request processes, and development requirements.

---

## Project Status

Ironveil is currently at version **`0.2.0`**. All features documented in this README are implemented, tested, and verified against real project lifecycles.

---

## License

This project is licensed under the [MIT License](LICENSE).
