import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveConfig } from '../../src/config/index.js';
import { generateProject } from '../../src/generators/generate-project.js';
import {
  EditError,
  appendPrismaEnum,
  appendPrismaModel,
  hasPrismaDefinition,
} from '../../src/editing/index.js';

const SCHEMA = `generator client {
  provider = "prisma-client"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id    String @id @default(cuid())
  email String @unique
}
`;

const ORDER = `model Order {
  id        String   @id @default(cuid())
  total     Decimal
  createdAt DateTime @default(now())
}`;

describe('appendPrismaModel', () => {
  it('appends the model after a blank line and ends with a newline', () => {
    const result = appendPrismaModel(SCHEMA, ORDER);

    expect(result.startsWith(SCHEMA.trimEnd())).toBe(true);
    expect(result).toContain(`}\n\n${ORDER}\n`);
    expect(result.endsWith('\n')).toBe(true);
    expect(result.endsWith('\n\n')).toBe(false);
  });

  it('leaves everything before the new model untouched', () => {
    const result = appendPrismaModel(SCHEMA, ORDER);

    expect(result.startsWith(SCHEMA.trimEnd())).toBe(true);
  });

  it('is idempotent', () => {
    const once = appendPrismaModel(SCHEMA, ORDER);

    expect(appendPrismaModel(once, ORDER)).toBe(once);
  });

  it('skips a model whose name already exists, even with different fields', () => {
    const different = `model User {\n  id Int @id\n}`;

    expect(appendPrismaModel(SCHEMA, different)).toBe(SCHEMA);
  });

  it('does not treat a commented-out model as existing', () => {
    const source = `${SCHEMA}\n// model Order {\n//   id String @id\n// }\n`;
    const result = appendPrismaModel(source, ORDER);

    expect(result).toContain(`\n${ORDER}\n`);
  });

  it('does not confuse a longer name with a shorter one', () => {
    const source = `${SCHEMA}\nmodel OrderItem {\n  id String @id\n}\n`;
    const result = appendPrismaModel(source, ORDER);

    expect(hasPrismaDefinition(result, 'Order')).toBe(true);
    expect(result).toContain('model Order {');
  });

  it('handles a schema without a trailing newline', () => {
    const result = appendPrismaModel(SCHEMA.trimEnd(), ORDER);

    expect(result).toContain(`}\n\n${ORDER}\n`);
  });

  it('can add several models one after the other', () => {
    const second = `model Product {\n  id String @id\n}`;
    const result = appendPrismaModel(appendPrismaModel(SCHEMA, ORDER), second);

    expect(result.indexOf('model Order')).toBeLessThan(
      result.indexOf('model Product'),
    );
  });

  it('rejects text that is not a single model block', () => {
    expect(() => appendPrismaModel(SCHEMA, 'nonsense')).toThrow(EditError);
    expect(() => appendPrismaModel(SCHEMA, `${ORDER}\n\n${ORDER}`)).toThrow(
      EditError,
    );
    expect(() =>
      appendPrismaModel(SCHEMA, 'enum Status {\n  A\n}'),
    ).toThrow(/model/);
  });

  it('rejects unbalanced braces', () => {
    expect(() =>
      appendPrismaModel(SCHEMA, 'model Broken {\n  id String @id\n'),
    ).toThrow(EditError);
  });
});

describe('appendPrismaEnum', () => {
  const STATUS = `enum OrderStatus {\n  PENDING\n  PAID\n}`;

  it('appends an enum and is idempotent', () => {
    const once = appendPrismaEnum(SCHEMA, STATUS);

    expect(once).toContain(`}\n\n${STATUS}\n`);
    expect(appendPrismaEnum(once, STATUS)).toBe(once);
  });

  it('rejects a model passed as an enum', () => {
    expect(() => appendPrismaEnum(SCHEMA, ORDER)).toThrow(/enum/);
  });

  it('treats a model and an enum with the same name as a conflict', () => {
    expect(() =>
      appendPrismaEnum(SCHEMA, 'enum User {\n  A\n}'),
    ).toThrow(EditError);
  });
});

describe('hasPrismaDefinition', () => {
  it('finds models and enums by name only', () => {
    const source = appendPrismaEnum(SCHEMA, 'enum Role {\n  USER\n}');

    expect(hasPrismaDefinition(source, 'User')).toBe(true);
    expect(hasPrismaDefinition(source, 'Role')).toBe(true);
    expect(hasPrismaDefinition(source, 'Use')).toBe(false);
    expect(hasPrismaDefinition(source, 'Order')).toBe(false);
  });
});

describe('editing a real generated schema', () => {
  let dir: string;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it.each([
    ['without auth', {}],
    ['with auth', { auth: 'jwt' as const }],
  ])('appends a model without touching the existing ones (%s)', async (_l, o) => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'ironveil-prisma-edit-'));
    const { destination } = await generateProject(
      resolveConfig({ projectName: 'test-api', ...o }),
      dir,
    );
    const original = await readFile(
      path.join(destination, 'prisma/schema.prisma'),
      'utf8',
    );

    const edited = appendPrismaModel(original, ORDER);

    expect(edited.startsWith(original.trimEnd())).toBe(true);
    expect(hasPrismaDefinition(edited, 'User')).toBe(true);
    expect(hasPrismaDefinition(edited, 'Order')).toBe(true);
    expect(appendPrismaModel(edited, ORDER)).toBe(edited);
  });
});
