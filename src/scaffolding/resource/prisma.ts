import { FIELD_TYPES, type FieldSpec } from '../fields.js';
import type { ResourceNames } from '../names.js';

interface Column {
  readonly name: string;
  readonly type: string;
  readonly attribute?: string;
}

function columns(fields: readonly FieldSpec[]): Column[] {
  return [
    { name: 'id', type: 'String', attribute: '@id @default(cuid())' },
    ...fields.map((field): Column => {
      const spec: { prisma: string; prismaAttribute?: string } =
        FIELD_TYPES[field.type];
      return {
        name: field.name,
        type: `${spec.prisma}${field.optional ? '?' : ''}`,
        attribute: spec.prismaAttribute,
      };
    }),
    { name: 'createdAt', type: 'DateTime', attribute: '@default(now())' },
    { name: 'updatedAt', type: 'DateTime', attribute: '@updatedAt' },
  ];
}

/** A `model` block laid out the way `prisma format` would print it. */
export function buildPrismaModel(
  names: ResourceNames,
  fields: readonly FieldSpec[],
): string {
  const rows = columns(fields);
  const nameWidth = Math.max(...rows.map((row) => row.name.length));
  const typeWidth = Math.max(...rows.map((row) => row.type.length));

  const body = rows.map((row) => {
    const name = row.name.padEnd(nameWidth);
    return row.attribute === undefined
      ? `  ${name} ${row.type}`
      : `  ${name} ${row.type.padEnd(typeWidth)} ${row.attribute}`;
  });

  return [`model ${names.pascal} {`, ...body, '}'].join('\n');
}

/** The SQL `prisma migrate dev` would write for that model (PostgreSQL). */
export function buildMigrationSql(
  names: ResourceNames,
  fields: readonly FieldSpec[],
): string {
  const sqlColumns = [
    '"id" TEXT NOT NULL',
    ...fields.map((field) => {
      const sql = FIELD_TYPES[field.type].sql;
      return `"${field.name}" ${sql}${field.optional ? '' : ' NOT NULL'}`;
    }),
    '"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP',
    '"updatedAt" TIMESTAMP(3) NOT NULL',
  ];

  return [
    '-- CreateTable',
    `CREATE TABLE "${names.pascal}" (`,
    ...sqlColumns.map((column) => `    ${column},`),
    '',
    `    CONSTRAINT "${names.pascal}_pkey" PRIMARY KEY ("id")`,
    ');',
    '',
  ].join('\n');
}
