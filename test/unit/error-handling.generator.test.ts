import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveConfig } from '../../src/config/index.js';
import { generateProject } from '../../src/generators/generate-project.js';
import { ErrorHandlingGenerator } from '../../src/generators/features/error-handling/error-handling.generator.js';
import { createFileSystem } from '../../src/utils/filesystem.js';

describe('ErrorHandlingGenerator', () => {
  let temporaryDirectory: string;

  afterEach(async () => {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  async function generate(
    overrides: Parameters<typeof resolveConfig>[0] = {},
  ) {
    temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'ironveil-errors-'),
    );
    const { destination } = await generateProject(
      resolveConfig({ projectName: 'test-api', ...overrides }),
      temporaryDirectory,
    );
    const fs = createFileSystem();
    const read = (...segments: string[]) =>
      fs.readFile(path.join(destination, ...segments));
    return { read };
  }

  it('always runs', () => {
    const generator = new ErrorHandlingGenerator();
    expect(generator.name).toBe('error-handling');
    expect(generator.shouldRun(resolveConfig({ projectName: 'a' }))).toBe(true);
  });

  it('generates a catch-all filter with the consistent error shape', async () => {
    const { read } = await generate();

    const filter = await read('src/common/filters/all-exceptions.filter.ts');
    expect(filter).toContain('@Catch()');
    expect(filter).toContain('export class AllExceptionsFilter');
    for (const field of [
      'statusCode',
      'message',
      'error',
      'requestId',
      'timestamp',
    ]) {
      expect(filter).toContain(`readonly ${field}:`);
    }
    expect(filter).not.toContain('{{');
  });

  it('maps Prisma P2002 to 409 and P2025 to 404', async () => {
    const { read } = await generate();

    const filter = await read('src/common/filters/all-exceptions.filter.ts');
    expect(filter).toContain("case 'P2002'");
    expect(filter).toContain('HttpStatus.CONFLICT');
    expect(filter).toContain("case 'P2025'");
    expect(filter).toContain('HttpStatus.NOT_FOUND');
  });

  it('hides internal error details behind a generic 500', async () => {
    const { read } = await generate();

    const filter = await read('src/common/filters/all-exceptions.filter.ts');
    expect(filter).toContain("'Internal server error'");
    expect(filter).toContain('this.logger.error');
  });

  it('reads the request ID set by the logging module', async () => {
    const { read } = await generate();

    const filter = await read('src/common/filters/all-exceptions.filter.ts');
    expect(filter).toContain("'x-request-id'");
  });

  it('registers the filter globally from CommonModule', async () => {
    const { read } = await generate();

    const common = await read('src/common/common.module.ts');
    expect(common).toContain('APP_FILTER');
    expect(common).toContain('useClass: AllExceptionsFilter');
    expect(common).toContain(
      "import { AllExceptionsFilter } from './filters/all-exceptions.filter';",
    );
  });

  it('documents the feature in the generated README', async () => {
    const { read } = await generate();

    const readme = await read('README.md');
    expect(readme).toContain('Global error handling');
  });
});
