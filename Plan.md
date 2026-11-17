# Ironveil Roadmap

Goal: turn Ironveil from a one-shot NestJS scaffolder into the **deterministic, verified foundation that both humans and AI agents build on**, then launch it publicly (Reddit / dev.to / Medium).

Current baseline (v0.3.0, Phase 1 complete, pushed to GitHub): `create` command only, 13 feature generators (config, logging, security, error-handling, health, prisma, redis, auth, swagger, testing, lint, docker, ci), 317 passing unit tests, e2e matrix (every combination installs, lints, builds, boots, serves `/health` and exits cleanly on SIGTERM), npm/pnpm/yarn support.

Each phase ends in a releasable version. Each task should land with unit tests, and generator changes should be covered by the e2e matrix.

## Working agreements

- **Commit cadence:** commit every task as soon as it is done (one commit per task, e.g. `feat: add health checks (1.1)`), with `Plan.md` updated in the same commit (tick the checkbox and note anything that deviated from the plan).
- **Push and publish cadence:** tag each phase locally (`v0.2.1`, `v0.3.0`, …). Push to GitHub after Phase 1 *(done for `v0.3.0`)*. Publish to npm only once all phases are done (Phase 5, v1.0.0), so intermediate versions are never published. Never push, tag-push or `npm publish` without being asked.
- **E2E tests are slow (~16 min serial, ~7 min with `pnpm test:e2e:fast`, which uses 3 workers):** they run ~22 real `npm`/`pnpm`/`yarn install`s plus a build and test run per project. Do **not** run them on every change. Day to day use `pnpm typecheck && pnpm test` (seconds). Run the e2e suite only when you touch generators, templates, version pins, the CLI entrypoint or packaging, and always before a release tag. Prefer running just the affected file, e.g. `pnpm exec vitest run test/e2e/redis.e2e.test.ts`. Use `test:e2e:fast` for the full suite during development and the serial `test:e2e` for the final pre-release run (parallel runs share ports derived from the worker pid, so a rare collision is possible; if a parallel run fails oddly, re-run that file serially).

---

## Phase 0: Finish the ForgeKit → Ironveil rename (v0.2.1)

The package was renamed to `ironveil` because `forgekit` was taken on npm, but ~350 internal references remain across ~59 files in `src/` and `test/`.

| Old name | New name |
| :--- | :--- |
| `FORGEKIT_VERSIONS` | `IRONVEIL_VERSIONS` |
| `ForgeKitVersions` | `IronveilVersions` |
| `ForgeKitConfig` | `IronveilConfig` |
| `ForgeKitConfigInput` / `ForgeKitConfigOutput` | `IronveilConfigInput` / `IronveilConfigOutput` |
| `ForgeKitConfigSchema` | `IronveilConfigSchema` |
| `InstalledForgeKit`, `packForgeKit`, `installPackedForgeKit` (e2e helpers) | `InstalledIronveil`, `packIronveil`, `installPackedIronveil` |
| `forgekit-*` temp dirs, DB names, JWT secrets, project names in tests | `ironveil-*` |
| `describe('ForgeKit …')` test titles | `describe('Ironveil …')` |

Tasks:
- [x] **0.1** Rename types, schema and version constants in `src/config/*` and update every import in `src/`.
- [x] **0.2** Rename e2e helpers in `test/e2e/helpers/*` and their call sites.
- [x] **0.3** Replace `forgekit` strings in test fixtures (DB URLs, secrets, tmp dir prefixes, project names, describe titles).
- [x] **0.4** Fix the independence assertions (`dependencies?.forgekit` → `dependencies?.ironveil`). Right now they check for the wrong package name, so they always pass.
- [x] **0.5** Add a guard test that fails if `/forge-?kit/i` appears anywhere in `src/`, `test/`, `scripts/`, `README.md` or `CONTRIBUTING.md`.
- [x] **0.6** Run `pnpm typecheck && pnpm test && pnpm test:e2e`, rebuild `dist/`, release a patch. *(Done: committed and tagged `v0.2.1` locally. Push/publish deferred per the working agreements.)*

**Done when:** `grep -rni forgekit --exclude-dir=node_modules --exclude-dir=.git .` returns nothing (lockfile included) and all suites pass. *(Satisfied for everything except this file, which quotes the old names in the rename table above. The guard test enforces it for `src/`, `test/`, `scripts/` and the docs.)*

---

## Phase 1: Make "production-ready" true (v0.3.0)

The README promises production readiness, but the generated `main.ts` only sets up a `ValidationPipe`. Reviewers will notice. Close these gaps before any public launch.

- [x] **1.1 Health checks:** `@nestjs/terminus` `HealthModule` with `/health` (liveness) and `/health/ready` (readiness). Readiness checks Prisma, plus Redis when it's enabled. Point the Docker `HEALTHCHECK` at it. *(Done: `HealthGenerator` always runs; `src/modules/health/` in generated projects. Boot-time verification that `/health` returns 200 on a real server is covered by 1.9.)*
- [x] **1.2 Structured logging:** `nestjs-pino`, with pretty output in dev, JSON in prod, request IDs, and redaction of `authorization` / `password` fields. Add a `LOG_LEVEL` env var. *(Done: `LoggingGenerator` always runs; `src/infrastructure/logging/logging.module.ts` in generated projects. `pino-pretty` is a devDependency used only when `NODE_ENV=development`; logging is silenced when `NODE_ENV=test`; `/health*` requests are excluded from access logs; inbound `x-request-id` is reused or one is generated and echoed on the response. Actual JSON-vs-pretty output on a live server is covered by 1.9.)*
- [x] **1.3 Security defaults:** `helmet`, CORS configured from env (`CORS_ORIGINS`), and `@nestjs/throttler` with env-tunable limits. *(Done: `SecurityGenerator` always runs; `src/infrastructure/security/` in generated projects (`SecurityModule` for the global `ThrottlerGuard`, `setupSecurity(app)` for helmet + CORS, called from `main.ts`). Env: `CORS_ORIGINS` (comma-separated or `*`; CORS stays **off** when empty, but `.env.example` ships `http://localhost:3000`), `THROTTLE_LIMIT` (100) and `THROTTLE_TTL_MS` (60000), all validated by zod. Deviations: `/health*` is exempt from throttling (`@SkipThrottle()`) so orchestrator probes can't be rate limited; when Swagger is enabled the CSP is relaxed for `/api/docs` only, since Swagger UI needs inline scripts. Verified manually on a generated project: helmet headers present, CORS allows only listed origins, 429 after the limit, health unaffected. SIGTERM and boot-in-Docker coverage stays with 1.4/1.9.)*
- [x] **1.4 Clean shutdown:** `app.enableShutdownHooks()`. Prisma and Redis services disconnect cleanly on SIGTERM. *(Done: `main.ts` calls `app.enableShutdownHooks()` right after the logger is attached, so SIGTERM/SIGINT run the existing `onModuleDestroy` hooks. Deviations/extras: `RedisService` now skips `quit()` when the connection is already closed and falls back to `disconnect()` if `quit()` throws, so an unreachable Redis can't block shutdown; the docker-compose api command is now `prisma migrate deploy && exec node dist/main.js` so Node replaces `sh` as PID 1 and actually receives SIGTERM (the Dockerfile `CMD` was already exec form). Verified with unit tests and `redis.e2e`; a live SIGTERM-exits-cleanly check across the whole matrix stays with 1.9.)*
- [x] **1.5 Global error handling:** an exception filter with a consistent error response shape (`statusCode`, `message`, `error`, `requestId`, `timestamp`). Map Prisma errors (P2002 → 409, P2025 → 404). *(Done: `ErrorHandlingGenerator` always runs; `src/common/filters/all-exceptions.filter.ts` in generated projects, registered globally via `APP_FILTER` in `CommonModule`. Deviations/extras: the filter is a catch-all `@Catch()`, so unexpected errors return a generic `500 Internal server error` (details are logged with the request ID, never sent to the client); `message` is a string array for validation failures; `requestId` comes from the logging module's `req.id` (falls back to the `x-request-id` response header, else `null`); Prisma errors are matched by `name`/`code` rather than `instanceof`, so the filter has no import dependency on the generated client, and unmapped Prisma codes fall through to the generic 500. Verified in a real generated project with a harness app: 418/409/404/500/validation 400 all return the shape with the echoed request ID. Full-matrix boot coverage stays with 1.9.)*
- [x] **1.6 Auth hardening (`--auth jwt`):** refresh tokens with rotation, `/auth/me`, a `@CurrentUser()` decorator, a `@Public()` decorator with a global guard, and role-based access (`@Roles()` + `RolesGuard`). *(Done: `AuthGenerator` now generates `decorators/` (`@Public`, `@Roles`, `@CurrentUser`), `guards/roles.guard.ts` and a `RefreshTokenDto`; `JwtAuthGuard` and `RolesGuard` are registered globally via `APP_GUARD` in `AuthModule`, so **every route is protected unless marked `@Public()`** (health is marked public only when auth is enabled). Endpoints: `POST /auth/refresh` (rotation), `POST /auth/logout`, and `GET /auth/me` now returns the DB profile (`id, email, role, createdAt, updatedAt`) instead of the raw JWT payload. Refresh tokens are opaque random values stored as SHA-256 hashes in a new `RefreshToken` table, grouped by `familyId` per login; presenting an already-rotated token revokes the whole family. Prisma schema/migration gain the `Role` enum (`USER`/`ADMIN`), `User.role` and `RefreshToken`, but only when `--auth jwt` (via template placeholders), and the access token carries `role`. New env vars `JWT_ACCESS_TTL_SECONDS` (900) and `JWT_REFRESH_TTL_DAYS` (7). Deviations: no endpoint assigns roles, so new users are `USER` and an admin is promoted in the database (documented in the generated README); expired refresh-token rows are not purged yet. Verified on a real generated project and in `auth.e2e` (rotation, reuse detection, logout, `@Public`/`@Roles` via a probe module). **Note:** the init migration changed, so a pre-existing e2e database from an older run (e.g. `ironveil-matrix-e2e`, `ironveil-swagger-e2e`) must be dropped once before re-running those files.)*
- [x] **1.7 Lint and format:** the generated `lint` script already calls ESLint. Ship an actual `eslint.config.mjs` (flat config with typescript-eslint) and Prettier config. Add a lint step to the generated CI. *(Done: new `LintGenerator` (always runs, after `testing`) writes `eslint.config.mjs` (ESLint 9 flat config, `typescript-eslint` `recommendedTypeChecked` with `projectService`, `eslint-config-prettier`, `src/generated/**` ignored), `.prettierrc` (`singleQuote`, `trailingComma: all`) and `.prettierignore`. Lint tooling moved out of the base devDependencies into a `lint` group in `IRONVEIL_VERSIONS` (adds `@eslint/js`, `typescript-eslint`, `globals`, `eslint-config-prettier`). Deviations: `lint` no longer passes `--fix` (so CI can't silently rewrite files); `lint:fix` and `format` scripts were added, and the glob is `{src,test}` instead of `{src,apps,libs,test}`. The generated CI runs `lint` after Prisma generate (type-aware rules need the client) and before typecheck. CI does **not** run a Prettier check: the generated templates are not Prettier-clean yet, so `format` is an on-demand command, not a gate. The `no-unsafe-*` rules are off for `test/**` and `*.spec.ts`; `no-explicit-any` is off and `no-floating-promises`/`no-unsafe-argument` are warnings, as in Nest's default. Linting the real generated code found two template bugs, both fixed: an unused `JwtPayload` import in the auth controller and an enum comparison in the error filter. Verified `npm run lint` is clean on a full-feature and a minimal generated project; the matrix e2e now runs `lint` before typecheck in every case. Lint-in-every-combination, boot and SIGTERM coverage stays with 1.9.)*
- [x] **1.8 Env validation:** generated config validates required vars at boot and fails fast with clear messages. Keep `.env.example` in sync with every feature. *(Done: the generated project already ran a zod schema through `ConfigModule`; this task closes its gaps. New `requiredString()` helper in the generated `environment.ts` gives `NAME is required` / `must not be empty` instead of zod's "received undefined". `JWT_SECRET` is now **required** when `--auth jwt` (it was `.optional()`, so a missing secret only crashed later inside `JwtStrategy`), `DATABASE_URL` must be a `postgres(ql)://` URL and `REDIS_URL` a `redis(s)://` URL. A failed boot now throws one `Invalid environment configuration:` error listing **every** problem, plus a pointer to `.env.example`. New `test/unit/env-validation.test.ts` renders the config for default, redis, jwt and redis+jwt, executes the generated `environment.ts` against real zod, checks that the shipped `.env.example` validates as-is, and that the schema keys and `.env.example` keys are identical (so a new feature can't drift). Deviations: no check that `JWT_SECRET` isn't the `.env.example` placeholder, so copying `.env.example` unchanged into production still boots; `configuration.ts` still reads `process.env` directly with defaults rather than the validated object. Ran `auth`, `redis` and `testing` e2e; the full matrix stays with 1.9.)*
- [x] **1.9 Tests:** extend the e2e matrix so every combination boots, `/health` returns 200, lint passes, and SIGTERM exits cleanly. *(Done: new `test/e2e/helpers/runtime-checks.ts` holds the shared pipeline. `prepareProject()` does install, Prisma generate + `migrate deploy`, lint, typecheck and build; `assertBootsAndShutsDownCleanly()` starts `node dist/main.js`, asserts `/health` is 200 with `status: ok`, asserts `/health/ready` is 200 with `database` up (and `redis` up only when Redis is enabled), then sends SIGTERM and requires the process to exit on its own within 15s. `test-server.ts` gained `shutdown()` (SIGTERM, SIGKILL fallback, reports code/signal/output) and prints the server output when boot fails. Because Nest re-raises SIGTERM after the hooks run, a server with no hooks also dies with SIGTERM, so exit status alone proves nothing; `helpers/sigterm-probe.cjs` is preloaded into the server and logs a marker right before that re-raise, and the test requires the marker. Matrix cases 1, 2, 3, 5, 6, 9, 10 (pnpm) and 11 (yarn) now run the full pipeline and boot; case 4 does the same and runs its register/login/me flow on that live server; new case 12 covers a minimal project with every optional feature off. Cases 7 (CI) and 8 (testing) stay static: their config equals the default project, which case 1 covers end to end. Deviations: each case now uses its own database (`ironveil-matrix-<case>-e2e`) because cases generate different Prisma schemas and every boot needs a database that exists (`migrate deploy` creates it); the old shared `ironveil-matrix-e2e` database is no longer used and can be dropped. Needs Postgres on `localhost:5432` and Redis on `localhost:6379` when running the matrix. Full matrix: 12/12 passing in ~6.5 min serial; `auth` and `swagger` e2e re-run green after the helper change. Boot inside Docker is still not tested; that is the "starts in Docker" part of the phase's done-when and stays with the release check.)*
- [x] **1.10 Docs:** update the README feature list and the generated project README. *(Done: the root `README.md` feature list is now split into always-included and optional features and covers health checks, structured logging, security defaults, error handling, graceful shutdown, env validation, lint/format and the hardened JWT auth; the architecture tree matches a real generated `--auth jwt --redis` project; test counts were refreshed (41 files, 317 unit tests) and the E2E count was dropped because it goes stale. The generated project README gained a `{{readmeRuntime}}` placeholder (`src/templates/base/README.md.template`) that renders **Health Checks**, **Error Responses**, **Logging**, **Security** and **Graceful Shutdown** sections, adds `lint`/`lint:fix`/`format` to the Development commands, a lint feature and clean-shutdown bullet, a fuller auth bullet, a production note (`NODE_ENV=production`, explicit `CORS_ORIGINS`, probe paths, fail-fast env validation), and Redis/Swagger/Docker/auth wording only when those features are enabled. Two new unit tests in `template-renderer.test.ts` cover the sections and the per-feature wording. Released as `v0.3.0`: version bumped in `package.json`, the CLI, the README and the version assertions, the full serial `pnpm test:e2e` passed (13 files, 42 tests, ~15 min), `master` and the `v0.3.0` tag were pushed to GitHub by the user. The push was first rejected because GitHub had one extra commit (`Update repository URL in README setup instructions`, a one-line `git clone` URL fix), so the local commits were rebased on top of it and the tag was re-created on the rebased release commit before pushing. Deviations: the Phase 1 done-when check (default project starts in Docker and reports healthy) is not automated yet and stays with the release check.)*

**Done when:** a default `ironveil create my-api --yes` project passes lint, typecheck, tests and build, starts in Docker, and reports healthy.

---

## Phase 2: AI-ready generated projects (v0.4.0)

Make projects generated by Ironveil easy for AI coding agents to extend in the same style.

- [ ] **2.1** Generate an `AGENTS.md` at the project root covering:
  - the architecture (`common/` vs `infrastructure/` vs `modules/`) and the rules for each
  - how to add a module, a Prisma model and an endpoint, step by step
  - the commands to run (install, dev, test, lint, migrate) for the chosen package manager
  - the conventions (DTO validation, error shape, logging, auth decorators, test placement)
  - only the sections for features that were actually enabled
- [ ] **2.2** Generate a `CLAUDE.md` that points to `AGENTS.md` (one source of truth), plus optional `.cursor/rules/*.mdc` and `.github/copilot-instructions.md`.
- [ ] **2.3** CLI flag `--ai <none|agents|all>` (default `agents`) and a matching interactive prompt.
- [ ] **2.4** After Phase 3 ships, `AGENTS.md` tells agents to prefer `ironveil generate …` / `ironveil add …` over writing boilerplate by hand.
- [ ] **2.5** Tests: snapshot tests per feature combination, and a check that every command in `AGENTS.md` exists in the generated `package.json`.

**Done when:** opening a generated project in Claude Code / Cursor and asking "add a products CRUD module" produces code that follows the conventions without extra prompting (check manually on 2–3 tasks).

---

## Phase 3: Commands for existing projects (v0.5.0)

This is the main reason to keep Ironveil after the first run. It means editing existing code safely.

### 3A. Infrastructure for editing projects
- [ ] **3.1** Write an `ironveil.json` manifest during `create` (Ironveil version, enabled features, package manager). Every later command reads it to detect the project.
- [ ] **3.2** Add a code-editing layer on `ts-morph`: add a module import to `AppModule`, register providers, add imports, append Prisma models. All edits must be idempotent.
- [ ] **3.3** Safety: refuse to run on a dirty git tree unless `--force` is passed. Support `--dry-run`, which shows a diff of planned changes.

### 3B. `ironveil generate`
- [ ] **3.4** `ironveil generate resource <name>`: module, controller, service, create/update DTOs, Prisma model (with a field prompt or `--fields "name:string price:decimal?"`), paginated list, unit and e2e tests, and Swagger decorators when Swagger is enabled.
- [ ] **3.5** `--auth` option on resources that guards routes with the generated JWT/roles decorators.
- [ ] **3.6** Smaller generators: `generate module|controller|service|guard|dto <name>`, following Ironveil conventions.

### 3C. `ironveil add`
- [ ] **3.7** `ironveil add <redis|auth|swagger|docker|ci|testing|ai>` reuses the existing feature generators, but applies them to an existing project. It merges `package.json`, `.env.example`, docker-compose and `AppModule`.
- [ ] **3.8** New optional features to add once the add pipeline works: `queue` (BullMQ), `mail`, `otel` (OpenTelemetry).

### 3D. Maintenance
- [ ] **3.9** `ironveil doctor`: checks the manifest against the actual project (missing env vars, unregistered modules, version drift).
- [ ] **3.10** Tests: e2e scenario of create → generate resource ×2 → add redis → the project builds, migrates and passes all tests.

**Done when:** a user can grow a generated project to several resources and features through the CLI alone, and it still passes lint, tests and build.

---

## Phase 4: MCP server (v0.6.0)

Let AI agents call Ironveil directly instead of writing scaffolding freehand.

- [ ] **4.1** `ironveil mcp`: an MCP server over stdio using `@modelcontextprotocol/sdk`.
- [ ] **4.2** Tools (thin wrappers over the same code the CLI uses):
  - `create_project`
  - `generate_resource`
  - `add_feature`
  - `list_features`
  - `project_info`, which reads `ironveil.json`
  - `doctor`
- [ ] **4.3** Default every write tool to dry-run, returning the planned file list and diff. Require `confirm: true` to write. Restrict writes to the project root.
- [ ] **4.4** Write clear tool descriptions and input schemas (reuse the zod schemas) so agents pick the right tool.
- [ ] **4.5** Setup docs: one-line install snippets for Claude Code (`claude mcp add ironveil -- npx ironveil mcp`), Cursor and VS Code.
- [ ] **4.6** Optional: a Claude Code skill / plugin that wraps the MCP server with usage guidance.
- [ ] **4.7** Tests: MCP protocol tests (list tools, call each tool against a temp dir), plus manual runs with a real agent.

**Done when:** in Claude Code, "create a NestJS API with auth and add an orders resource" goes through Ironveil's tools and produces a project that passes its tests.

---

## Phase 5: Launch (v1.0.0)

- [ ] **5.1 README overhaul:**
  - a terminal demo GIF (`vhs`)
  - a comparison table: `nest new`, popular starter repos, "just ask an AI", Ironveil
  - an AI/MCP section
- [ ] **5.2 Release hygiene:** `CHANGELOG.md`, npm provenance (`--provenance` in CI), GitHub releases, repo topics and description, an issue and PR template.
- [ ] **5.3 Fresh-machine check:** `npx ironveil create` on clean Linux, macOS and Windows (WSL), using npm, pnpm and yarn.
- [ ] **5.4 Example repo:** a generated project with 2–3 resources, linked from the README.
- [ ] **5.5 Article (dev.to / Hashnode / Medium):** *"Why I still built a deterministic scaffolder in the age of AI agents"*. Cover the problem, why AI output alone isn't enough (it varies between runs, versions drift, nothing proves it builds), how Ironveil complements agents (AGENTS.md + MCP), and a demo.
- [ ] **5.6 Posts:** r/nestjs, r/node, r/typescript (spaced a few days apart, following each sub's self-promotion rules), and optionally Show HN. Answer every comment.
- [ ] **5.7 Feedback loop:** turn launch feedback into issues and decide the post-1.0 priorities (Drizzle/TypeORM, Fastify adapter, `ironveil upgrade` for template updates).
