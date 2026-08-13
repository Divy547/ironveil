# ForgeKit Roadmap

## 1. Project Vision

ForgeKit is an opinionated developer productivity CLI for generating production-ready NestJS backend projects. It should provide a clean NestJS architecture, validated configuration, composable feature generators, reliable generation, strong automated verification, and a generated project that is completely independent of ForgeKit at runtime.

## 2. Current State

Current pipeline:

```text
CLI → Create Options / Prompts → ForgeKit Config → Generation Plan
→ Generation Context → Generation Orchestrator → Generators → Templates
→ Generated NestJS Project
```

Current generators, in order:

```text
base → config → prisma → auth
```

## 3. Completed

### CLI Foundation — DONE

- Commander CLI
- `forgekit` executable
- `create <project-name>`
- version/help
- explicit CLI options
- interactive prompts
- CLI error handling

### Configuration — DONE

- Typed ForgeKit configuration
- Zod validation
- defaults
- normalization and immutability
- feature dependency validation

Current configuration:

```text
projectName
 database: postgres
 orm: prisma
 redis: boolean
 auth: none | jwt
 swagger: boolean
 docker: boolean
 ci: boolean
 testing: boolean
 packageManager: npm
```

### Generation Engine — DONE

- Generator contract
- GenerationContext
- GenerationPlan
- GeneratorRegistry
- GenerationOrchestrator
- GenerationError
- destination collision protection

### Template System — DONE

- Template loader
- template path resolution
- renderer
- runtime template discovery
- template asset copying during build
- project name substitution
- conditional AuthModule rendering

Current placeholders:

```text
{{projectName}}
{{authModuleImport}}
{{authModule}}
```

### Base NestJS Project — DONE

Generated projects use:

```text
NestJS 11
CommonJS
strict TypeScript
```

Structure:

```text
src/
├── common/
├── infrastructure/
└── modules/
```

### Configuration / Environment — DONE

Generated:

```text
.env.example
src/infrastructure/config/configuration.ts
src/infrastructure/config/environment.ts
```

Validation covers `NODE_ENV`, `PORT`, `DATABASE_URL`, and `JWT_SECRET`.

### Package Manifest — DONE

`createPackageManifest()` supports:

```text
read()
write()
addDependencies()
addDevDependencies()
addScripts()
```

### PostgreSQL + Prisma — DONE

Current versions:

```text
Prisma 6.19.3
@prisma/client 6.19.3
```

Generated:

```text
prisma/schema.prisma
src/infrastructure/prisma/prisma.module.ts
src/infrastructure/prisma/prisma.service.ts
```

Uses the `prisma-client` generator with CommonJS output and lifecycle-managed `$connect()` / `$disconnect()`.

Scripts:

```text
db:generate
db:migrate
db:migrate:deploy
db:studio
```

The schema intentionally provides infrastructure rather than application-specific models.

### JWT Authentication — DONE

Generated:

```text
src/modules/auth/
├── auth.module.ts
├── auth.service.ts
├── guards/jwt-auth.guard.ts
├── strategies/jwt.strategy.ts
└── types/jwt-payload.type.ts
```

Dependencies:

```text
@nestjs/jwt
@nestjs/passport
bcrypt
passport
passport-jwt
```

Includes JWT module, Passport, AuthService, JWT strategy, guard, typed payload, ConfigService integration, bearer extraction, expiration validation, and secret validation.

This is JWT infrastructure, not a complete user-management system. User models, registration, login endpoints, refresh tokens, roles, and permissions are intentionally not generated.

## 4. Testing State

### Unit Tests — DONE / STRONG FOUNDATION

21 unit test files currently cover:

```text
architecture
auth generator
base generator
CLI
config
config generator
create mode
filesystem
project generation
generation composition
context
orchestrator
plan
ordering
registry
package assets
package manifest
Prisma generator
template loader
path
renderer
```

Latest verified state: all unit tests passed.

### E2E — PARTIAL

Current suite:

```text
test/e2e/generate-project.e2e.test.ts
```

It verifies generation, dependency installation, and NestJS build. Feature-combination coverage is still limited.

## 5. Build / Packaging

Current build:

```text
remove dist/
→ TypeScript compile
→ copy src/templates to dist/templates
```

CLI entry point:

```text
bin/forgekit.js → dist/src/index.js
```

Build works. Published-package verification is still TODO.

# 6. Current Gaps

Configuration already exposes features without generators:

```text
Redis
Swagger
Docker
CI
Testing
```

Other gaps:

```text
feature-combination E2E coverage
generation failure hardening
generated README quality
generated-project independence verification
centralized dependency versions
package publishing verification
advanced CLI UX
package-manager support
```

# 7. Implementation Roadmap

## F2 — Feature Composition Stabilization

Status: NEXT

Before adding another major feature:

```text
F2.1 Audit generator dependencies
F2.2 Verify generator ordering
F2.3 Verify feature selection behavior
F2.4 Verify generators do not overwrite unrelated output
F2.5 Add feature-combination tests
F2.6 Add full-feature E2E coverage
F2.7 Verify generated projects contain no ForgeKit dependency/import
```

Minimum matrix:

```text
default
Prisma
JWT
Prisma + JWT
```

## F3 — Swagger

Status: TODO

Generate Swagger/OpenAPI infrastructure when `swagger === true`.

Potential responsibilities:

```text
Swagger dependency
Swagger bootstrap configuration
OpenAPI metadata
configuration integration
README documentation
```

## F4 — Redis

Status: TODO

Generate reusable Redis infrastructure when `redis === true`:

```text
Redis module
Redis service
configuration
environment validation
package dependencies
```

Avoid application-specific caching behavior.

## F5 — Docker

Status: TODO

Generate:

```text
Dockerfile
docker-compose.yml
.dockerignore
```

Generation must be feature-aware. For example, a Redis service should only be included when Redis is enabled.

## F6 — CI

Status: TODO

Generate GitHub Actions when `ci === true`.

Minimum workflow:

```text
install → typecheck → unit tests → build
```

Future additions may include E2E, Docker build, and lint.

## F7 — Testing Generator

Status: TODO

Define exactly what the `testing` flag generates. Potential infrastructure:

```text
Jest configuration
test setup
unit structure
E2E configuration
Supertest setup
test environment
```

First decide whether testing dependencies currently in the base template should move into this generator.

## F8 — Generated-Project E2E Matrix

Status: TODO

Minimum cases:

```text
1. Default project
2. Prisma
3. JWT
4. Prisma + JWT
5. Redis
6. Docker
7. CI
8. Testing enabled
9. Full-feature project
```

Eventually verify:

```text
all features enabled
→ generate
→ npm install
→ prisma generate
→ typecheck
→ build
```

## F9 — Generation Safety / Failure Hardening

Status: PARTIAL

Define behavior for partial generation:

```text
A. remove generated directory
B. leave it for debugging
C. generate in temporary directory and commit after success
```

Improve generator-specific error context, preserving the original error while reporting generator and project information.

## F10 — Generated Project Quality

Status: TODO

Improve generated README and feature-aware documentation covering:

```text
overview
installation
development
environment
database
Prisma
authentication
Swagger
Redis
Docker
testing
CI
production
```

Verify generated projects contain no ForgeKit dependency or import.

## F11 — CLI UX / Configuration

Status: TODO

Potential improvements:

```text
better success output
generation summary
feature summary
generated file summary
better failure messages
--dry-run
--yes
non-interactive mode
configuration file support
```

Potential future config file:

```text
forgekit.config.ts
```

## F12 — Package Manager Support

Current support: npm.

Potential future support:

```text
pnpm
yarn
bun
```

This is cross-cutting because it affects installation, lockfiles, E2E, Docker, CI, and documentation.

## F13 — Dependency Version Strategy

Current feature generators use explicit versions. Centralize them later in a `ForgeKitVersions` abstraction to reduce drift.

Potential versions include:

```text
NestJS
Prisma
@prisma/client
Passport
JWT
Redis
Swagger
```

## F14 — Package Validation

Future generated-project validation should verify:

```text
valid package.json
required dependencies
required scripts
no conflicts
```

## F15 — Release / npm Publishing

Before publishing:

```text
build
→ npm pack
→ install package tarball
→ run forgekit
→ generate project
→ install generated dependencies
→ build generated project
```

The actual package must be tested, not only source execution.

# 8. Recommended Order

```text
CURRENT
│
├── Base
├── Config
├── Generation Engine
├── Prisma
└── JWT Auth
        │
        ▼
F2 — Feature Composition Stabilization
        │
        ▼
F3 — Swagger
        │
        ▼
F4 — Redis
        │
        ▼
F5 — Docker
        │
        ▼
F6 — CI
        │
        ▼
F7 — Testing Generator
        │
        ▼
F8 — Generated-project E2E Matrix
        │
        ▼
F9 — Generation Safety / Failure Hardening
        │
        ▼
F10 — Generated Project Quality
        │
        ▼
F11 — CLI UX / Configuration
        │
        ▼
F12 — Package Manager Support
        │
        ▼
F13 — Dependency Version Strategy
        │
        ▼
F14 — Package Validation
        │
        ▼
F15 — Packaging / npm Release
```

# 9. Definition of Done for v1

## CLI

```text
create works
interactive mode works
explicit flags work
non-interactive generation works
```

## Architecture

```text
composable generator pipeline
isolated generators
deterministic ordering
understandable failures
```

## Generated Project

```text
NestJS 11
CommonJS
strict TypeScript
configuration
PostgreSQL
Prisma
optional JWT
optional Redis
optional Swagger
optional Docker
optional CI
optional testing
```

## Quality

```text
unit tests
architecture contracts
composition tests
E2E generation tests
full-feature E2E
generated-project independence verification
```

## Distribution

```text
build works
templates are packaged
npm package works
installed package generates a project
```

# 10. Guiding Principle

ForgeKit should remain a generator framework, not become a giant application template.

Prefer:

```text
small generator
+
small template set
+
clear contract
+
strong tests
```

over:

```text
one giant generator
+
one giant template
+
many conditionals
```

Every new feature should answer:

```text
1. What does it generate?
2. What configuration enables it?
3. What dependencies does it introduce?
4. What other generators does it depend on?
5. How is it tested independently?
6. How is it tested in composition?
7. Does it change existing generated architecture?
```

If these questions cannot be answered clearly, the feature is not ready to be added.
