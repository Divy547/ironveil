# ForgeKit v0.1 — Development Blueprint

## 0. Before the Plan: Critical Read of the Spec

A few decisions in the spec need pushback before anything gets built:

- **"Resource generator" (`forgekit generate module/resource/...`) does not belong in v0.1.** Nest already has a schematics-based generator that does this well. Building your own on top of it before `create` is even stable is scope creep with high effort and low differentiation. **Defer entirely to v0.2+.** The spec itself says this is "future functionality" in section 3 of the task, but section 11/15 of the product spec sketches out `generators/module`, `generators/resource` as if they're part of the initial architecture. They should exist as *empty placeholders in the folder structure at most*, not implemented.
- **Zod (or a schema library) is not optional — it's required**, not just "a choice." A code generator that silently accepts a malformed config and writes half a project to disk is worse than one that refuses to run. Validate at the boundary, hard.
- **"Configurable in the future" appears repeatedly (exception format, generated architecture, response shape).** Good — resist the urge to build a plugin/config system for any of this now. Hardcode one opinionated shape. Configurability is a v0.2+ problem and premature config surfaces are the single most likely source of v0.1 bloat.
- **BullMQ mention should be deleted from scope entirely**, not "deferred if it's easy." It never is easy. Treat Redis as a bare ioredis connection + health check only.
- **The "future package managers" (pnpm/yarn/bun) and "future OAuth providers" should not even get abstraction seams in v0.1.** Building an abstraction for a thing you're not implementing yet is speculative generality — it adds indirection without proof it's the right shape. Hardcode npm and JWT-only auth; refactor into an abstraction later when you have a second real case to generalize from.
- **`forgekit doctor`, `forgekit add`, `forgekit update`, `forgekit config` — none of these exist in v0.1.** Not even stubs.
- **The generated architecture (`common/`, `infrastructure/`, `modules/`) is good and should be kept as-is.** It's a real, standard, boring NestJS layout — not academic Clean Architecture. No changes needed here.
- **Templates-as-directories-of-files (not a templating engine like Handlebars/EJS wired through a plugin system) is the correct call**, and the plan below commits to a specific, deliberately unglamorous mechanism (string token replacement + JSON merge), not a general-purpose template engine.

With that out of the way, here is the actual blueprint.

---

## 1. Executive Architecture Recommendation

ForgeKit is a **pipeline**, not a framework. One direction of data flow, no plugin system, no event bus, no DI container for ForgeKit itself (the generated app uses Nest's DI — ForgeKit's own internals do not need one).

**Major components:**

1. **CLI layer** (`cli/`) — parses argv, runs prompts, produces a raw, unvalidated options object. Nothing here knows about templates, dependencies, or the filesystem layout of a generated project. Its only job is "turn user input into a plain object."
2. **Config layer** (`config/`) — takes the raw object from the CLI, validates it against a Zod schema, applies defaults, resolves feature dependencies (e.g. `auth: jwt` implies `database: postgres` + `orm: prisma`), and rejects invalid combinations. Output is a single frozen `ForgeKitConfig` object. This is the **single source of truth** for everything downstream.
3. **Generator layer** (`generators/project/`) — the orchestrator. Takes a validated `ForgeKitConfig` and a target directory, and runs a fixed sequence of steps (below). It does not contain feature-specific logic itself — it delegates to feature modules.
4. **Feature modules** (`generators/features/*`) — one module per feature (`base`, `prisma`, `redis`, `swagger`, `auth-jwt`, `docker`, `ci`, `health`, `logging`, `validation`). Each exposes a small, uniform interface: which template directory to copy, which `package.json` fragment to merge, which token replacements to apply, and any post-copy file mutation (e.g. wiring a new module into `app.module.ts`).
5. **Template engine** (`templates/engine.ts`) — the dumb, shared machinery used by every feature module: copy a directory, replace `{{tokens}}`, merge JSON files, merge `.env` fragments. It has no knowledge of what NestJS or Prisma are.
6. **Filesystem/process utils** (`utils/`) — thin wrappers around `fs-extra` and `execa`/`child_process` so the rest of the code isn't littered with raw Node APIs and so these calls are mockable in tests.
7. **Package manager runner** (`utils/package-manager/`) — runs `npm install` in the generated directory, streams/captures output, and reports success/failure in a structured way. npm-only in v0.1.

**Where CLI ends and generation begins:** exactly at the `ForgeKitConfig` object. The CLI's final act is calling `runProjectGenerator(config, targetDir)`. Everything past that point is pure, testable, and has zero knowledge of `process.argv`, prompts, or stdout formatting (it returns structured results/errors; the CLI layer is the only thing allowed to print).

**Configuration flow:** `argv/prompts → raw object → Zod validate+default → dependency resolution → frozen ForgeKitConfig → generator → feature modules (read-only consumers of config)`. Config never mutates after this point.

**Template composition:** Each enabled feature contributes a directory of files to copy into the target project and a `package.json` fragment. The generator copies `base/` first, then loops enabled features in a fixed, explicit order (not the order the user selected them — a deterministic order defined by the dependency graph in Section 10), merging as it goes.

**Dependency selection:** each feature module owns a static dependency list (name + version) for `dependencies` and `devDependencies`. The generator merges these into one `package.json` by feature order, then writes it once.

**File writing:** all files are written to the target directory only after config validation succeeds and the target directory is confirmed safe to write to (see Section 8/15). No partial writes into an existing arbitrary directory — the generator always fails before touching disk if the destination already exists and is non-empty, unless `--force` is passed.

**Package installation:** ForgeKit itself invokes `npm install` for the user (not "npx forgekit create" leaving them to remember to install) but this step is clearly logged, is skippable with `--skip-install`, and its failure does not roll back generated files — it's reported as a distinct, recoverable failure ("project files created, but `npm install` failed — run it manually").

---

## 2. Repository Structure

```text
forgekit/
├── src/
│   ├── cli/
│   │   ├── commands/
│   │   │   └── create.command.ts
│   │   ├── prompts/
│   │   │   └── create.prompts.ts
│   │   ├── options/
│   │   │   └── create.options.ts      # yargs/commander flag definitions
│   │   ├── output.ts                  # all console/spinner/formatting logic lives here
│   │   └── index.ts                   # CLI entrypoint, registers commands
│   │
│   ├── config/
│   │   ├── schema.ts                  # Zod schema + inferred ForgeKitConfig type
│   │   ├── defaults.ts
│   │   ├── resolve.ts                 # dependency resolution / incompatibility checks
│   │   └── index.ts
│   │
│   ├── generators/
│   │   ├── project/
│   │   │   ├── run.ts                 # the orchestrator pipeline
│   │   │   └── steps/                 # one file per pipeline step (copy, merge, install, validate)
│   │   └── features/
│   │       ├── base/
│   │       ├── prisma-postgres/
│   │       ├── redis/
│   │       ├── swagger/
│   │       ├── validation/
│   │       ├── logging/
│   │       ├── exceptions/
│   │       ├── health/
│   │       ├── auth-jwt/
│   │       ├── docker/
│   │       └── ci-github-actions/
│   │           # each feature dir has: feature.ts (manifest: deps, template path,
│   │           # post-copy hooks), and is co-located with its own unit test
│   │
│   ├── templates/
│   │   ├── engine.ts                  # copyTemplate(), replaceTokens(), mergeJson()
│   │   └── files/                     # the actual template file trees, mirrors features/
│   │       ├── base/
│   │       ├── prisma-postgres/
│   │       ├── redis/
│   │       ├── swagger/
│   │       ├── auth-jwt/
│   │       ├── docker/
│   │       └── ci-github-actions/
│   │
│   ├── utils/
│   │   ├── filesystem.ts
│   │   ├── process.ts                 # execa wrapper for npm install, etc.
│   │   ├── package-json.ts            # merge logic
│   │   └── errors.ts                  # ForgeKitError hierarchy
│   │
│   └── index.ts                       # library entrypoint (for tests / programmatic use)
│
├── test/
│   ├── unit/
│   ├── generator/                     # runs the generator into a tmp dir, asserts file tree
│   └── integration/                   # full `forgekit create`, npm install, npm run build
│
├── bin/
│   └── forgekit.js                    # shebang entry, calls dist/cli
├── .github/workflows/
├── package.json
└── tsconfig.json
```

**Rules per directory:**
- `cli/`: argv parsing, prompt UX, printing. **Must not** contain any file-writing or npm-invoking logic.
- `config/`: validation and defaulting only. **Must not** touch the filesystem.
- `generators/project/`: orchestration only — sequencing calls to feature modules and utils. **Must not** contain feature-specific knowledge (no "if prisma" branches here — that belongs inside the prisma feature module and the dependency graph).
- `generators/features/*`: one feature = one directory. Each exports a manifest (deps, template dir, optional `postGenerate(ctx)` hook for file mutation like wiring imports into `app.module.ts`). **Must not** import from `cli/`.
- `templates/files/*`: static-ish file trees with `{{tokenName}}` placeholders. No logic lives in this directory — it's data.
- `utils/`: no ForgeKit-domain knowledge (no "prisma" or "redis" strings in here) — purely generic fs/process helpers.

This is intentionally flat and boring. No `core/` vs `domain/` vs `application/` layering — that's overkill for a single-developer CLI tool.

---

## 3. CLI Architecture

- **CLI framework:** `commander` (simpler surface than `yargs`, sufficient for one command family; oclif is overkill for a single-developer v0.1).
- **Prompts:** `@clack/prompts` (nicer UX and cancellation handling than `inquirer`, small dependency footprint).
- **Command parsing:** `forgekit create <project-name> [flags]`. Flags mirror config fields 1:1 (`--database`, `--orm`, `--redis`, `--auth`, `--swagger`, `--docker`, `--ci`, `--testing`, `--skip-install`, `--force`, `--yes`).
- **Interactive vs non-interactive convergence:** both paths produce the exact same raw options object shape before hitting `config/resolve.ts`. Interactive mode = prompts fill in whatever flags weren't passed. If **any** relevant flag is passed, skip prompting for that field only (partial non-interactive is supported naturally, not as a special case). `--yes` skips all remaining prompts and uses defaults.
- **Validation:** happens in exactly one place — `config/schema.ts` (Zod) — regardless of which path produced the raw object. The CLI never validates directly; it only catches and formats `ZodError`s.
- **Cancellation handling:** `@clack/prompts` emits a cancellation symbol on Ctrl+C; CLI checks for it after every prompt group and exits cleanly with exit code `130` (standard SIGINT convention) and a "Cancelled." message — no stack trace.
- **Exit codes:** `0` success, `1` generic/config error, `2` destination conflict, `3` npm install failure (project files still written), `130` user cancellation.
- **Logging/output:** all user-facing output funnels through `cli/output.ts` (wraps a spinner library like `ora` + `picocolors`). Internal code never calls `console.log` directly — generator steps return structured progress events; only the CLI layer renders them. This is what makes the generator testable without stdout assertions.
- **Error handling:** a small `ForgeKitError` class hierarchy (`ConfigError`, `DestinationExistsError`, `TemplateError`, `InstallError`) — CLI layer catches these and prints a clean one-line message + optional hint; anything *not* a `ForgeKitError` is treated as a real bug and printed with `--verbose`-gated stack trace plus a "please file an issue" message.

---

## 4. Configuration System

**Recommendation: Zod, unambiguously.** Plain TypeScript types give you compile-time safety only — useless against actual user input from argv/prompts, which is the majority of what needs validating here. Zod gives you runtime validation + inferred static types from one definition, so there's no drift between the two.

```ts
// shape, not literal code — for illustration only
const ForgeKitConfigSchema = z.object({
  projectName: z.string().regex(validNpmPackageNameRegex),
  database: z.literal('postgres'),           // single-value enum in v0.1, but modeled as one for future growth
  orm: z.literal('prisma'),
  redis: z.boolean().default(false),
  auth: z.enum(['none', 'jwt']).default('none'),
  swagger: z.boolean().default(true),
  docker: z.boolean().default(true),
  ci: z.boolean().default(true),
  testing: z.boolean().default(true),
  packageManager: z.literal('npm').default('npm'),
});
```

- **Where defined:** `config/schema.ts`, one file, one schema. Not split per-feature — the config object is small enough that splitting it adds indirection without benefit at this size.
- **Defaults:** expressed via `.default()` in the schema itself, not a separate defaults-merging step — one less place for drift.
- **CLI flag → schema mapping:** 1:1 field names, enforced by a small compile-time test that fails if a schema key has no corresponding CLI flag defined (cheap insurance against skew).
- **Prompt → schema mapping:** same, 1:1.
- **Feature dependency handling:** not expressed in the Zod schema (Zod schemas are bad at cross-field conditional logic). Instead, a separate `resolve.ts` step runs **after** schema validation: it's a small set of explicit rules, e.g. `if auth === 'jwt' → database and orm are forced to postgres/prisma` (already true by default in v0.1 since those are the only values), and `if redis === false and someFutureRedisDependentFeature → error`. In v0.1 this file will be short; keep it that way.
- **Incompatible options:** rejected with a `ConfigError` listing the exact conflicting fields — never silently "fixed."
- **Passed to generators:** the frozen (`Object.freeze`) `ForgeKitConfig` is passed by reference to every generator step and feature module. Nothing downstream re-validates it — validation happens exactly once, at the boundary.

---

## 5. Generator Architecture

**Recommendation: Pipeline of fixed steps, each step feature-aware only through a uniform feature-module interface.** Not monolithic (untestable, unreadable at scale), not a generic plugin/composable system (unnecessary indirection for a fixed, small feature set), not a DI-container-based generator (adds a dependency and a concept for no real benefit at this size).

```text
CLI → Config → runProjectGenerator(config, targetDir):
  1. preflight()            — target dir doesn't exist or is empty (unless --force)
  2. selectFeatures(config) — resolves the ordered list of enabled feature modules
  3. copyTemplates(features)     — base first, then each feature's template dir
  4. applyTokenReplacement(features, config)
  5. mergePackageJson(features)  — one pass, feature order = dependency graph order
  6. mergeEnvExample(features)
  7. runPostGenerateHooks(features) — e.g. wiring imports into app.module.ts, README assembly
  8. writeReadme(config, features)
  9. installDependencies(targetDir)   — skippable via --skip-install
  10. postGenerateValidation(targetDir) — e.g. confirm expected files exist; does NOT run npm build (too slow/fragile for every `create` call — that belongs in CI/integration tests, not every user run)
```

Each **feature module** implements one small interface:

```ts
interface ForgeKitFeature {
  id: string;
  templateDir: string;             // relative to templates/files/
  dependencies: Record<string,string>;
  devDependencies: Record<string,string>;
  envVars?: Record<string,string>; // appended to .env.example
  postGenerate?(ctx: GenerateContext): Promise<void>;
}
```

This keeps the orchestrator (`generators/project/run.ts`) at roughly 60–100 lines that never grow when a new feature is added — only `generators/features/` grows.

---

## 6. Template System

The proposed tree in the spec is fine as a starting shape, with one correction: **flatten `database/postgres-prisma/` to `prisma-postgres/` at the same nesting level as everything else.** Nesting by "category" (database vs auth vs infra) buys nothing since there's only ever one item per category in v0.1, and it complicates the feature-id → template-dir mapping for no reason.

```text
templates/files/
├── base/
├── prisma-postgres/
├── redis/
├── swagger/
├── validation/
├── logging/
├── exceptions/
├── health/
├── auth-jwt/
├── docker/
└── ci-github-actions/
```

- **Storage:** plain files on disk, checked into the repo, shipped inside the npm package. No remote template fetching (explicitly out of scope per spec).
- **File copying:** recursive directory copy via `fs-extra.copy`, filtering out any files that don't apply (see conditional files below).
- **Variable substitution:** literal `{{tokenName}}` string replacement (a 15-line regex-based function) run over every copied text file. No Handlebars/EJS/Mustache dependency — the substitution needs are trivial (project name, DB name, ports) and don't justify a templating engine dependency plus its own DSL/escaping rules.
- **Conditional files:** handled by **feature-scoped directories**, not `{{#if}}` blocks inside shared files. If a file only applies when Docker is enabled, it lives entirely inside `templates/files/docker/`, not inside `base/` wrapped in conditionals. The one unavoidable exception is `app.module.ts`, which every enabled feature needs to *modify* (import a new module) — that's handled by `postGenerate` hooks doing targeted string insertion (e.g. inserting an import line + adding to the `imports: []` array) rather than conditional templating. This is more code per feature but each piece stays simple and independently testable.
- **`package.json` merging:** each feature contributes a `dependencies`/`devDependencies` object; the generator does a straightforward object merge in feature-graph order (Section 10) and writes one `package.json` at the end. Conflicting version pins across features are treated as a build-time error in ForgeKit's own test suite (Section 13), never resolved silently at generation time — this can't happen with a curated feature set if the dependency registry (Section 7) is kept consistent.
- **Config file merging (e.g. `.env.example`, `docker-compose.yml`):** `.env.example` is line-appended per feature (each feature owns a block with a comment header). `docker-compose.yml` is the one file assembled programmatically rather than copied+merged as text — a small typed builder (`services.push({...})` per enabled feature) avoids YAML-merge fragility.
- **Avoiding feature-combination conflicts:** kept small by construction — features write to their own namespaced directories (`infrastructure/redis/`, `infrastructure/prisma/`) and only ever touch shared files (`app.module.ts`, `package.json`, `.env.example`, `docker-compose.yml`) through the narrow, tested mechanisms above, never by copying overlapping files.
- **Adding future features safely:** add a new `features/<name>/` module + `templates/files/<name>/` directory + one entry in the dependency graph (Section 10) + a generator test. No changes needed to the orchestrator itself.

---

## 7. Dependency Management

- **Registry model:** each feature module's manifest (Section 5) is itself the dependency registry — there is no separate global dependency map to keep in sync. Versions are hardcoded, pinned to specific minor versions (not `^` ranges) at the time of writing, and bumped deliberately via a single "bump dependencies" maintenance task, not left floating. Floating ranges in a generator are a reproducibility hazard: two people running `forgekit create` a month apart should get materially the same project.
- **devDependencies:** owned per-feature too (e.g. `@types/passport-jwt` lives in the `auth-jwt` feature, not in `base`).
- **Peer dependencies:** not modeled specially in v0.1 — npm handles peer resolution; ForgeKit just needs to make sure the direct dependency versions it pins are mutually compatible (verified by the integration test in Section 13, not by a manual peer-dep tracking system).
- **`package.json` generation:** fully generated by ForgeKit (name, version, scripts, deps) — not copied from a template file as static JSON, because scripts need to vary slightly by enabled features (e.g. `docker:up` script only if Docker enabled). Built as a plain object in code and `JSON.stringify`'d once at the end of the pipeline.
- **npm installation:** yes, ForgeKit runs `npm install` in the target directory via `execa`, with real-time output streamed to the user (not swallowed — install failures are common and users need to see *why*). Skippable via `--skip-install` for advanced/CI use.
- **Handling installation failures:** generation itself is considered successful once files are written; install failure is reported as a separate, non-fatal-to-the-overall-command failure with the exact command the user can re-run manually (`cd <project> && npm install`). Exit code `3` (Section 3).
- **Package manager abstraction:** **do not build one in v0.1.** `utils/package-manager/npm.ts` is a concrete, non-abstracted module. When pnpm/yarn support is actually needed, extract the interface then, informed by two real implementations instead of one imagined one.

---

## 8. Generated Project Independence

This is a hard constraint, so it needs explicit guardrails, not just intent:

- **No `forgekit` package reference ever appears in a generated `package.json`** — enforced by an automated check in the generator test suite that greps the output `package.json` (and the whole generated tree) for the string `forgekit` and fails the test if found (excluding an optional comment in the README crediting the tool, which is fine).
- **Template files must never `require`/`import` anything from ForgeKit's own source.** Templates are plain, standalone NestJS files from the moment they're written to disk — this is naturally true if templates are literal files copied verbatim (Section 6) rather than programmatically constructed from ForgeKit runtime objects, which is exactly why "copy static files + token replace" was chosen over "generate files by serializing in-memory ForgeKit objects."
- **No generated `postinstall`/`prepare` script should shell out to `forgekit`** — trivially true if no template ever writes one, verified by the same content-scan test.
- **Common accidental-coupling traps to explicitly avoid:** (1) a generated config file that reads environment variables named `FORGEKIT_*` — don't do this, use plain `DATABASE_URL` etc.; (2) generated code importing a "shared runtime helpers" npm package that ForgeKit itself publishes — don't create one; any shared logic must be copy-pasted into the template as inline code, not imported from a `@forgekit/runtime` package; (3) version-locking generated dependencies to "whatever ForgeKit currently uses" via a workspace reference — generated `package.json` must always have concrete, standalone version strings.
- **Verification:** the integration test suite (Section 13) literally deletes/never installs ForgeKit inside the generated project's `node_modules` and confirms `npm install && npm run build && npm run start` succeed with zero knowledge of ForgeKit's existence.

---

## 9. Generated NestJS Architecture

```text
src/
├── common/
│   ├── decorators/
│   ├── filters/          # GlobalExceptionFilter
│   ├── guards/            # JwtAuthGuard (if auth enabled)
│   ├── interceptors/      # logging interceptor
│   ├── pipes/              # ValidationPipe config lives in main.ts, custom pipes here if any
│   └── types/
│
├── infrastructure/
│   ├── config/            # env schema + typed ConfigService wrapper
│   ├── logger/             # nestjs-pino or custom Logger provider
│   ├── prisma/              # PrismaService + PrismaModule (if enabled)
│   ├── redis/                # RedisModule + injectable client (if enabled)
│   └── swagger/               # setupSwagger(app) function (if enabled)
│
├── modules/
│   ├── auth/                 # AuthModule (if auth enabled): controller, service, jwt.strategy, dto
│   └── health/                 # HealthModule with GET /health
│
├── app.module.ts
└── main.ts
```

- **Dependency direction:** `modules/*` may depend on `infrastructure/*` and `common/*`. `infrastructure/*` may depend on `common/*` only. `common/*` depends on nothing app-specific. This is a one-directional rule, not enforced by tooling in v0.1 (no lint-boundary plugin) — just a convention documented in the generated README, since adding enforcement tooling to every generated project is scope creep for v0.1.
- **Module boundaries:** each business feature is its own Nest module under `modules/`. In v0.1 the only generated business module is `auth` (and implicitly `health`, which is more infra-flavored but kept under `modules/` because it's exposed as an HTTP surface, matching Nest convention).
- **Infrastructure access:** business modules inject infrastructure providers (`PrismaService`, `RedisService`) via normal Nest DI — no repository-pattern abstraction layer imposed in v0.1 (that's exactly the "unnecessary Clean Architecture" the spec warns against). Developers use `PrismaService` directly in their own service classes.
- **Prisma access:** single `PrismaService extends PrismaClient` with `onModuleInit`/`onModuleDestroy` lifecycle hooks, exported from `PrismaModule`, imported once in `AppModule` as `@Global()` so any module can inject it without re-importing.
- **Redis access:** same pattern — a single injectable client wrapped in `RedisModule`, `@Global()`.
- **Configuration access:** a typed `AppConfigService` (thin wrapper reading validated `process.env` via the Section on env validation below) is `@Global()` and injected wherever needed — no direct `process.env` access outside `infrastructure/config/`.
- **Authentication:** standard Passport JWT strategy + guard, a `users` concept minimal enough to support login/register (in-memory-to-Prisma-backed user lookup), password hashing via `bcrypt`. No RBAC/permissions system in v0.1 — authenticated vs not is the only distinction.
- **Common utilities:** exception filter, logging interceptor, and any shared decorators/types live in `common/` and have zero feature-specific knowledge (the filter doesn't know about Prisma, for instance, beyond generically catching `PrismaClientKnownRequestError` if Prisma is enabled).

---

## 10. Feature Dependency Graph

```text
base (always on)
 ├── validation        (independent — always on with base, not user-toggleable in v0.1)
 ├── logging            (independent — always on)
 ├── exceptions          (independent — always on)
 ├── health               (independent — always on; content varies if prisma/redis enabled)
 ├── swagger                (independent, user-toggleable, default: on)
 ├── prisma-postgres          (user-toggleable — BUT effectively required in v0.1 since it's the only DB option; kept toggleable for architectural honesty, default: on)
 │      └── auth-jwt            (requires prisma-postgres — auth needs a user table)
 ├── redis                       (independent, user-toggleable, default: off)
 ├── docker                        (independent, user-toggleable — composes in whichever of prisma/redis are enabled)
 └── ci-github-actions               (independent, user-toggleable, default: on)
```

Key clarifications this graph forces:
- **`validation`, `logging`, `exceptions`, `health` are not user-facing toggles in v0.1** — the spec lists them as top-level features, but making them optional serves no real user need (nobody wants a NestJS backend *without* validation) and only multiplies the number of testable feature-combinations for zero benefit. They ship as part of `base`. This is an explicit scope-protection decision, not an oversight.
- **`auth-jwt` hard-requires `prisma-postgres`.** If a user tried to select auth without a database, `config/resolve.ts` rejects it with a clear message rather than silently enabling Prisma behind their back.
- **`docker` and `ci-github-actions` are leaves** — they read the final resolved feature set and adapt (e.g. `docker-compose.yml` only gets a `postgres`/`redis` service block if those features are active) but nothing depends on them.
- Real "invalid configuration" surface in v0.1 is therefore small: essentially just `auth=jwt` implying database requirements, which are already the only available choice — so in practice v0.1 has **no reachable invalid combination** given the constrained option set. This is worth stating explicitly: the incompatible-options machinery in Section 4 is there for architectural correctness and future-proofing, not because v0.1 has real conflicts to catch yet.

---

## 11. Development Phases

**Phase 0 — Repository bootstrap**
Objective: a publishable, empty CLI skeleton.
Work: repo init, TS config, ESLint/Prettier, `bin/forgekit.js`, `commander` wired to a no-op `create` command that prints "not implemented," package.json set up for npm publish (bin field, files field), Vitest or Jest configured for ForgeKit's own tests.
Depends on: nothing.
Tests: one smoke test that `forgekit --help` exits 0.
Definition of done: `npm link && forgekit create foo` prints a placeholder message with no crash.

**Phase 1 — Configuration system**
Objective: `config/schema.ts`, `defaults.ts`, `resolve.ts` fully built and tested, independent of the CLI.
Work: Zod schema, dependency resolution rules (Section 4/10), `ForgeKitError`/`ConfigError` classes.
Depends on: Phase 0.
Tests: exhaustive unit tests over valid/invalid/edge-case raw config objects.
Definition of done: `resolveConfig(rawObject)` has full unit coverage and is usable with zero CLI code.

**Phase 2 — CLI foundation (prompts + flags → config)**
Objective: `forgekit create <name>` fully parses flags and/or prompts into a validated `ForgeKitConfig`, then just prints it (no generation yet).
Work: `cli/options`, `cli/prompts`, wiring both into `config/resolve.ts`, error formatting, cancellation handling, exit codes.
Depends on: Phase 1.
Tests: unit tests mocking prompt responses and flag arrays; snapshot the resulting config object.
Definition of done: both interactive and fully-flagged non-interactive runs produce identical, correct config objects for equivalent input.

**Phase 3 — Template engine + base feature**
Objective: `templates/engine.ts` (copy, token replace, JSON merge) plus the `base` feature template tree (bare NestJS app + validation/logging/exceptions/health baked in, per Section 10).
Work: template engine functions, `base` template files, `generators/project/run.ts` orchestrator handling just the `base` feature end-to-end (copy → token replace → package.json write → npm install).
Depends on: Phase 2.
Tests: generator test that runs the pipeline into a tmp dir and asserts exact expected file list; integration test that installs and builds the bare base project.
Definition of done: `forgekit create test-base --database postgres --orm prisma` (with all other features off) produces a project that installs, builds, and starts, exposing `/health`.

**Phase 4 — Prisma/PostgreSQL feature**
Objective: `prisma-postgres` feature module fully working, wired into `app.module.ts` via `postGenerate` hook.
Work: template files (`schema.prisma`, `PrismaService`/`PrismaModule`), env var wiring, README section.
Depends on: Phase 3.
Tests: generator test asserting Prisma files present + `app.module.ts` correctly imports `PrismaModule`; integration test running `docker compose up -d postgres` (or a CI Postgres service container) then a real `npx prisma migrate dev`/generate + app boot connecting to it.
Definition of done: generated project connects to a real Postgres instance on start.

**Phase 5 — Redis feature**
Objective: same pattern as Phase 4 for Redis.
Depends on: Phase 3 (independent of Phase 4).
Tests: same shape, against a real Redis service container.
Definition of done: generated project connects to Redis on start when enabled, and omits all Redis code/deps cleanly when disabled (verified by asserting absence, not just presence).

**Phase 6 — Swagger feature**
Objective: `setupSwagger(app)` wired into `main.ts` via hook.
Depends on: Phase 3.
Tests: generator test checking `main.ts` contains the swagger setup call when enabled and doesn't when disabled; integration test hitting `/docs` and asserting 200.
Definition of done: `/docs` serves valid OpenAPI JSON on a generated+built project.

**Phase 7 — Auth (JWT) feature**
Objective: full `auth-jwt` module: register/login endpoints, guard, strategy, password hashing.
Depends on: Phase 4 (hard requirement per Section 10).
Tests: integration test that boots the generated app, registers a user, logs in, and hits a protected route with/without a valid token.
Definition of done: JWT auth flow works end-to-end against a real generated+running project.

**Phase 8 — Docker feature**
Objective: `Dockerfile` + programmatically-assembled `docker-compose.yml` reflecting whichever of Postgres/Redis are active.
Depends on: Phases 4/5 (reads their presence), Phase 3.
Tests: generator test asserting compose file service list matches enabled features for several config combinations; integration test that actually runs `docker compose up` and hits `/health` inside CI (heavier — see Section 14 for how this is gated).
Definition of done: `docker compose up -d && npm run start:dev` works against a freshly generated project.

**Phase 9 — CI (GitHub Actions) feature**
Objective: generated `.github/workflows/ci.yml` running install/lint/typecheck/test/build in the *generated* project.
Depends on: Phase 3 (structure needed for lint/test scripts to exist).
Tests: generator test asserting workflow file content/steps; best-effort validation via `actionlint` if available, otherwise just YAML-parse validity.
Definition of done: pushing a freshly generated project to a scratch GitHub repo produces a green Actions run (manual one-time verification, not an automated ForgeKit test — see Section 13).

**Phase 10 — README generation**
Objective: assemble a per-project README reflecting exactly which features are enabled (setup steps, `.env` instructions, relevant commands only).
Depends on: all prior feature phases (it reads the final feature list).
Tests: generator test snapshotting README output for a couple of representative configs.
Definition of done: README for a fully-featured project and a minimal project both read correctly and contain no references to disabled features.

**Phase 11 — Polish, error handling, full integration suite, npm publish**
Objective: harden all error paths (Section 15), finalize CLI UX (Section 17 of the spec), write the full `test-api` end-to-end integration test, publish `v0.1.0` to npm.
Depends on: all prior phases.
Tests: the complete integration suite from Section 13.
Definition of done: `npx forgekit create test-api` (published package, clean machine) satisfies the milestone in Section 21.

---

## 12. Exact Implementation Order

```text
1. Phase 0 — repo/CLI skeleton
2. Phase 1 — config schema + resolve
3. Phase 2 — CLI ↔ config wiring (prompts + flags)
4. Phase 3 — template engine + base feature (full pipeline proven end-to-end on the simplest case)
5. Phase 4 — Prisma/PostgreSQL
6. Phase 6 — Swagger            (independent, easy, builds confidence before harder features)
7. Phase 5 — Redis
8. Phase 7 — Auth (JWT)          (needs Prisma from step 5)
9. Phase 8 — Docker               (needs Prisma+Redis presence to compose correctly)
10. Phase 9 — CI (GitHub Actions)
11. Phase 10 — README generation   (needs the full feature set to reflect accurately)
12. Phase 11 — polish, full integration suite, publish
```

This order front-loads the riskiest, most novel piece (the generator pipeline + base feature in Phase 3) as early as possible, and defers the feature that depends on another feature (Auth → Prisma) until its dependency is done, avoiding rework.

---

## 13. Testing Strategy

**Unit tests** — the largest bucket by test count, smallest by runtime:
- `config/schema.ts` and `resolve.ts`: every valid combination, every invalid/incompatible combination, default application.
- `templates/engine.ts`: token replacement edge cases (nested braces, missing tokens, multiple occurrences), JSON merge behavior, conditional-file filtering.
- `utils/*`: filesystem helpers (mocked fs), process runner (mocked execa).
- Each feature module's manifest: dependency lists are valid semver, no accidental duplicate keys across features that would silently overwrite during merge (a real cross-feature test, not per-feature).

**Generator tests** (the core of trust in this project) — run the actual pipeline (`runProjectGenerator`) against a real temp directory on disk (no mocking of fs at this layer — mocking fs for a filesystem generator defeats the purpose), for every meaningful feature combination, and assert:
- exact expected file list exists (no missing files, no stray files)
- `package.json` contains exactly the expected merged dependencies
- token replacements resolved correctly (no literal `{{...}}` left in any file — a blanket grep-for-unreplaced-tokens assertion across every generated file, on every run, is cheap and catches an entire class of bugs)
- `app.module.ts` contains the correct imports for the enabled feature set
- **no generated file references `forgekit`** (Section 8 guarantee, enforced here)

**Snapshot tests** — useful, but narrowly: for stable, rarely-changing files like `Dockerfile`, `docker-compose.yml`, `.github/workflows/ci.yml`, and README output, where "does this look right" is genuinely best answered by a diff against a committed snapshot. **Not** used for the whole generated tree (too broad, breaks on every unrelated change, becomes noise developers blindly approve).

**Integration tests** (`forgekit create test-api` end-to-end) — the most expensive, most valuable tier:
- Run the real CLI binary via `execa` against a real temp directory.
- Install real dependencies (`npm install`, not mocked).
- For each of a small, deliberately curated matrix of representative configs (not the full combinatorial product — see below), assert: build succeeds (`npm run build`), app starts and `/health` returns 200, `/docs` returns 200 when Swagger enabled, DB-dependent configs connect against a real Postgres via a CI service container, Redis-dependent configs connect against a real Redis service container, auth configs complete a register→login→protected-route flow.
- **Matrix kept small on purpose:** full feature set on, minimal feature set (base only), and one or two "interesting" in-between combos (e.g. Prisma+Redis without Docker, Docker without CI). Full combinatorial coverage (2^7 combos) is not worth the CI time or maintenance burden for a curated, small feature set — the generator tests already cover file-level correctness for all combinations; integration tests only need to prove that a *representative sample* actually runs.

**Generated-project validation in CI:** exactly the integration test tier above, run as a distinct, slower, separately-triggered CI job (Section 14) — not part of the fast unit/generator suite that runs on every commit.

---

## 14. CI/CD Strategy (ForgeKit's own repo)

Two-tier pipeline:

**Fast tier (`ci.yml`, runs on every push/PR):**
```text
lint → typecheck → unit tests → generator tests
```
All of this runs against mocked or tmp-dir-only filesystem work with no real `npm install` of a generated project — should complete in well under a couple of minutes.

**Slow tier (`integration.yml`, runs on PR-to-main and manual dispatch, and nightly on main):**
```text
spin up postgres + redis service containers →
  full `forgekit create` integration matrix (Section 13) →
  real npm installs, real builds, real boots, real DB/Redis connections
```
Kept separate so the fast tier stays fast enough to run on every commit, while the expensive, flake-prone (network installs, service containers) tier runs less often and doesn't block quick iteration. PRs touching `templates/` or `generators/` should require the slow tier to pass before merge; PRs touching only `cli/` prompt text, for instance, don't strictly need it (can be enforced by a path-based CI trigger).

---

## 15. Error Handling

| Case | Handling |
|---|---|
| Invalid project name | Reject in `config/schema.ts` via npm-package-name regex; message shows the rule, not a generic "invalid input." |
| Destination already exists (non-empty) | `DestinationExistsError` before any file is written; suggests `--force` or a different name. Exit code 2. |
| Invalid configuration | `ConfigError` with the specific field(s) and why; exit code 1. |
| Unsupported feature combination | Caught in `config/resolve.ts` (Section 10), same `ConfigError` path. |
| npm unavailable | Checked once, early, via `execa('npm', ['--version'])`; clear message ("npm not found on PATH") before any generation work happens — no point generating files if install can't run and `--skip-install` wasn't passed. |
| npm install failure | Files remain on disk; failure reported distinctly with the manual re-run command; exit code 3 (Section 3/7). |
| Template missing | Should be unreachable in a released version (caught by generator tests), but defensively throws a `TemplateError` with the missing path rather than an unhandled `ENOENT`. |
| Filesystem permission error | Caught at the `preflight()` step (test-write a temp file into the target's parent dir before doing real work) and reported as a clear permissions message, not a raw `EACCES` stack trace. |
| Generated project build failure | Out of scope for the `create` command itself to fix — ForgeKit's job is to generate correct files, verified by its own test suite (Section 13), not to babysit every generated build at runtime. If it happens in practice, it indicates a ForgeKit bug, not a user error to "handle" gracefully at runtime. |
| Ctrl+C cancellation | Handled per Section 3 — clean exit 130, no partial-file cleanup ambiguity (nothing is written to the target dir until after config resolution completes, so a cancellation during prompting never leaves a half-written project; a cancellation *during* file writing is the one edge case worth an explicit `try/finally` that removes the partially-written target directory only if ForgeKit created it in this run). |

General rule: anything that is a `ForgeKitError` subclass gets a clean one-liner + hint. Anything else is treated as an actual bug, shown with a stack trace only behind `--verbose`, plus a note to file an issue.

---

## 16. MVP Scope Protection

**MUST BUILD**
- `forgekit create <name>` — interactive + non-interactive
- Config validation (Zod) + dependency resolution
- Base NestJS project (validation, logging, exception filter, health check baked in — always on)
- Prisma + PostgreSQL
- Redis
- Swagger
- JWT auth
- Docker + docker-compose
- GitHub Actions CI (for the *generated* project)
- README generation
- npm install execution
- Generator + integration test suite proving the above actually works

**SHOULD BUILD** (v0.1 if time allows, otherwise immediately after)
- `--skip-install` / `--force` flags
- `--verbose` flag for debugging
- Nicer spinner/progress UX beyond bare functionality
- A `--dry-run` flag that prints the file list without writing

**MUST NOT BUILD**
- `forgekit generate module/resource/controller/service` (defer to v0.2 — Nest schematics already cover most of this need)
- pnpm/yarn/bun support or any package-manager abstraction layer
- OAuth providers
- Kubernetes, cloud deployment templates
- Plugin marketplace, remote/downloadable templates
- BullMQ or any Redis-adjacent job queue
- GUI of any kind
- `forgekit doctor` / `add` / `update` / `config` commands
- Configurable exception response shape, configurable generated architecture, or any other "configurability" beyond the fixed feature toggles listed above
- Multi-database support (MySQL/SQLite/Mongo) — Postgres only
- RBAC/permissions beyond authenticated/unauthenticated

---

## 17. Architectural Risks

| # | Risk | Why it matters | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| 1 | Template drift from real NestJS/Prisma conventions as those projects evolve | Generated projects look stale/wrong within months | Medium | High | Pin dependency versions deliberately (Section 7); schedule periodic manual re-validation against latest Nest/Prisma docs, don't auto-update blindly. |
| 2 | `app.module.ts` post-generate hook string-insertion breaks on unexpected formatting | Silent generation of a non-compiling `app.module.ts` | Medium | High | Keep the base `app.module.ts` template's shape byte-for-byte fixed and never hand-edited outside the template file; generator tests assert the exact final `app.module.ts` content per config, not just "contains substring." |
| 3 | `package.json` dependency version conflicts across features (peer dep mismatches) | Generated project fails `npm install` or has runtime type errors | Medium | High | Integration tests (Section 13) actually run `npm install` for every representative combo; bump/verify pinned versions together, not feature-by-feature in isolation. |
| 4 | Feature combination explosion making testing infeasible | Either under-tested edge cases or unsustainable CI time | Low (given the small, curated MVP feature set) | Medium | Section 10's explicit small feature set + Section 13's curated (not combinatorial) integration matrix. |
| 5 | NestJS major version bump breaking generated code | A NestJS 11→12 upgrade could change DI/module conventions | Low near-term | High | Pin Nest version explicitly in v0.1; treat "support new Nest major" as a deliberate, tested version-bump project, not an automatic update. |
| 6 | Prisma schema/CLI changes across versions | Migration commands or generated client API could shift | Low near-term | Medium | Same pinning strategy; document the exact Prisma version supported in the README. |
| 7 | `npm install` flakiness/network failures in CI and for end users | Looks like a ForgeKit bug when it's an external failure | Medium | Medium | Clear, distinct failure messaging (Section 15) separating "files generated fine, install failed" from a real generation bug; retries not built into ForgeKit itself (npm's own retry behavior is enough). |
| 8 | Generator tests becoming slow/flaky as real fs operations scale | Erodes trust in the "fast tier" CI feedback loop | Low | Medium | Keep generator tests on tmp-dir fs work only (no real installs) — enforced by code review discipline, since installs belong only in the integration tier. |
| 9 | Solo-developer bus factor / maintainability | The entire point of the project depends on one person being able to keep extending it | Medium | High | The deliberately flat, boring architecture (no plugin system, no DI container, no generic template engine) is itself the mitigation — less machinery to relearn after time away. |
| 10 | Scope creep pressure once v0.1 works ("just add pnpm support," "just add resource generation") | Directly threatens shipping a usable v0.1 at all | High | High | Section 16's explicit MUST NOT list, treated as a hard gate, not a suggestion — new feature requests go into a backlog file, not into `main`, until v0.1 ships. |

---

## 18. Decisions to Settle Before Coding

- **Template strategy:** static file trees + token replacement + JSON/compose builder (Section 6) — settled above, not a Handlebars/EJS engine.
- **Configuration schema library:** Zod (Section 4) — settled.
- **CLI framework:** `commander` + `@clack/prompts` (Section 3) — settled.
- **Filesystem/process wrappers:** `fs-extra` + `execa` — settled.
- **Package manager scope:** npm-only, no abstraction (Section 7) — settled.
- **ForgeKit's own test runner:** pick Vitest or Jest once, in Phase 0, and don't revisit — either is fine; Vitest is faster for a TS-only codebase with no NestJS-specific testing needs on ForgeKit's own side.
- **Feature toggle set:** the exact list in Section 10 (note that validation/logging/exceptions/health are *not* toggles) — settled, and worth confirming explicitly since it deviates from the literal spec wording.
- **Version pinning policy:** exact pins, not ranges, bumped deliberately (Section 7/17) — settled.

Everything else (exact prompt copy, spinner styling, README wording, exact env var names) can be decided during implementation without architectural consequence.

---

## 19. Dogfooding Strategy

```text
ForgeKit → test-api → Bonfire → AI Rural Health
```

- **`test-api` (Phase 11 / Milestone 3 below):** validates the mechanical claim — does the pipeline actually produce a project that installs/builds/starts/connects/exposes what it promises. This is ForgeKit validating itself, with a throwaway config (full feature set on). Any bug found here is a ForgeKit bug — fix in ForgeKit, not by hand-patching `test-api`.
- **Bonfire backend:** the first real project. Validates that the generated architecture is actually a *good starting point* for real feature development, not just a passing test. Watch specifically for: does the developer (you) reach for patterns ForgeKit didn't anticipate within the first day of real work? Any friction here is signal for what's missing from `base`/`modules` conventions — but resist folding one-off Bonfire needs back into ForgeKit unless the friction is clearly general (would also apply to AI Rural Health). Log friction, don't reflexively generalize from n=1.
- **AI Rural Health backend:** the real test of generality. If patterns/fixes that came out of Bonfire actually transfer cleanly to a different domain, that's confirmation the architecture is genuinely reusable rather than accidentally Bonfire-shaped. If it doesn't transfer cleanly, that's a signal ForgeKit over-fit to project #1 — worth explicitly re-examining before calling v0.1 "done."
- After both real projects: do a retrospective pass specifically on Section 16's MUST NOT list — now with two real data points, some deferred items may earn promotion to v0.2 scope (or new ones will surface that weren't anticipated at all).

---

## 20. Versioning Strategy

- **ForgeKit's own version:** standard semver on the npm package itself. A "breaking change" for ForgeKit means: existing CLI flags change meaning, config schema field removed/renamed, or generated project structure changes in a way that would break someone re-running `create` and expecting the same shape as before.
- **NestJS/Prisma/other generated-dependency versions:** pinned exact versions embedded in the feature manifests (Section 7), bumped as a deliberate, tested maintenance PR — never "latest" resolved at generation time. This is the single most important versioning decision: **ForgeKit's release version and the generated project's dependency versions are decoupled but co-versioned within a ForgeKit release** — i.e., ForgeKit v0.1.3 always generates the exact same dependency versions regardless of when it's run, until v0.1.4 changes them.
- **Generated template versions:** no per-template versioning system in v0.1 (would be premature machinery, see Section 0's critique). Templates version implicitly with the ForgeKit package itself.
- **Future breaking changes:** when ForgeKit needs a structural change to the generated architecture (e.g. restructuring `infrastructure/`), that's a ForgeKit **major** version bump, documented in a changelog with an explicit note that projects generated by the old major version are unaffected (they're already independent per Section 8) but a fresh `create` with the new major produces the new shape. There is deliberately **no upgrade/migration tooling for already-generated projects in v0.1** — that's a real, hard problem (`forgekit update` in the spec's future-vision section) intentionally deferred, not solved half-heartedly now.

---

## 21. Final Development Roadmap

**Milestone 0 — Skeleton**
Goal: publishable, empty CLI exists.
Deliverables: repo bootstrap, CLI entrypoint, CI fast-tier running on an empty test suite.
Acceptance: `forgekit --help` works from a global `npm link`.

**Milestone 1 — Config pipeline**
Goal: raw input → validated `ForgeKitConfig`, fully tested, no generation yet.
Deliverables: Phases 1–2.
Acceptance: interactive and non-interactive input paths both produce correct, identical config objects across a full unit test matrix.

**Milestone 2 — Working generator core**
Goal: the pipeline actually writes a real, minimal, working NestJS project to disk.
Deliverables: Phase 3.
Acceptance: `forgekit create minimal-test` (base only) installs, builds, starts, and serves `/health`.

**Milestone 3 — Full v0.1 feature set**
Goal: every MUST BUILD feature from Section 16 implemented and individually tested.
Deliverables: Phases 4–10.
Acceptance: each feature has passing generator + integration tests in isolation and in the representative combinations from Section 13.

**Milestone 4 — v0.1.0 release**
Goal: the actual product milestone from the spec.
Deliverables: Phase 11 — polish, full error handling, complete integration suite, npm publish.
Acceptance criteria (the literal bar):
```text
npx forgekit create test-api
```
produces a project that:
- installs cleanly
- builds cleanly
- starts and connects to real PostgreSQL and Redis
- exposes working Swagger docs and `GET /health`
- fails fast on missing/invalid env vars
- supports a real register/login/protected-route JWT flow
- runs via `docker compose up`
- has a generated GitHub Actions workflow that goes green on a real push to a scratch repo
- contains zero references to ForgeKit and installs/builds with ForgeKit fully absent from `node_modules`

**Milestone 5 — Dogfooding validation**
Goal: prove the architecture holds up on real projects, per Section 19.
Deliverables: Bonfire and AI Rural Health backends generated and built out to first real feature.
Acceptance: friction log reviewed; Section 16 scope list revisited for v0.2 planning with real evidence instead of speculation.
