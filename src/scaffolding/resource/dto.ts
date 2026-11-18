import { FIELD_TYPES, type FieldSpec } from '../fields.js';
import type { ResourceNames } from '../names.js';
import { file, namedImport } from './code.js';

type Mode = 'create' | 'update';

interface RenderedField {
  readonly lines: string[];
  readonly validators: string[];
  readonly swagger: string;
}

function validatorsFor(
  field: FieldSpec,
  mode: Mode,
): { decorators: string[]; imports: string[] } {
  const decorators: string[] = [];
  const imports: string[] = [];
  const use = (name: string, code: string): void => {
    imports.push(name);
    decorators.push(code);
  };

  if (field.optional) {
    use('IsOptional', '@IsOptional()');
  } else if (mode === 'update') {
    // The column is required, so PATCH may leave it out but must never send null.
    use('ValidateIf', '@ValidateIf((_, value) => value !== undefined)');
  }

  switch (field.type) {
    case 'string':
    case 'text':
      use('IsString', '@IsString()');
      if (!field.optional) {
        use('IsNotEmpty', '@IsNotEmpty()');
      }
      if (field.type === 'string') {
        use('MaxLength', '@MaxLength(255)');
      }
      break;
    case 'int':
      use('IsInt', '@IsInt()');
      break;
    case 'float':
      use('IsNumber', '@IsNumber()');
      break;
    case 'decimal':
      use('IsNumber', '@IsNumber({ maxDecimalPlaces: 2 })');
      break;
    case 'boolean':
      use('IsBoolean', '@IsBoolean()');
      break;
    case 'datetime':
      use('IsDateString', '@IsDateString()');
      break;
  }

  return { decorators, imports };
}

function renderField(field: FieldSpec, mode: Mode, swagger: boolean): RenderedField {
  const { decorators, imports } = validatorsFor(field, mode);
  const required = mode === 'create' && !field.optional;
  const tsType = FIELD_TYPES[field.type].ts;

  const lines: string[] = [];
  let swaggerName = '';

  if (swagger) {
    swaggerName = required ? 'ApiProperty' : 'ApiPropertyOptional';
    const options = field.type === 'datetime' ? "{ format: 'date-time' }" : '';
    lines.push(`  @${swaggerName}(${options})`);
  }

  lines.push(...decorators.map((decorator) => `  ${decorator}`));
  lines.push(`  ${field.name}${required ? '!' : '?'}: ${tsType};`);

  return { lines, validators: imports, swagger: swaggerName };
}

/** A create-style DTO class with any class name, shared with `generate dto`. */
export function buildDtoClass(
  className: string,
  fields: readonly FieldSpec[],
  swagger: boolean,
): string {
  return buildDto(className, fields, 'create', swagger);
}

function buildDto(
  className: string,
  fields: readonly FieldSpec[],
  mode: Mode,
  swagger: boolean,
): string {
  const rendered = fields.map((field) => renderField(field, mode, swagger));

  const validatorImports = [...new Set(rendered.flatMap((r) => r.validators))];
  const swaggerImports = [
    ...new Set(rendered.map((r) => r.swagger).filter((name) => name !== '')),
  ];

  const header: string[] = [];
  if (swaggerImports.length > 0) {
    header.push(namedImport(swaggerImports, '@nestjs/swagger'));
  }
  if (validatorImports.length > 0) {
    header.push(namedImport(validatorImports, 'class-validator'));
  }

  const body: string[] = [];
  rendered.forEach((field, index) => {
    if (index > 0) {
      body.push('');
    }
    body.push(...field.lines);
  });

  return file([
    ...header,
    ...(header.length > 0 ? [''] : []),
    ...(body.length === 0
      ? [`export class ${className} {}`]
      : [`export class ${className} {`, ...body, '}']),
  ]);
}

export function buildCreateDto(
  names: ResourceNames,
  fields: readonly FieldSpec[],
  swagger: boolean,
): string {
  return buildDto(`Create${names.pascal}Dto`, fields, 'create', swagger);
}

export function buildUpdateDto(
  names: ResourceNames,
  fields: readonly FieldSpec[],
  swagger: boolean,
): string {
  return buildDto(`Update${names.pascal}Dto`, fields, 'update', swagger);
}
