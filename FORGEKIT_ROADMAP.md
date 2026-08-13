# ForgeKit — End-to-End Development Roadmap

> An opinionated developer productivity CLI for bootstrapping production-ready NestJS backends.

## 1. Vision

ForgeKit is designed to turn the process of starting a production-grade NestJS backend from a repetitive manual setup into a single, deterministic command.

The intended experience is:

```bash
pnpm dlx forgekit create my-api
```

or:

```bash
forgekit create my-api --redis --auth jwt
```

ForgeKit should generate a complete, opinionated backend based on the selected configuration.

The generated project should not be a basic CRUD starter.

It should provide a production-oriented foundation containing things such as:

- NestJS architecture
- PostgreSQL
- Prisma
- configuration management
- structured logging
- Swagger
- Redis
- JWT authentication
- Docker
- GitHub Actions
- testing infrastructure
- environment validation
- common backend utilities

Features must be composable and generated only when requested.

---

# 2. Final Product Goal

The final user experience should look approximately like:

```bash
forgekit create my-api
```

Interactive configuration:

```text
Project name: my-api

Database
  PostgreSQL

ORM
  Prisma

Redis?
  Yes

Authentication
  JWT

Swagger?
  Yes

Docker?
  Yes

GitHub Actions?
  Yes

Testing?
  Yes

Package manager
  pnpm
```

ForgeKit should then generate:

```text
my-api/
├── .github/
│   └── workflows/
│       └── ci.yml
│
├── src/
│   ├── common/
│   │   ├── decorators/
│   │   ├── filters/
│   │   ├── guards/
│   │   ├── interceptors/
│   │   ├── pipes/
│   │   └── ...
│   │
│   ├── infrastructure/
│   │   ├── config/
│   │   ├── logger/
│   │   ├── prisma/
│   │   ├── redis/
│   │   └── swagger/
│   │
│   ├── modules/
│   │   └── auth/
│   │
│   ├── app.module.ts
│   └── main.ts
│
├── prisma/
│   └── schema.prisma
│
├── test/
│
├── .env.example
├── .gitignore
├── Dockerfile
├── docker-compose.yml
├── nest-cli.json
├── package.json
├── README.md
├── tsconfig.json
└── tsconfig.build.json
```

The generated project should be able to:

```text
install
build
test
lint
start
run Docker
run CI
connect to PostgreSQL
connect to Redis
authenticate users
serve Swagger
```

depending on the selected features.

---

# 3. Design Principles

## 3.1 Opinionated

ForgeKit should make reasonable architectural decisions instead of exposing every possible option.

The goal is:

```text
less configuration
+
better defaults
+
consistent architecture
```

not maximum number of flags.

## 3.2 Composable

Features should be independent.

For example:

```bash
forgekit create api --redis
```

should generate Redis support without requiring authentication.

Similarly:

```bash
forgekit create api --auth jwt
```

should generate authentication without requiring Redis.

## 3.3 Deterministic

The same configuration should produce essentially the same project structure.

Generation should not depend on:

- current working directory for template lookup
- random filesystem state
- globally installed tools
- Nest CLI scaffolding behavior

## 3.4 Production-oriented

ForgeKit is not intended to generate tutorial projects.

The generated project should demonstrate:

- separation of concerns
- modular architecture
- environment validation
- error handling
- logging
- testing
- maintainability
- deployment readiness

## 3.5 Testable

ForgeKit itself must be heavily tested.

We should test:

```text
CLI
configuration
generation
templates
feature composition
generated projects
```

The final project should have integration tests that actually generate and build projects.

---

# 4. Current Architecture

The current architecture is approximately:

```text
CLI
 │
 ▼
Configuration
 │
 ▼
Generation orchestration
 │
 ▼
GenerationContext
 │
 ├── FileSystem
 ├── TemplateLoader
 └── TemplateRenderer
 │
 ▼
BaseProjectGenerator
 │
 ▼
Generated NestJS project
```

---

# 5. Completed Work

## Phase 0 — Project Foundation

**Status: DONE**

Established the ForgeKit project from scratch.

Technology:

- Node.js
- TypeScript
- pnpm
- Commander
- Vitest
- Zod
- @clack/prompts

Initial project structure:

```text
forgekit/
├── bin/
├── src/
├── test/
├── package.json
├── pnpm-lock.yaml
└── tsconfig.json
```

The CLI became executable through:

```bash
forgekit --help
```

and:

```bash
forgekit create test-api
```

---

# 6. Phase 1 — Configuration System

**Status: DONE**

Created the central configuration model:

```ts
ForgeKitConfig {
  projectName
  database
  orm
  redis
  auth
  swagger
  docker
  ci
  testing
  packageManager
}
```

Current supported configuration:

```text
Database:
  postgres

ORM:
  prisma

Authentication:
  none
  jwt

Package manager:
  npm
```

Zod is used for configuration validation.

Example:

```text
invalid project name
        ↓
Zod validation
        ↓
ConfigError
```

Feature dependency validation was also introduced.

Example:

```text
JWT authentication
        ↓
requires PostgreSQL + Prisma
```

Configuration tests were added.

---

# 7. Phase 2 — CLI and Interactive Mode

**Status: DONE**

Implemented:

```bash
forgekit create test-api
```

Interactive prompts are shown when no feature options are explicitly supplied.

Example:

```text
Enable Redis?
Authentication
Include Swagger?
Include Docker?
Include GitHub Actions?
Include testing?
```

Non-interactive usage works:

```bash
forgekit create test-api --redis --auth jwt
```

and:

```bash
forgekit create test-api --no-docker
```

ForgeKit correctly distinguishes:

```text
No explicit options
        ↓
Interactive mode
```

from:

```text
Explicit CLI options
        ↓
Non-interactive mode
```

This distinction is important for both developers and CI automation.

---

# 8. Phase 3A — Generation Engine

**Status: DONE**

Introduced the core generation abstractions.

```text
Generator
GenerationContext
FileSystem
GenerationError
```

The central generator contract is:

```ts
generator.generate(context)
```

The generator does not directly depend on Commander or the interactive CLI.

## 8.1 FileSystem abstraction

The filesystem abstraction provides:

```text
ensureDirectory()
writeFile()
readFile()
exists()
```

This keeps filesystem operations centralized.

It also makes testing easier because generators can operate through an abstraction rather than directly depending on filesystem APIs.

## 8.2 GenerationContext

The generation context currently contains:

```text
GenerationContext
├── config
├── destination
├── fs
├── loader
└── renderer
```

The context is frozen to prevent accidental mutation during generation.

---

# 9. Phase 3B — Template System

**Status: DONE**

Implemented:

```text
TemplateLoader
TemplateRenderer
Template path resolution
Template asset build pipeline
```

Templates live in:

```text
src/templates/
```

Example:

```text
src/templates/base/
├── README.md
├── nest-cli.json
├── package.json
├── tsconfig.build.json
├── tsconfig.json
└── src/
    ├── app.module.ts.template
    └── main.ts.template
```

The `.template` extension is intentional.

Template files are assets, not ForgeKit TypeScript source files.

## 9.1 Template rendering

Templates support placeholders such as:

```text
{{projectName}}
```

For example:

```md
# {{projectName}}
```

becomes:

```md
# my-api
```

## 9.2 Template packaging

TypeScript does not automatically copy template assets.

Therefore the build pipeline is:

```text
src/templates/
       │
       ▼
      tsc
       │
       +
copy template assets
       │
       ▼
dist/templates/
```

The build process also cleans `dist` first to avoid stale build artifacts.

Final package structure:

```text
dist/
├── src/
└── templates/
    └── base/
```

This allows ForgeKit to locate templates after being installed globally.

---

# 10. Phase 3C — Real NestJS Generation

**Status: DONE**

ForgeKit now generates a real NestJS project instead of simply printing configuration.

Generated baseline:

```text
test-api/
├── README.md
├── nest-cli.json
├── package.json
├── src/
│   ├── app.module.ts
│   └── main.ts
├── tsconfig.build.json
└── tsconfig.json
```

The generation flow is:

```text
ForgeKitConfig
      ↓
GenerationContext
      ↓
TemplateLoader
      ↓
TemplateRenderer
      ↓
BaseProjectGenerator
      ↓
FileSystem
      ↓
generated project
```

## 10.1 Generated project validation

The generated project was tested using:

```bash
npm install
```

followed by:

```bash
npm run build
```

and:

```bash
npm run start:prod
```

The NestJS application successfully:

```text
installed
compiled
started
```

This establishes the first complete end-to-end generation path.

---

# 11. Current Test Coverage

The ForgeKit test suite currently covers:

```text
CLI
Configuration
Create mode
FileSystem
Template loader
Template renderer
Generation context
Base project generator
Project generation
```

The current baseline has passed:

```text
21+ tests
```

The exact count may increase as development continues.

---

# 12. Phase 3D — Feature Generator Architecture

**Status: NEXT**

This is the next major architectural phase.

The current system has:

```text
BaseProjectGenerator
```

We need to evolve this into composable feature generators.

Target architecture:

```text
Generator
    │
    ├── BaseProjectGenerator
    ├── ConfigGenerator
    ├── PrismaGenerator
    ├── SwaggerGenerator
    ├── RedisGenerator
    ├── AuthGenerator
    ├── DockerGenerator
    ├── CIGenerator
    └── TestingGenerator
```

A generation plan should determine which generators execute.

Example:

```text
ForgeKitConfig
       ↓
GenerationPlan
       ↓
┌──────┼───────┬────────┬─────────┐
Base  Prisma  Swagger  Redis     Auth
```

## 12.1 Example

Configuration:

```text
redis = false
auth = none
swagger = true
docker = false
ci = true
testing = true
```

Generation plan:

```text
BaseGenerator
ConfigGenerator
PrismaGenerator
SwaggerGenerator
CIGenerator
TestingGenerator
```

Configuration:

```text
redis = true
auth = jwt
swagger = true
docker = true
ci = true
testing = true
```

Generation plan:

```text
BaseGenerator
ConfigGenerator
PrismaGenerator
SwaggerGenerator
RedisGenerator
AuthGenerator
DockerGenerator
CIGenerator
TestingGenerator
```

This prevents the main generator from becoming a large conditional block.

---

# 13. Phase 3E — Production NestJS Architecture

**Status: TODO**

The minimal NestJS structure will evolve into the opinionated ForgeKit architecture.

Target:

```text
src/
├── common/
├── infrastructure/
│   ├── config/
│   ├── logger/
│   ├── prisma/
│   └── swagger/
├── modules/
├── app.module.ts
└── main.ts
```

Potential common components:

```text
decorators
filters
guards
interceptors
pipes
middlewares
utilities
```

Infrastructure will contain cross-cutting systems such as:

```text
configuration
logging
database
Swagger
Redis
```

---

# 14. Phase 3F — Prisma + PostgreSQL

**Status: TODO**

Generate PostgreSQL + Prisma support.

Expected structure:

```text
prisma/
└── schema.prisma

src/infrastructure/prisma/
├── prisma.module.ts
└── prisma.service.ts
```

Generate environment configuration:

```text
DATABASE_URL=
```

Expected responsibilities:

```text
Prisma configuration
database connection
Prisma lifecycle
migration workflow
generated client
```

The generated project should be able to:

```bash
pnpm prisma generate
```

and eventually support migrations.

---

# 15. Phase 3G — Redis

**Status: TODO**

When Redis is enabled:

```bash
forgekit create my-api --redis
```

generate:

```text
src/infrastructure/redis/
├── redis.module.ts
├── redis.service.ts
└── ...
```

and environment configuration:

```text
REDIS_URL=
```

Redis dependencies should only be added when Redis is enabled.

If Redis is disabled:

```text
no Redis dependencies
no Redis module
no Redis configuration
no Redis Docker service
```

---

# 16. Phase 3H — JWT Authentication

**Status: TODO**

When:

```bash
forgekit create my-api --auth jwt
```

is used, generate a proper authentication module.

Potential structure:

```text
src/modules/auth/
├── auth.controller.ts
├── auth.service.ts
├── auth.module.ts
├── guards/
├── strategies/
├── decorators/
├── dto/
└── ...
```

Potential capabilities:

```text
password hashing
JWT access tokens
refresh tokens
authentication guards
authorization
roles
users
```

The exact scope should remain opinionated and production-oriented without becoming an unnecessarily large framework.

---

# 17. Phase 3I — Swagger

**Status: TODO**

When Swagger is enabled:

```text
src/infrastructure/swagger/
```

should contain Swagger-related configuration.

The application should expose:

```text
OpenAPI specification
Swagger UI
API metadata
authentication schemes
```

When Swagger is disabled:

```bash
forgekit create api --no-swagger
```

Swagger dependencies and configuration should not be generated.

---

# 18. Phase 3J — Docker

**Status: TODO**

When Docker is enabled, generate:

```text
Dockerfile
docker-compose.yml
.dockerignore
```

Docker Compose should reflect the selected feature set.

For example:

```text
Redis disabled
```

should not result in an unnecessary Redis container.

Potential Compose services:

```text
api
postgres
redis
```

depending on configuration.

---

# 19. Phase 3K — GitHub Actions / CI

**Status: TODO**

Generate:

```text
.github/
└── workflows/
    └── ci.yml
```

The CI pipeline should eventually perform:

```text
install
  ↓
lint
  ↓
typecheck
  ↓
test
  ↓
build
```

Potential future steps:

```text
Docker build
security checks
```

---

# 20. Phase 3L — Testing Infrastructure

**Status: TODO**

Generated projects should have a proper testing structure.

Potential structure:

```text
test/
├── unit/
└── e2e/
```

Potential tooling:

```text
Jest
Supertest
Nest TestingModule
```

ForgeKit itself should also gain integration tests that generate actual projects.

Instead of only testing:

```text
file exists
```

we should eventually test:

```text
generate
  ↓
install
  ↓
build
  ↓
test
```

---

# 21. Phase 3M — Package Manager Support

**Status: TODO**

Currently:

```text
packageManager = npm
```

Future support:

```text
npm
pnpm
yarn
bun
```

Potential usage:

```bash
forgekit create api --package-manager pnpm
```

or interactive selection:

```text
Package manager
> pnpm
```

Package-manager logic should remain centralized rather than being scattered across generators.

---

# 22. Phase 3N — CLI and Developer Experience

**Status: TODO**

Potential commands:

```bash
forgekit create
forgekit doctor
forgekit info
forgekit version
```

Potential UX improvements:

```text
progress indicators
better errors
generation summary
verbose mode
dry-run
```

Ideal output:

```text
ForgeKit

Creating my-api...

✓ Configuration
✓ Project structure
✓ PostgreSQL + Prisma
✓ Redis
✓ JWT authentication
✓ Swagger
✓ Docker
✓ GitHub Actions
✓ Testing

Project created successfully.

Next steps:

  cd my-api
  pnpm install
  pnpm prisma generate
  pnpm start:dev
```

---

# 23. Phase 3O — Validation and Safety

**Status: TODO**

ForgeKit needs robust handling of:

```text
existing directories
invalid project names
invalid feature combinations
missing templates
filesystem errors
permission errors
partial generation
```

Generation should ideally behave transactionally.

For example:

```text
generation begins
       ↓
error occurs
       ↓
cleanup partial project
       ↓
clear error
```

instead of leaving a half-generated project behind.

---

# 24. Phase 3P — Integration and E2E Testing

**Status: TODO**

ForgeKit needs a configuration test matrix.

Example:

| Configuration | Generate | Install | Build | Test |
|---|---:|---:|---:|---:|
| Minimal | ✓ | ✓ | ✓ | ✓ |
| Prisma | ✓ | ✓ | ✓ | ✓ |
| Redis | ✓ | ✓ | ✓ | ✓ |
| JWT | ✓ | ✓ | ✓ | ✓ |
| Docker | ✓ | — | ✓ | — |
| CI | ✓ | — | ✓ | — |
| Full stack | ✓ | ✓ | ✓ | ✓ |

The goal is to verify generated projects, not just ForgeKit internals.

---

# 25. Phase 3Q — Publishing

**Status: TODO**

ForgeKit should eventually be installable through npm.

Potential usage:

```bash
pnpm dlx forgekit create my-api
```

or:

```bash
npm create forgekit
```

Publishing work includes:

```text
npm package metadata
README
LICENSE
CHANGELOG
versioning
release workflow
npm provenance
```

The published package itself must be tested.

Local development success is not sufficient.

---

# 26. Phase 3R — Documentation

**Status: TODO**

Documentation should cover:

```text
Installation
Quick start
CLI commands
Configuration
Feature flags
Generated architecture
Customization
Troubleshooting
Contributing
```

Generated projects should also receive a useful README explaining:

```text
what ForgeKit generated
why the architecture exists
how features are structured
how to modify the project
how to run it
```

---

# 27. Final ForgeKit Architecture

The eventual ForgeKit repository should look approximately like:

```text
forgekit/
│
├── bin/
│   └── forgekit.js
│
├── src/
│   ├── cli/
│   │   ├── commands/
│   │   ├── options/
│   │   └── prompts/
│   │
│   ├── config/
│   │
│   ├── generators/
│   │   ├── core/
│   │   ├── features/
│   │   │   ├── auth/
│   │   │   ├── ci/
│   │   │   ├── docker/
│   │   │   ├── prisma/
│   │   │   ├── redis/
│   │   │   ├── swagger/
│   │   │   └── testing/
│   │   │
│   │   ├── project/
│   │   ├── generation-plan.ts
│   │   └── generate-project.ts
│   │
│   ├── rendering/
│   │
│   ├── utils/
│   │
│   └── templates/
│       ├── base/
│       ├── auth/
│       ├── prisma/
│       ├── redis/
│       ├── swagger/
│       ├── docker/
│       ├── ci/
│       └── testing/
│
├── scripts/
│
├── test/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
│
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
└── README.md
```

---

# 28. Complete Roadmap

```text
PHASE 0
Project Foundation
STATUS: DONE
        ↓
PHASE 1
Configuration System
STATUS: DONE
        ↓
PHASE 2
CLI + Interactive Mode
STATUS: DONE
        ↓
PHASE 3A
Generation Engine
STATUS: DONE
        ↓
PHASE 3B
Template System
STATUS: DONE
        ↓
PHASE 3C
Real NestJS Generation
STATUS: DONE
        ↓
PHASE 3D
Feature Generator Architecture
STATUS: NEXT
        ↓
PHASE 3E
Production NestJS Architecture
STATUS: TODO
        ↓
PHASE 3F
Prisma + PostgreSQL
STATUS: TODO
        ↓
PHASE 3G
Redis
STATUS: TODO
        ↓
PHASE 3H
JWT Authentication
STATUS: TODO
        ↓
PHASE 3I
Swagger
STATUS: TODO
        ↓
PHASE 3J
Docker
STATUS: TODO
        ↓
PHASE 3K
GitHub Actions
STATUS: TODO
        ↓
PHASE 3L
Testing Infrastructure
STATUS: TODO
        ↓
PHASE 3M
Package Manager Support
STATUS: TODO
        ↓
PHASE 3N
CLI / Developer Experience
STATUS: TODO
        ↓
PHASE 3O
Validation + Safety
STATUS: TODO
        ↓
PHASE 3P
Integration / E2E Testing
STATUS: TODO
        ↓
PHASE 3Q
Publishing
STATUS: TODO
        ↓
PHASE 3R
Documentation
STATUS: TODO
        ↓
FORGEKIT v1.0
```

---

# 29. Definition of Done — ForgeKit v1.0

ForgeKit v1.0 should not be considered complete until all of the following are true.

## CLI

```text
✓ Interactive creation
✓ Non-interactive creation
✓ Clear errors
✓ Useful output
✓ Help/version commands
```

## Configuration

```text
✓ Validated configuration
✓ Feature dependencies
✓ Sensible defaults
✓ Safe combinations
```

## Generation

```text
✓ Deterministic generation
✓ Modular generators
✓ Template system
✓ Safe filesystem handling
✓ Existing-project protection
```

## Backend

```text
✓ NestJS
✓ PostgreSQL
✓ Prisma
✓ Configuration
✓ Logging
✓ Swagger
✓ Redis
✓ JWT authentication
```

## DevOps

```text
✓ Docker
✓ Docker Compose
✓ GitHub Actions
```

## Testing

```text
✓ Unit tests
✓ E2E tests
✓ Generated-project validation
✓ Configuration matrix
```

## Package management

```text
✓ npm
✓ pnpm
✓ yarn
✓ bun
```

## Distribution

```text
✓ npm package
✓ pnpm dlx support
✓ Correct template packaging
✓ Release workflow
```

## Documentation

```text
✓ Installation
✓ Quick start
✓ CLI reference
✓ Architecture
✓ Feature documentation
✓ Contributing guide
```

---

# 30. Core Architectural Objective

The most important architectural goal of ForgeKit is to make feature addition cheap.

Adding a future feature such as:

```text
GraphQL
S3
BullMQ
WebSockets
MongoDB
OpenTelemetry
Prometheus
Sentry
```

should ideally mean:

```text
new feature generator
+
templates
+
configuration
+
tests
```

rather than rewriting the entire CLI or generation engine.

The desired relationship is:

```text
ForgeKit Core
      │
      ├── Configuration
      ├── Generation Engine
      ├── Template System
      ├── FileSystem
      └── CLI
              │
              ▼
       Feature Generators
              │
       ┌──────┼────────┐
       ▼      ▼        ▼
    Prisma   Redis    Auth
       │      │        │
       └──────┼────────┘
              ▼
       Generated Backend
```

This composability is the central architectural property that will determine whether ForgeKit remains maintainable as it grows.

---

# Current Milestone

ForgeKit has successfully crossed the first major milestone:

```text
CLI
  ↓
Configuration
  ↓
Generation Engine
  ↓
Templates
  ↓
Real NestJS Project
  ↓
npm install
  ↓
npm build
  ↓
NestJS runtime
```

Current status:

```text
Phase 0   DONE
Phase 1   DONE
Phase 2   DONE
Phase 3A  DONE
Phase 3B  DONE
Phase 3C  DONE

Phase 3D  NEXT
```

The next development task is:

> **Design and implement the Feature Generator + Generation Plan architecture before adding Prisma, Redis, authentication, Docker, CI, or other production features.**

This architecture is the foundation for the rest of ForgeKit v1.0.
