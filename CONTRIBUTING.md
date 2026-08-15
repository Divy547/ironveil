# Contributing to Ironveil

Thanks for your interest in contributing to Ironveil.

Ironveil is an opinionated CLI for bootstrapping production-ready NestJS backends. Contributions are welcome, especially improvements to the generation pipeline, templates, validation, developer experience, and test coverage.

## Development Requirements

- Node.js >= 22
- pnpm 11.21.0

Clone the repository and install dependencies:

```bash
git clone <repository-url>
cd ironveil
pnpm install
```

## Development

Run Ironveil directly from source:

```bash
pnpm dev
```

Show the CLI help:

```bash
pnpm exec tsx src/index.ts --help
```

Show `create` command options:

```bash
pnpm exec tsx src/index.ts create --help
```

## Validation

Before opening a pull request, run the fast validation suite:

```bash
pnpm run typecheck
pnpm test
pnpm run build
```

You can also run the full end-to-end suite:

```bash
pnpm run test:e2e
```

The end-to-end suite performs real project generation and package-manager lifecycle tests and may take significantly longer than the unit test suite.

## Testing

Ironveil uses Vitest for unit and end-to-end testing.

Unit tests:

```bash
pnpm test
```

End-to-end tests:

```bash
pnpm run test:e2e
```

When changing generation behavior, add or update tests covering the affected behavior.

For new generators or features, tests should verify both the generated output and the relevant configuration behavior.

## Architecture

Ironveil is organized around several core layers:

- **CLI** — command parsing, options, prompts, and output
- **Configuration** — validation and normalized generation configuration
- **Generation Pipeline** — orchestration of project generation
- **Feature Generators** — PostgreSQL, Prisma, authentication, Redis, Swagger, Docker, CI, and testing
- **Template Rendering** — loading and rendering project templates
- **Package Manifest** — safe dependency and script mutation
- **Validation** — validation of generated package manifests
- **Release Verification** — verification of the packaged npm artifact

When adding a feature, integrate it with the existing configuration and generator architecture rather than introducing a separate generation path.

## Adding a Feature

A typical feature should follow the existing architecture:

1. Add the required configuration option.
2. Add configuration validation where necessary.
3. Add or update the feature generator.
4. Add the required templates.
5. Register the generator.
6. Add unit tests.
7. Add or update relevant end-to-end tests.
8. Verify generated package metadata and dependencies.
9. Update documentation if the feature changes user-facing behavior.

Generated projects should remain independent of the Ironveil source repository.

## Pull Requests

Keep pull requests focused and describe clearly:

- What changed
- Why the change was needed
- How the change was tested

For user-facing changes, update the relevant documentation.

Before submitting a pull request, ensure that:

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test
pnpm run build
```

all pass successfully.

## Commit Messages

Use concise, descriptive commit messages.

Examples:

```text
feat: add redis generation
fix: prevent package dependency leakage
test: cover docker generation
docs: update installation guide
refactor: simplify generator registry
```

## Code Quality

Prefer:

- Small, focused changes
- Existing project abstractions
- Strong typing
- Explicit configuration validation
- Tests for behavioral changes
- Clear error messages
- Deterministic generation

Avoid introducing duplicated generation logic or bypassing the existing generator pipeline.

## Release Changes

Changes affecting the published package should be verified carefully.

The release verification suite covers:

- npm package creation
- package contents
- package exclusions
- installed CLI execution
- generated project lifecycle
- npm, pnpm, and yarn compatibility

Do not publish a new npm version without verifying the resulting package artifact.

## License

By contributing to Ironveil, you agree that your contributions will be licensed under the MIT License.
