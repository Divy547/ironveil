import { describe, expect, it } from 'vitest';
import {
  FIELD_TYPES,
  GenerateError,
  parseFields,
} from '../../src/scaffolding/index.js';

describe('parseFields', () => {
  it('returns no fields for an empty spec', () => {
    expect(parseFields('')).toEqual([]);
    expect(parseFields('   ')).toEqual([]);
    expect(parseFields([])).toEqual([]);
  });

  it('parses name:type pairs separated by spaces', () => {
    expect(parseFields('name:string price:decimal')).toEqual([
      { name: 'name', type: 'string', optional: false },
      { name: 'price', type: 'decimal', optional: false },
    ]);
  });

  it('marks a trailing ? as optional', () => {
    expect(parseFields('name:string price:decimal?')).toEqual([
      { name: 'name', type: 'string', optional: false },
      { name: 'price', type: 'decimal', optional: true },
    ]);
  });

  it('also accepts commas and extra whitespace between fields', () => {
    expect(parseFields('  a:int,  b:boolean ,c:text?  ')).toEqual([
      { name: 'a', type: 'int', optional: false },
      { name: 'b', type: 'boolean', optional: false },
      { name: 'c', type: 'text', optional: true },
    ]);
  });

  it('accepts an array of specs (repeated CLI arguments)', () => {
    expect(parseFields(['name:string', 'age:int?'])).toEqual([
      { name: 'name', type: 'string', optional: false },
      { name: 'age', type: 'int', optional: true },
    ]);
  });

  it('is case-insensitive about the type', () => {
    expect(parseFields('title:STRING')).toEqual([
      { name: 'title', type: 'string', optional: false },
    ]);
  });

  it('supports every documented type', () => {
    const spec = Object.keys(FIELD_TYPES)
      .map((type) => `f_${type}:${type}`.replace('_', ''))
      .join(' ');

    expect(parseFields(spec).map((field) => field.type)).toEqual(
      Object.keys(FIELD_TYPES),
    );
    expect(Object.keys(FIELD_TYPES)).toEqual([
      'string',
      'text',
      'int',
      'float',
      'decimal',
      'boolean',
      'datetime',
    ]);
  });

  it.each([
    ['name', /name/],
    ['name:', /name/],
    [':string', /:string/],
    ['name:string:extra', /name:string:extra/],
    ['name:uuid', /uuid/],
    ['name:string?? ', /name:string\?\?/],
  ])('rejects the malformed field %j', (spec, message) => {
    expect(() => parseFields(spec)).toThrow(GenerateError);
    expect(() => parseFields(spec)).toThrow(message);
  });

  it('lists the valid types when the type is unknown', () => {
    expect(() => parseFields('name:varchar')).toThrow(
      /string.*text.*int.*float.*decimal.*boolean.*datetime/,
    );
  });

  it.each(['1name:string', 'Title:string', 'my-name:string', 'my_name:string', 'na me:string'])(
    'rejects the field name in %j',
    (spec) => {
      expect(() => parseFields(spec)).toThrow(GenerateError);
    },
  );

  it.each(['id', 'createdAt', 'updatedAt'])(
    'rejects %s because the generator adds it itself',
    (name) => {
      expect(() => parseFields(`${name}:string`)).toThrow(
        new RegExp(`${name}.*(added|automatic)`, 'i'),
      );
    },
  );

  it('rejects duplicate field names', () => {
    expect(() => parseFields('name:string name:int')).toThrow(
      /duplicate.*name/i,
    );
  });
});

describe('FIELD_TYPES', () => {
  it('maps each type to Prisma, SQL and TypeScript', () => {
    expect(FIELD_TYPES.string).toMatchObject({
      prisma: 'String',
      sql: 'TEXT',
      ts: 'string',
    });
    expect(FIELD_TYPES.int).toMatchObject({
      prisma: 'Int',
      sql: 'INTEGER',
      ts: 'number',
    });
    expect(FIELD_TYPES.float).toMatchObject({
      prisma: 'Float',
      sql: 'DOUBLE PRECISION',
      ts: 'number',
    });
    expect(FIELD_TYPES.decimal).toMatchObject({
      prisma: 'Decimal',
      prismaAttribute: '@db.Decimal(12, 2)',
      sql: 'DECIMAL(12,2)',
      ts: 'number',
    });
    expect(FIELD_TYPES.boolean).toMatchObject({
      prisma: 'Boolean',
      sql: 'BOOLEAN',
      ts: 'boolean',
    });
    expect(FIELD_TYPES.datetime).toMatchObject({
      prisma: 'DateTime',
      sql: 'TIMESTAMP(3)',
      ts: 'string',
    });
  });
});
