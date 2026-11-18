import { GenerateError } from './generate-error.js';

export interface FieldTypeSpec {
  /** Prisma scalar type. */
  readonly prisma: string;
  /** Extra Prisma attribute that follows the type, e.g. `@db.Decimal(12, 2)`. */
  readonly prismaAttribute?: string;
  /** The PostgreSQL column type Prisma maps this to (used for the migration). */
  readonly sql: string;
  /** The TypeScript type a DTO property has. */
  readonly ts: 'string' | 'number' | 'boolean';
}

/**
 * Every field type `--fields` accepts. Insertion order is the order shown in
 * help and error messages.
 */
export const FIELD_TYPES = {
  string: { prisma: 'String', sql: 'TEXT', ts: 'string' },
  text: { prisma: 'String', sql: 'TEXT', ts: 'string' },
  int: { prisma: 'Int', sql: 'INTEGER', ts: 'number' },
  float: { prisma: 'Float', sql: 'DOUBLE PRECISION', ts: 'number' },
  decimal: {
    prisma: 'Decimal',
    prismaAttribute: '@db.Decimal(12, 2)',
    sql: 'DECIMAL(12,2)',
    ts: 'number',
  },
  boolean: { prisma: 'Boolean', sql: 'BOOLEAN', ts: 'boolean' },
  // Sent as an ISO 8601 string, which Prisma accepts for a DateTime column.
  datetime: { prisma: 'DateTime', sql: 'TIMESTAMP(3)', ts: 'string' },
} as const satisfies Record<string, FieldTypeSpec>;

export type FieldType = keyof typeof FIELD_TYPES;

export interface FieldSpec {
  readonly name: string;
  readonly type: FieldType;
  readonly optional: boolean;
}

const FIELD_NAME_PATTERN = /^[a-z][A-Za-z0-9]*$/;

// Added to every model by the generator.
const AUTOMATIC_FIELDS = new Set(['id', 'createdAt', 'updatedAt']);

const isFieldType = (value: string): value is FieldType =>
  Object.hasOwn(FIELD_TYPES, value);

/**
 * Parses `"name:string price:decimal?"` (or an array of such strings, as the
 * CLI collects them). Fields are separated by whitespace and/or commas; a
 * trailing `?` makes the column optional.
 */
export function parseFields(input: string | readonly string[]): FieldSpec[] {
  const text = typeof input === 'string' ? input : input.join(' ');
  const tokens = text.split(/[\s,]+/).filter((token) => token !== '');

  const fields: FieldSpec[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    const field = parseField(token);

    if (seen.has(field.name)) {
      throw new GenerateError(`Duplicate field "${field.name}".`);
    }
    seen.add(field.name);
    fields.push(field);
  }

  return fields;
}

function parseField(token: string): FieldSpec {
  const match = /^([^:]+):([^:?]+)(\?)?$/.exec(token);

  if (match === null) {
    throw new GenerateError(
      `Invalid field "${token}". Use name:type, with an optional ? after the type, for example "price:decimal?".`,
    );
  }

  const [, name = '', rawType = '', optionalMark] = match;
  const type = rawType.toLowerCase();

  if (!FIELD_NAME_PATTERN.test(name)) {
    throw new GenerateError(
      `Invalid field name "${name}": use camelCase letters and digits, starting with a lowercase letter.`,
    );
  }

  if (AUTOMATIC_FIELDS.has(name)) {
    throw new GenerateError(
      `"${name}" is added automatically to every resource; remove it from --fields.`,
    );
  }

  if (!isFieldType(type)) {
    throw new GenerateError(
      `Unknown field type "${rawType}" in "${token}". Valid types: ${Object.keys(FIELD_TYPES).join(', ')}.`,
    );
  }

  return { name, type, optional: optionalMark === '?' };
}
